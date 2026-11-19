import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import http from "http";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

// Explicit test configuration
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET;
const ISOLATED_TEST_DB = "govai_phase6a_test";
const TEST_PORT = 5025;
const RESTART_TEST_PORT = 5026;

if (!MONGO_URI || !JWT_SECRET) {
  console.error("FATAL: MONGO_URI or JWT_SECRET is missing from environment.");
  process.exit(1);
}

// Set process flags so src/config/db.js permits the test db
process.env.MONGO_DB_NAME = ISOLATED_TEST_DB;
process.env.ALLOW_TEST_DB = "true";
process.env.NODE_ENV = "test";
process.env.ENABLE_SLA_JOB = "false";
process.env.GEMINI_API_KEY = "test-mock-gemini-key";

// Intercept Gemini API calls via global fetch mocking
const originalFetch = globalThis.fetch;
let geminiMockMode = "success"; // "success", "timeout", "rate_limit", "invalid_json"

globalThis.fetch = async (url, options) => {
  const urlStr = typeof url === "string" ? url : url?.toString?.() || "";
  if (urlStr.includes("generativelanguage.googleapis.com")) {
    if (geminiMockMode === "timeout") {
      const err = new Error("The operation was aborted due to timeout");
      err.name = "TimeoutError";
      throw err;
    }
    if (geminiMockMode === "rate_limit") {
      return {
        ok: false,
        status: 429,
        text: async () =>
          JSON.stringify({
            error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "Resource exhausted" },
          }),
      };
    }
    if (geminiMockMode === "invalid_json") {
      return {
        ok: true,
        status: 200,
        text: async () => "Truncated non-json response {",
      };
    }
    // Default success: High/Critical priority road repair
    return {
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      detectedLanguage: "English",
                      englishTranslation: "Deep pothole on Main Road causing severe hazard.",
                      category: "Road & Infrastructure",
                      priority: "Critical",
                      urgencyScore: 9,
                      confidence: 0.96,
                      reasoning: "High traffic intersection with severe road damage.",
                      detectedIssue: "Deep road crater",
                      affectedArea: "Main Road Cross 5",
                      recommendedDepartment: "Road & Infrastructure",
                      recommendedAction: "Dispatch emergency road crew with asphalt",
                    }),
                  },
                ],
              },
            },
          ],
        }),
    };
  }
  return originalFetch(url, options);
};

import app from "../src/app.js";
import { User } from "../src/models/User.js";
import { Member } from "../src/models/Member.js";
import { Complaint } from "../src/models/Complaint.js";
import { Feedback } from "../src/models/Feedback.js";
import { Notification } from "../src/models/Notification.js";
import { initializeNotificationSocket } from "../src/services/notificationSocket.service.js";
import { runOverdueSlaJob } from "../src/services/slaEscalation.service.js";
import { calculateSlaState } from "../src/services/sla.service.js";

let totalAssertions = 0;
let passedAssertions = 0;
let failedAssertions = 0;

function assert(condition, message) {
  totalAssertions++;
  if (!condition) {
    failedAssertions++;
    console.error(`  FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  passedAssertions++;
  console.log(`  PASS: ${message}`);
}

async function request(port, method, path, { token, body } = {}) {
  const url = `http://127.0.0.1:${port}${path}`;
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await originalFetch(url, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  let data = null;
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      data = await res.json();
    } catch {
      data = null;
    }
  } else {
    data = await res.text();
  }

  return { status: res.status, data, headers: res.headers };
}

async function run() {
  console.log("================================================================================");
  console.log("PHASE 6A: COMPLETE COMPLAINT LIFECYCLE E2E INTEGRATION SUITE");
  console.log("================================================================================");

  // ── Step 1: Database Setup & Isolation ──
  console.log("\n[1] Verifying Isolated Test Database Environment...");
  await mongoose.connect(MONGO_URI, {
    dbName: ISOLATED_TEST_DB,
    serverSelectionTimeoutMS: 10000,
  });

  const connectedDb = mongoose.connection.db.databaseName;
  console.log(`Connected Database: "${connectedDb}"`);
  assert(connectedDb === ISOLATED_TEST_DB, `Must connect to "${ISOLATED_TEST_DB}"`);
  assert(connectedDb !== "govai", "CRITICAL: Must NEVER connect to live 'govai' database");

  // Clean test database collections
  await mongoose.connection.db.collection("complaints").deleteMany({});
  await mongoose.connection.db.collection("feedbacks").deleteMany({});
  await mongoose.connection.db.collection("notifications").deleteMany({});
  await mongoose.connection.db.collection("members").deleteMany({});
  await mongoose.connection.db.collection("users").deleteMany({});

  // Sync indexes from Mongoose schemas
  await Promise.all([
    User.syncIndexes(),
    Member.syncIndexes(),
    Complaint.syncIndexes(),
    Feedback.syncIndexes(),
    Notification.syncIndexes(),
  ]);
  console.log("  Index initialization verified in isolated test database.");

  // ── Step 2: Seed Test Users & Department Members ──
  console.log("\n[2] Seeding Lifecycle Test Actors...");
  // Users (User schema pre-save automatically hashes password)
  const plainPassword = "Password123!";

  const citizenA = await User.create({
    name: "Citizen Alice",
    email: "citizen.alice@test.govai",
    password: plainPassword,
    role: "citizen",
    status: "active",
  });

  const citizenB = await User.create({
    name: "Citizen Bob",
    email: "citizen.bob@test.govai",
    password: plainPassword,
    role: "citizen",
    status: "active",
  });

  const inactiveCitizen = await User.create({
    name: "Inactive Citizen",
    email: "citizen.inactive@test.govai",
    password: plainPassword,
    role: "citizen",
    status: "pending",
  });

  const roadAuth = await User.create({
    name: "Road Authority Leader",
    email: "road.authority@test.govai",
    password: plainPassword,
    role: "department",
    department: "Road & Infrastructure",
    departmentRole: "authority",
    status: "active",
  });

  const waterAuth = await User.create({
    name: "Water Authority Leader",
    email: "water.authority@test.govai",
    password: plainPassword,
    role: "department",
    department: "Water Supply",
    departmentRole: "authority",
    status: "active",
  });

  const roadOfficerUser = await User.create({
    name: "Officer Priya (Road)",
    email: "officer.priya@test.govai",
    password: plainPassword,
    role: "department",
    department: "Road & Infrastructure",
    departmentRole: "officer",
    status: "active",
  });

  const otherRoadOfficerUser = await User.create({
    name: "Officer Raman (Road 2)",
    email: "officer.raman@test.govai",
    password: plainPassword,
    role: "department",
    department: "Road & Infrastructure",
    departmentRole: "officer",
    status: "active",
  });

  const waterOfficerUser = await User.create({
    name: "Officer Rajesh (Water)",
    email: "officer.rajesh@test.govai",
    password: plainPassword,
    role: "department",
    department: "Water Supply",
    departmentRole: "officer",
    status: "active",
  });

  const adminUser = await User.create({
    name: "Super Admin",
    email: "admin@test.govai",
    password: plainPassword,
    role: "admin",
    status: "active",
  });

  // Members
  const roadMember1 = await Member.create({
    name: "Field Officer Priya",
    department: "Road & Infrastructure",
    userId: roadOfficerUser._id,
  });

  const roadMember2 = await Member.create({
    name: "Field Officer Raman",
    department: "Road & Infrastructure",
    userId: otherRoadOfficerUser._id,
  });

  const waterMember1 = await Member.create({
    name: "Field Officer Rajesh",
    department: "Water Supply",
    userId: waterOfficerUser._id,
  });

  console.log("  Seeded 9 test users and 3 department members.");

  // Start HTTP Server
  const server = http.createServer(app);
  initializeNotificationSocket(server);
  await new Promise((resolve) => server.listen(TEST_PORT, resolve));
  console.log(`  Test HTTP server running on port ${TEST_PORT}`);

  // ── Step 3: Authentication & Security Boundaries ──
  console.log("\n[3] Testing Authentication & RBAC Login Guards...");
  const loginResA = await request(TEST_PORT, "POST", "/api/auth/login", {
    body: { email: citizenA.email, password: "Password123!" },
  });
  assert(loginResA.status === 200, "Citizen A login returns HTTP 200");
  const citizenTokenA = loginResA.data.token;
  assert(typeof citizenTokenA === "string" && citizenTokenA.length > 20, "Citizen A receives valid JWT");

  const loginResB = await request(TEST_PORT, "POST", "/api/auth/login", {
    body: { email: citizenB.email, password: "Password123!" },
  });
  const citizenTokenB = loginResB.data.token;

  const loginInactive = await request(TEST_PORT, "POST", "/api/auth/login", {
    body: { email: inactiveCitizen.email, password: "Password123!" },
  });
  assert(loginInactive.status === 403, "Inactive user login is rejected with HTTP 403");

  const loginBadPass = await request(TEST_PORT, "POST", "/api/auth/login", {
    body: { email: citizenA.email, password: "WrongPassword!" },
  });
  assert(loginBadPass.status === 401, "Invalid password rejected with HTTP 401");

  const loginRoadAuth = await request(TEST_PORT, "POST", "/api/auth/login", {
    body: { email: roadAuth.email, password: "Password123!" },
  });
  const roadAuthToken = loginRoadAuth.data.token;

  const loginWaterAuth = await request(TEST_PORT, "POST", "/api/auth/login", {
    body: { email: waterAuth.email, password: "Password123!" },
  });
  const waterAuthToken = loginWaterAuth.data.token;

  const loginRoadOfficer = await request(TEST_PORT, "POST", "/api/auth/login", {
    body: { email: roadOfficerUser.email, password: "Password123!" },
  });
  const roadOfficerToken = loginRoadOfficer.data.token;

  const loginOtherRoadOfficer = await request(TEST_PORT, "POST", "/api/auth/login", {
    body: { email: otherRoadOfficerUser.email, password: "Password123!" },
  });
  const otherRoadOfficerToken = loginOtherRoadOfficer.data.token;

  const loginAdmin = await request(TEST_PORT, "POST", "/api/auth/login", {
    body: { email: adminUser.email, password: "Password123!" },
  });
  const adminToken = loginAdmin.data.token;

  // Unauthenticated requests
  const noAuthRes = await request(TEST_PORT, "GET", "/api/complaints/my");
  assert(noAuthRes.status === 401, "Unauthenticated request returns HTTP 401");

  // Citizen attempting authority route
  const citizenOnDept = await request(TEST_PORT, "GET", "/api/complaints/department", {
    token: citizenTokenA,
  });
  assert(citizenOnDept.status === 403, "Citizen forbidden from department management (HTTP 403)");

  // ── Step 4: Complaint Submission & Idempotency ──
  console.log("\n[4] Testing Complaint Intake & Idempotency Protection...");

  // Missing required fields
  const invalidRes = await request(TEST_PORT, "POST", "/api/complaints", {
    token: citizenTokenA,
    body: { title: "", description: "Leak", category: "Water Supply" },
  });
  assert(invalidRes.status === 400, "Missing title rejected with HTTP 400");

  const invalidCatRes = await request(TEST_PORT, "POST", "/api/complaints", {
    token: citizenTokenA,
    body: { title: "Road issue", description: "Pothole", category: "InvalidCategory" },
  });
  assert(invalidCatRes.status === 400, "Invalid category rejected with HTTP 400");

  // Valid submission (Gemini mock in success mode: Critical priority)
  geminiMockMode = "success";
  const clientReqId = "req-e2e-001";
  const submitRes = await request(TEST_PORT, "POST", "/api/complaints", {
    token: citizenTokenA,
    body: {
      title: "Dangerous pothole near crossroad",
      description: "Deep pothole causing vehicle accidents on Main Road.",
      category: "Road & Infrastructure",
      location: "Main Road Cross 5",
      latitude: 28.6139,
      longitude: 77.2090,
      clientRequestId: clientReqId,
    },
  });

  assert(submitRes.status === 201, "Valid complaint creation returns HTTP 201");
  const complaintId = submitRes.data._id || submitRes.data.id;
  assert(Boolean(complaintId), "Created complaint has a valid ID");
  assert(submitRes.data.status === "Pending", "Initial status is 'Pending'");
  assert(submitRes.data.category === "Road & Infrastructure", "Category is preserved");
  assert(submitRes.data.clientRequestId === clientReqId, "clientRequestId is persisted");

  // Independent database verification
  const dbComplaint = await Complaint.findById(complaintId);
  assert(Boolean(dbComplaint), "Complaint document is persisted in MongoDB");
  assert(dbComplaint.createdBy.toString() === citizenA._id.toString(), "Complaint createdBy belongs to Citizen A");
  assert(dbComplaint.timeline.length >= 3, "Initial timeline events are recorded");

  // Timeline events check
  const eventTypes = dbComplaint.timeline.map((t) => t.eventType);
  assert(eventTypes.includes("complaint_created"), "Timeline contains 'complaint_created'");
  assert(eventTypes.includes("department_assigned"), "Timeline contains 'department_assigned'");
  assert(eventTypes.includes("sla_started"), "Timeline contains 'sla_started'");

  // SLA adjustment verification (AI detected Critical -> duration 4h / 240m)
  assert(dbComplaint.aiAnalysis?.priority === "Critical", "Gemini analysis assigned 'Critical' priority");
  assert(dbComplaint.sla.durationMinutes === 240, "SLA duration updated to 240 mins (4h) for Critical");

  // Idempotency check 1: clientRequestId duplicate
  const duplicateReqIdRes = await request(TEST_PORT, "POST", "/api/complaints", {
    token: citizenTokenA,
    body: {
      title: "Different title",
      description: "Different description",
      category: "Road & Infrastructure",
      clientRequestId: clientReqId,
    },
  });
  assert(duplicateReqIdRes.status === 200, "Duplicate clientRequestId returns HTTP 200");
  const dupId1 = duplicateReqIdRes.data._id || duplicateReqIdRes.data.id;
  assert(dupId1.toString() === complaintId.toString(), "Returns original complaint record");

  // Idempotency check 2: rapid duplicate within 30 seconds
  const rapidDuplicateRes = await request(TEST_PORT, "POST", "/api/complaints", {
    token: citizenTokenA,
    body: {
      title: "Dangerous pothole near crossroad",
      description: "Deep pothole causing vehicle accidents on Main Road.",
      category: "Road & Infrastructure",
    },
  });
  assert(rapidDuplicateRes.status === 200, "Rapid duplicate content returns HTTP 200");
  const dupId2 = rapidDuplicateRes.data._id || rapidDuplicateRes.data.id;
  assert(dupId2.toString() === complaintId.toString(), "Returns original complaint record without second insert");

  // Check department notification was created
  const intakeNotifs = await Notification.find({
    userId: roadAuth._id,
    "meta.type": "complaint_submitted",
  });
  assert(intakeNotifs.length >= 1, "Department authority received intake notification");

  // ── Step 5: Gemini AI Reliability & Fallback Modes ──
  console.log("\n[5] Testing Gemini AI Fallback, Timeout & Retry Logic...");

  // Timeout failure scenario
  geminiMockMode = "timeout";
  const timeoutComplaintRes = await request(TEST_PORT, "POST", "/api/complaints", {
    token: citizenTokenA,
    body: {
      title: "Water pipe broken",
      description: "Water gushing out onto street",
      category: "Water Supply",
    },
  });
  assert(timeoutComplaintRes.status === 201, "Complaint persists even when Gemini times out (HTTP 201)");
  const timeoutComplaintId = timeoutComplaintRes.data._id || timeoutComplaintRes.data.id;
  const timeoutDbDoc = await Complaint.findById(timeoutComplaintId);
  assert(timeoutDbDoc.aiAnalysis?.status === "failed", "AI analysis marked as 'failed'");
  assert(timeoutDbDoc.aiAnalysis?.errorCategory === "TIMEOUT", "Error category is TIMEOUT");
  assert(timeoutDbDoc.sla.durationMinutes === 4320, "Fallback Medium SLA (72h / 4320m) preserved");

  // Rate limit (429) scenario
  geminiMockMode = "rate_limit";
  const rateLimitComplaintRes = await request(TEST_PORT, "POST", "/api/complaints", {
    token: citizenTokenA,
    body: {
      title: "Broken streetlight",
      description: "Dark street corner dangerous at night",
      category: "Electricity",
    },
  });
  assert(rateLimitComplaintRes.status === 201, "Complaint persists during Gemini 429 rate limit");
  const rateLimitDbDoc = await Complaint.findById(rateLimitComplaintRes.data._id || rateLimitComplaintRes.data.id);
  assert(rateLimitDbDoc.aiAnalysis?.status === "failed", "AI analysis marked 'failed' under 429");
  assert(rateLimitDbDoc.aiAnalysis?.errorCategory === "PROVIDER_RATE_LIMITED", "Error category is PROVIDER_RATE_LIMITED");

  // Invalid JSON response scenario
  geminiMockMode = "invalid_json";
  const invalidJsonComplaintRes = await request(TEST_PORT, "POST", "/api/complaints", {
    token: citizenTokenA,
    body: {
      title: "Garbage pileup",
      description: "Waste not collected for 2 weeks",
      category: "Environment",
    },
  });
  assert(invalidJsonComplaintRes.status === 201, "Complaint persists when Gemini returns invalid JSON");
  const invalidJsonDbDoc = await Complaint.findById(invalidJsonComplaintRes.data._id || invalidJsonComplaintRes.data.id);
  assert(invalidJsonDbDoc.aiAnalysis?.status === "failed", "AI analysis marked 'failed' on invalid JSON");

  // Manual Retry AI test
  // 1. Citizen cannot retry
  const citizenRetry = await request(TEST_PORT, "POST", `/api/complaints/${timeoutComplaintId}/retry-ai`, {
    token: citizenTokenA,
  });
  assert(citizenRetry.status === 403, "Citizen forbidden from retrying AI (HTTP 403)");

  // 2. Wrong department authority cannot retry
  const wrongDeptRetry = await request(TEST_PORT, "POST", `/api/complaints/${timeoutComplaintId}/retry-ai`, {
    token: roadAuthToken, // Timeout complaint belongs to Water Supply
  });
  assert(wrongDeptRetry.status === 403, "Wrong department authority cannot retry AI (HTTP 403)");

  // 3. Authorized Water Authority can retry
  geminiMockMode = "success";
  // Wait to respect rate-limit cooldown
  await new Promise((r) => setTimeout(r, 100));
  // Artificially age lastAttemptAt to avoid 10s cooldown
  await Complaint.updateOne(
    { _id: timeoutComplaintId },
    { "aiAnalysis.lastAttemptAt": new Date(Date.now() - 15000) }
  );

  const authRetry = await request(TEST_PORT, "POST", `/api/complaints/${timeoutComplaintId}/retry-ai`, {
    token: waterAuthToken,
  });
  assert(authRetry.status === 200, "Authorized department authority retries AI successfully (HTTP 200)");
  const retriedDoc = await Complaint.findById(timeoutComplaintId);
  assert(retriedDoc.aiAnalysis?.status === "completed", "Retried AI status is 'completed'");

  // Cooldown rule enforcement
  const immediateRetry = await request(TEST_PORT, "POST", `/api/complaints/${timeoutComplaintId}/retry-ai`, {
    token: waterAuthToken,
  });
  // If already completed it returns 200 with notice, or if within 10s on failed it returns 429
  assert(immediateRetry.status === 200 || immediateRetry.status === 429, "Retry follows cooldown / completion guards");

  // ── Step 6: Department Authority Assignment ──
  console.log("\n[6] Testing Department Authority Review & Officer Assignment...");

  // Road Authority lists complaints
  const deptComplaintsRes = await request(TEST_PORT, "GET", "/api/complaints/department", {
    token: roadAuthToken,
  });
  assert(deptComplaintsRes.status === 200, "Road Authority lists complaints (HTTP 200)");
  const foundRoadComplaint = deptComplaintsRes.data.some(
    (c) => (c._id || c.id).toString() === complaintId.toString()
  );
  assert(foundRoadComplaint, "Road Authority sees the created road complaint");

  // Water Authority does not see road complaint
  const waterDeptComplaintsRes = await request(TEST_PORT, "GET", "/api/complaints/department", {
    token: waterAuthToken,
  });
  const waterSeesRoad = waterDeptComplaintsRes.data.some(
    (c) => (c._id || c.id).toString() === complaintId.toString()
  );
  assert(!waterSeesRoad, "Water Authority cannot see Road & Infrastructure complaints");

  // Cross-department assignment rejection: Road Auth assigning Water Member
  const crossAssignRes = await request(TEST_PORT, "PUT", `/api/complaints/${complaintId}/assign`, {
    token: roadAuthToken,
    body: { memberId: waterMember1._id.toString() },
  });
  assert(crossAssignRes.status === 400, "Cross-department assignment rejected with HTTP 400");

  // Cross-department authority access rejection: Water Auth modifying Road complaint
  const wrongAuthAssignRes = await request(TEST_PORT, "PUT", `/api/complaints/${complaintId}/assign`, {
    token: waterAuthToken,
    body: { memberId: roadMember1._id.toString() },
  });
  assert(wrongAuthAssignRes.status === 403, "Water Authority cannot modify Road complaint (HTTP 403)");

  // Officer attempting to assign complaint
  const officerAssignRes = await request(TEST_PORT, "PUT", `/api/complaints/${complaintId}/assign`, {
    token: roadOfficerToken,
    body: { memberId: roadMember1._id.toString() },
  });
  assert(officerAssignRes.status === 403, "Officer forbidden from assigning complaints (HTTP 403)");

  // Valid assignment by Road Authority to roadMember1
  const validAssignRes = await request(TEST_PORT, "PUT", `/api/complaints/${complaintId}/assign`, {
    token: roadAuthToken,
    body: { memberId: roadMember1._id.toString() },
  });
  assert(validAssignRes.status === 200, "Valid officer assignment returns HTTP 200");
  assert(validAssignRes.data.status === "Assigned", "Complaint status updated to 'Assigned'");
  const assignedAssigneeId = validAssignRes.data.assignedTo?._id || validAssignRes.data.assignedTo?.id;
  assert(assignedAssigneeId.toString() === roadMember1._id.toString(), "AssignedTo matches roadMember1 ID");

  // Verify notifications persisted: citizen and linked officer
  const citizenAssignNotif = await Notification.findOne({
    userId: citizenA._id,
    "meta.complaintId": complaintId.toString(),
    "meta.type": "complaint_assigned",
  });
  assert(Boolean(citizenAssignNotif), "Citizen owner received complaint_assigned notification");

  const officerAssignNotif = await Notification.findOne({
    userId: roadOfficerUser._id,
    "meta.complaintId": complaintId.toString(),
    "meta.type": "complaint_assigned",
  });
  assert(Boolean(officerAssignNotif), "Linked Officer User received complaint_assigned notification");

  // ── Step 7: Officer Workflow & Status Transitions ──
  console.log("\n[7] Testing Officer Execution, Status Transitions & Unauthorized Guards...");

  // Officer Priya views assigned complaints
  const officerAssignedRes = await request(TEST_PORT, "GET", "/api/complaints/my-assigned", {
    token: roadOfficerToken,
  });
  assert(officerAssignedRes.status === 200, "Officer lists assigned complaints (HTTP 200)");
  const priyaHasComplaint = officerAssignedRes.data.some(
    (c) => (c._id || c.id).toString() === complaintId.toString()
  );
  assert(priyaHasComplaint, "Officer Priya sees the assigned complaint");

  // Officer Raman (Member 2) does not see Priya's complaint
  const ramanAssignedRes = await request(TEST_PORT, "GET", "/api/complaints/my-assigned", {
    token: otherRoadOfficerToken,
  });
  const ramanHasComplaint = ramanAssignedRes.data.some(
    (c) => (c._id || c.id).toString() === complaintId.toString()
  );
  assert(!ramanHasComplaint, "Officer Raman cannot see complaints assigned to Officer Priya");

  // Officer Raman attempting to update Priya's complaint
  const ramanUpdateRes = await request(TEST_PORT, "PUT", `/api/complaints/${complaintId}/status`, {
    token: otherRoadOfficerToken,
    body: { status: "In Progress" },
  });
  assert(ramanUpdateRes.status === 403, "Unassigned Officer rejected with HTTP 403");

  // Permitted Transition 1: Assigned -> In Progress
  const inProgressRes = await request(TEST_PORT, "PUT", `/api/complaints/${complaintId}/status`, {
    token: roadOfficerToken,
    body: { status: "In Progress" },
  });
  assert(inProgressRes.status === 200, "Officer Priya marks 'In Progress' (HTTP 200)");
  assert(inProgressRes.data.status === "In Progress", "Status is now 'In Progress'");

  // Permitted Transition 2: In Progress -> Resolved
  const resolvedRes = await request(TEST_PORT, "PUT", `/api/complaints/${complaintId}/status`, {
    token: roadOfficerToken,
    body: { status: "Resolved" },
  });
  assert(resolvedRes.status === 200, "Officer Priya marks 'Resolved' (HTTP 200)");
  assert(resolvedRes.data.status === "Resolved", "Status is now 'Resolved'");

  // Verify resolvedAt timestamp persistence
  const resolvedDbDoc = await Complaint.findById(complaintId);
  assert(Boolean(resolvedDbDoc.sla?.resolvedAt), "sla.resolvedAt timestamp is persisted");
  assert(
    resolvedDbDoc.sla.resolvedAt instanceof Date || !isNaN(new Date(resolvedDbDoc.sla.resolvedAt).getTime()),
    "resolvedAt is a valid Date"
  );

  // Check SLA state function after resolution
  const slaStateAfterResolution = calculateSlaState(resolvedDbDoc);
  assert(slaStateAfterResolution.slaStatus === "Resolved", "SLA status computes to 'Resolved'");
  assert(slaStateAfterResolution.isOverdue === false, "Resolved complaint is not overdue");
  assert(slaStateAfterResolution.remainingMs === 0, "Remaining ms is 0 for resolved");

  // Check citizen resolution notification
  const citizenResolvedNotif = await Notification.findOne({
    userId: citizenA._id,
    "meta.complaintId": complaintId.toString(),
    "meta.type": "complaint_resolved",
  });
  assert(Boolean(citizenResolvedNotif), "Citizen received complaint_resolved notification");

  // ── Step 8: Timeline Ordering & SLA Escalation Deduplication ──
  console.log("\n[8] Testing Timeline Event Order & SLA Escalation Deduplication...");

  const timelineEvents = resolvedDbDoc.timeline.map((t) => t.eventType);
  const statusChangedCount = timelineEvents.filter((t) => t === "status_changed").length;
  assert(statusChangedCount >= 2, "Recorded at least 2 status_changed timeline events");

  // Run SLA escalation on resolved complaint -> Should NOT escalate
  const escalationRun1 = await runOverdueSlaJob();
  assert(escalationRun1.escalated === 0, "No escalation for resolved complaints");

  // Create an artificial overdue pending complaint to verify escalation deduplication
  const overdueComplaint = await Complaint.create({
    title: "Overdue Road Hazard",
    description: "Unattended road hazard",
    category: "Road & Infrastructure",
    status: "Pending",
    createdBy: citizenA._id,
    sla: {
      startedAt: new Date(Date.now() - 50 * 3600 * 1000),
      durationMinutes: 1440,
      deadline: new Date(Date.now() - 26 * 3600 * 1000), // 26 hours ago
    },
  });

  const escalationRun2 = await runOverdueSlaJob();
  assert(escalationRun2.escalated >= 1, "Overdue complaint escalated successfully");

  // Re-run immediately: Deduplication ensures it is not escalated a second time
  const escalationRun3 = await runOverdueSlaJob();
  assert(escalationRun3.escalated === 0, "Escalation job deduplicates previously escalated complaint");

  // ── Step 9: Citizen Resolution Feedback Workflow ──
  console.log("\n[9] Testing Citizen Feedback, 1-to-1 Constraint & Reopening Behavior...");

  // Feedback on non-resolved complaint
  const feedbackOnPending = await request(TEST_PORT, "POST", "/api/feedback", {
    token: citizenTokenA,
    body: {
      complaintId: overdueComplaint._id.toString(),
      rating: 5,
      workCompleted: true,
      percentDone: 100,
    },
  });
  assert(feedbackOnPending.status === 400, "Feedback on unresolved complaint rejected (HTTP 400)");

  // Non-owner feedback rejection (Citizen B on Citizen A's complaint)
  const nonOwnerFeedback = await request(TEST_PORT, "POST", "/api/feedback", {
    token: citizenTokenB,
    body: {
      complaintId: complaintId.toString(),
      rating: 4,
      workCompleted: true,
      percentDone: 100,
    },
  });
  assert(nonOwnerFeedback.status === 403, "Non-owner feedback rejected with HTTP 403");

  // Rating validation
  const invalidRating0 = await request(TEST_PORT, "POST", "/api/feedback", {
    token: citizenTokenA,
    body: {
      complaintId: complaintId.toString(),
      rating: 0,
      workCompleted: true,
      percentDone: 100,
    },
  });
  assert(invalidRating0.status === 400, "Rating 0 rejected (HTTP 400)");

  const invalidRating6 = await request(TEST_PORT, "POST", "/api/feedback", {
    token: citizenTokenA,
    body: {
      complaintId: complaintId.toString(),
      rating: 6,
      workCompleted: true,
      percentDone: 100,
    },
  });
  assert(invalidRating6.status === 400, "Rating 6 rejected (HTTP 400)");

  // Valid feedback submission
  const validFeedbackRes = await request(TEST_PORT, "POST", "/api/feedback", {
    token: citizenTokenA,
    body: {
      complaintId: complaintId.toString(),
      rating: 5,
      comment: "Pothole filled smoothly and road cleared quickly. Great work!",
      workCompleted: true,
      percentDone: 100,
    },
  });
  assert(validFeedbackRes.status === 201, "Valid feedback submission returns HTTP 201");
  const feedbackId = validFeedbackRes.data._id || validFeedbackRes.data.id;
  assert(Boolean(feedbackId), "Feedback has valid document ID");

  // Verify 1-to-1 relationship in DB
  const dbFeedback = await Feedback.findOne({ complaintId });
  assert(Boolean(dbFeedback), "Feedback document persisted in MongoDB");
  assert(dbFeedback.rating === 5, "Persisted rating matches submitted 5");

  const complaintWithFeedback = await Complaint.findById(complaintId);
  assert(
    complaintWithFeedback.feedback?.toString() === dbFeedback._id.toString(),
    "Complaint.feedback reference matches Feedback._id"
  );

  // Department feedback notification check
  const deptFeedbackNotif = await Notification.findOne({
    userId: roadAuth._id,
    "meta.type": "complaint_feedback_received",
  });
  assert(Boolean(deptFeedbackNotif), "Department authority received feedback notification");

  // Duplicate submission: upsert behavior
  const duplicateFeedbackRes = await request(TEST_PORT, "POST", "/api/feedback", {
    token: citizenTokenA,
    body: {
      complaintId: complaintId.toString(),
      rating: 4,
      comment: "Updated feedback: Road markings still needed.",
      workCompleted: true,
      percentDone: 95,
    },
  });
  assert(duplicateFeedbackRes.status === 201, "Repeated feedback request succeeds via upsert");
  const feedbackDocsCount = await Feedback.countDocuments({ complaintId });
  assert(feedbackDocsCount === 1, "Strict 1-to-1 constraint: exactly 1 feedback document exists");
  const updatedDbFeedback = await Feedback.findOne({ complaintId });
  assert(updatedDbFeedback.rating === 4, "Upserted feedback rating updated to 4");

  // Observed behavior when complaint is reopened after feedback exists
  console.log("  Testing observed behavior when complaint is reopened after feedback...");
  const reopenRes = await request(TEST_PORT, "PUT", `/api/complaints/${complaintId}/status`, {
    token: roadOfficerToken,
    body: { status: "In Progress" },
  });
  assert(reopenRes.status === 200, "Officer reopens complaint to 'In Progress'");
  const reopenedDbComplaint = await Complaint.findById(complaintId);
  assert(reopenedDbComplaint.status === "In Progress", "Complaint status is 'In Progress'");
  assert(reopenedDbComplaint.sla.resolvedAt === undefined, "resolvedAt is cleared upon reopening");
  assert(
    Boolean(reopenedDbComplaint.feedback),
    "Observed behavior: Existing feedback reference is preserved when complaint is reopened"
  );

  // Close server for restart test
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  console.log("  Server stopped and database disconnected for restart test.");

  // ── Step 10: Server Restart & Persistence Verification ──
  console.log("\n[10] Testing Server Restart & Complete Persistence Invariants...");

  await mongoose.connect(MONGO_URI, {
    dbName: ISOLATED_TEST_DB,
    serverSelectionTimeoutMS: 10000,
  });
  const restartServer = http.createServer(app);
  initializeNotificationSocket(restartServer);
  await new Promise((resolve) => restartServer.listen(RESTART_TEST_PORT, resolve));
  console.log(`  Restarted server running on new port ${RESTART_TEST_PORT}`);

  // Fetch reopened complaint via API
  const restartedComplaintRes = await request(
    RESTART_TEST_PORT,
    "GET",
    `/api/complaints/${complaintId}`,
    { token: citizenTokenA }
  );
  assert(restartedComplaintRes.status === 200, "Complaint retrieved successfully after restart");
  assert(restartedComplaintRes.data.title === "Dangerous pothole near crossroad", "Title persists across restart");
  assert(
    restartedComplaintRes.data.category === "Road & Infrastructure",
    "Category persists across restart"
  );
  assert(
    restartedComplaintRes.data.assignedTo?.name === "Field Officer Priya",
    "Assigned officer relationship persists across restart"
  );
  assert(
    Boolean(restartedComplaintRes.data.feedback),
    "Feedback relationship persists across restart"
  );
  assert(
    restartedComplaintRes.data.feedback?.rating === 4,
    "Feedback rating 4 persists across restart"
  );

  // Fetch notifications across restart
  const restartedNotifsRes = await request(
    RESTART_TEST_PORT,
    "GET",
    "/api/notifications",
    { token: citizenTokenA }
  );
  assert(restartedNotifsRes.status === 200, "Notifications retrieved successfully after restart");
  assert(restartedNotifsRes.data.length >= 2, "Historical notifications remain intact after restart");

  // Clean up restart server
  await new Promise((resolve) => restartServer.close(resolve));
  await mongoose.disconnect();
  console.log("  Restart server stopped and test database connection closed cleanly.");

  // ── Step 11: Cleanup & Drop Isolated Test Database ──
  console.log("\n[11] Tearing Down & Dropping Isolated Test Database...");
  await mongoose.connect(MONGO_URI, {
    dbName: ISOLATED_TEST_DB,
    serverSelectionTimeoutMS: 10000,
  });

  const cleanupDbName = mongoose.connection.db.databaseName;
  console.log(`  Connected for teardown: "${cleanupDbName}"`);
  assert(cleanupDbName === ISOLATED_TEST_DB, `Safety check: Connected DB must be "${ISOLATED_TEST_DB}"`);
  assert(cleanupDbName !== "govai", "CRITICAL SAFETY: Refusing to drop live 'govai' database!");

  await mongoose.connection.db.dropDatabase();
  console.log(`  PASS: Successfully dropped temporary test database "${ISOLATED_TEST_DB}".`);
  await mongoose.disconnect();

  // ── Step 12: Post-Test Safety Audit of Original 'govai' Database ──
  console.log("\n[12] Verifying Original MongoDB Atlas 'govai' Database Safety (Δ = 0)...");
  await mongoose.connect(MONGO_URI, {
    dbName: "govai",
    serverSelectionTimeoutMS: 10000,
  });

  const liveDb = mongoose.connection.db;
  const liveDbName = liveDb.databaseName;
  assert(liveDbName === "govai", "Connected explicitly to 'govai' for read-only safety audit");

  const liveCounts = {
    complaints: await liveDb.collection("complaints").countDocuments(),
    users: await liveDb.collection("users").countDocuments(),
    members: await liveDb.collection("members").countDocuments(),
    feedbacks: await liveDb.collection("feedbacks").countDocuments(),
    notifications: await liveDb.collection("notifications").countDocuments(),
  };

  const expectedCounts = {
    complaints: 18,
    users: 22,
    members: 4,
    feedbacks: 0,
    notifications: 14,
  };

  for (const [col, expected] of Object.entries(expectedCounts)) {
    const actual = liveCounts[col];
    const diff = actual - expected;
    assert(diff === 0, `Original '${col}' count preserved (Expected: ${expected}, Actual: ${actual}, Δ = ${diff})`);
  }
  console.log("  PASS: All 5 live Atlas collections remain completely untouched (Δ = 0).");
  await mongoose.disconnect();

  // ── Summary ──
  console.log("\n================================================================================");
  console.log("PHASE 6A E2E INTEGRATION TEST SUMMARY");
  console.log("================================================================================");
  console.log(`Total Assertions Checked : ${totalAssertions}`);
  console.log(`Assertions Passed        : ${passedAssertions}`);
  console.log(`Assertions Failed        : ${failedAssertions}`);
  console.log(`Test Database Used       : ${ISOLATED_TEST_DB}`);
  console.log("================================================================================");

  if (failedAssertions > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("FATAL ERROR in Phase 6A E2E Integration Suite:", err);
  process.exit(1);
});
