import http from "http";
import path from "path";
import os from "os";
import fs from "fs";
import crypto from "crypto";
import dotenv from "../backend/node_modules/dotenv/lib/main.js";
import jwt from "../backend/node_modules/jsonwebtoken/index.js";
import mongoose from "../backend/node_modules/mongoose/index.js";

// Load environment variables from backend/.env
const envPath = path.resolve(process.cwd(), "backend/.env");
dotenv.config({ path: envPath, override: true });

// SAFETY GUARDS - Enforce dedicated test database
const TEST_DB_NAME = "govai_phase7b_test";
process.env.NODE_ENV = "test";
process.env.ALLOW_TEST_DB = "true";
process.env.MONGO_DB_NAME = TEST_DB_NAME;

const testUploadDir = path.join(os.tmpdir(), `govai-phase7b-test-uploads-${Date.now()}`);
process.env.EVIDENCE_UPLOAD_DIR = testUploadDir;

// Dynamic import of app and models after env configuration
const { default: app } = await import("../backend/src/app.js");
const { User } = await import("../backend/src/models/User.js");
const { Member } = await import("../backend/src/models/Member.js");
const { Complaint } = await import("../backend/src/models/Complaint.js");
const { Feedback } = await import("../backend/src/models/Feedback.js");
const { Notification } = await import("../backend/src/models/Notification.js");

const JWT_SECRET = process.env.JWT_SECRET || "change_me_and_keep_secret";

// Minimal valid JPEG header buffer (> 12 bytes, starts with FF D8 FF)
const createDummyJpeg = () => {
  return Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
    0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
    0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
  ]);
};

const results = [];
const logResult = (num, name, passed, details = "") => {
  results.push({ num, name, passed, details });
  console.log(`[${passed ? "PASS" : "FAIL"}] Step ${num}: ${name} ${details ? "- " + details : ""}`);
};

async function run() {
  console.log("===============================================================================");
  console.log("PHASE 7B ISOLATED MONGODB INTEGRATION TEST");
  console.log("Target Database: " + TEST_DB_NAME);
  console.log("===============================================================================");

  // 1. Database Safety Guard & Connection
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI not configured");

  await mongoose.connect(uri, {
    dbName: TEST_DB_NAME,
    serverSelectionTimeoutMS: 10000,
  });

  const effectiveDbName = mongoose.connection.name;
  const actualDbName = mongoose.connection.db?.databaseName;

  console.log(`Connected to host: ${mongoose.connection.host}`);
  console.log(`Mongoose connection.name: "${effectiveDbName}"`);
  console.log(`Driver databaseName: "${actualDbName}"`);

  // MANDATORY SAFETY CHECKS
  if (effectiveDbName === "govai" || actualDbName === "govai") {
    throw new Error("CRITICAL SAFETY HALT: Refusing to proceed! Connected to production database 'govai'.");
  }
  if (!effectiveDbName.startsWith("govai_phase7b_") || !actualDbName.startsWith("govai_phase7b_")) {
    throw new Error(`CRITICAL SAFETY HALT: Database name "${effectiveDbName}" does not match test prefix.`);
  }

  // Clear previous test collection data in the isolated test DB if any
  await User.deleteMany({});
  await Member.deleteMany({});
  await Complaint.deleteMany({});
  await Feedback.deleteMany({});
  await Notification.deleteMany({});

  // 2. Start ephemeral HTTP server
  let serverPort = 5199;
  const server = http.createServer(app);
  await new Promise((resolve) => {
    server.listen(serverPort, () => {
      serverPort = server.address().port;
      console.log(`Ephemeral test backend listening on port ${serverPort}`);
      resolve();
    });
  });

  const baseUrl = `http://127.0.0.1:${serverPort}`;

  try {
    // 3. Create isolated test user fixtures
    const citizenA = await User.create({
      name: "Test Citizen A (Owner)",
      email: `citizen_a_${Date.now()}@test.internal`,
      password: "Password123!",
      role: "citizen",
      status: "active",
    });

    const citizenB = await User.create({
      name: "Test Citizen B (Unrelated)",
      email: `citizen_b_${Date.now()}@test.internal`,
      password: "Password123!",
      role: "citizen",
      status: "active",
    });

    const officerWater1 = await User.create({
      name: "Test Officer Water 1 (Assigned)",
      email: `officer_w1_${Date.now()}@test.internal`,
      password: "Password123!",
      role: "department",
      departmentRole: "officer",
      department: "Water Supply",
      status: "active",
    });

    const officerWater2 = await User.create({
      name: "Test Officer Water 2 (Unassigned)",
      email: `officer_w2_${Date.now()}@test.internal`,
      password: "Password123!",
      role: "department",
      departmentRole: "officer",
      department: "Water Supply",
      status: "active",
    });

    const authorityWater = await User.create({
      name: "Test Authority Water (Same Dept)",
      email: `authority_w_${Date.now()}@test.internal`,
      password: "Password123!",
      role: "department",
      departmentRole: "authority",
      department: "Water Supply",
      status: "active",
    });

    const authorityRoads = await User.create({
      name: "Test Authority Roads (Cross Dept)",
      email: `authority_r_${Date.now()}@test.internal`,
      password: "Password123!",
      role: "department",
      departmentRole: "authority",
      department: "Road & Infrastructure",
      status: "active",
    });

    const adminUser = await User.create({
      name: "Test Admin",
      email: `admin_${Date.now()}@test.internal`,
      password: "Password123!",
      role: "admin",
      status: "active",
    });

    // Create Member records for the field officers
    const memberOfficer1 = await Member.create({
      name: officerWater1.name,
      department: "Water Supply",
      userId: officerWater1._id,
      createdBy: adminUser._id,
    });

    const memberOfficer2 = await Member.create({
      name: officerWater2.name,
      department: "Water Supply",
      userId: officerWater2._id,
      createdBy: adminUser._id,
    });

    // Generate JWT tokens
    const tokenCitizenA = jwt.sign({ id: citizenA._id, role: "citizen" }, JWT_SECRET);
    const tokenCitizenB = jwt.sign({ id: citizenB._id, role: "citizen" }, JWT_SECRET);
    const tokenOfficer1 = jwt.sign({ id: officerWater1._id, role: "department" }, JWT_SECRET);
    const tokenOfficer2 = jwt.sign({ id: officerWater2._id, role: "department" }, JWT_SECRET);
    const tokenAuthWater = jwt.sign({ id: authorityWater._id, role: "department" }, JWT_SECRET);
    const tokenAuthRoads = jwt.sign({ id: authorityRoads._id, role: "department" }, JWT_SECRET);
    const tokenAdmin = jwt.sign({ id: adminUser._id, role: "admin" }, JWT_SECRET);

    // Create test complaint owned by CitizenA
    const initialComplaint = await Complaint.create({
      title: "Test Burst Pipe on Main St",
      description: "Severe water leak flooding the basement",
      category: "Water Supply",
      status: "Assigned",
      createdBy: citizenA._id,
      assignedTo: memberOfficer1._id,
      sla: {
        startedAt: new Date(),
        durationMinutes: 4320,
        deadline: new Date(Date.now() + 4320 * 60000),
      },
    });

    const complaintId = initialComplaint._id.toString();
    console.log(`Created test complaint ${complaintId} assigned to Member ${memberOfficer1._id}`);

    // STEP 12: Verify feedback cannot be submitted before resolution
    {
      const res = await fetch(`${baseUrl}/api/feedback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenCitizenA}`,
        },
        body: JSON.stringify({
          complaintId,
          rating: 4,
          comment: "Too early feedback",
          workCompleted: false,
          percentDone: 20,
        }),
      });
      const data = await res.json();
      const passed = res.status === 400 && data.message?.includes("Feedback allowed only when resolved");
      logResult(12, "Verify feedback cannot be submitted before resolution", passed, `Status ${res.status}: ${data.message}`);
    }

    // Set complaint to "In Progress" before resolving
    {
      await Complaint.findByIdAndUpdate(complaintId, { status: "In Progress" });
    }

    // STEP 1 & 2: Resolve complaint with mandatory remarks and optional evidence
    let resolutionId1 = null;
    let evidenceKey1 = null;
    {
      const formData = new FormData();
      formData.append("status", "Resolved");
      formData.append("remarks", "Repaired ruptured pipe fitting with reinforced sleeve.");
      const dummyJpeg = createDummyJpeg();
      formData.append("evidence", new Blob([dummyJpeg], { type: "image/jpeg" }), "repair_v1.jpg");

      const res = await fetch(`${baseUrl}/api/complaints/${complaintId}/status`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${tokenOfficer1}`,
        },
        body: formData,
      });

      const data = await res.json();
      const history = data.resolutionHistory || [];
      const entry = history[0];

      const pass1 = res.status === 200 && data.status === "Resolved";
      const resolvedById = (entry?.resolvedBy?._id || entry?.resolvedBy?.id || entry?.resolvedBy)?.toString();
      const pass2 =
        history.length === 1 &&
        entry?.remarks === "Repaired ruptured pipe fitting with reinforced sleeve." &&
        resolvedById === officerWater1._id.toString() &&
        Boolean(entry?.resolvedAt) &&
        Boolean(entry?.evidence);

      resolutionId1 = entry?._id?.toString() || entry?.id?.toString();
      evidenceKey1 = entry?.evidence;

      logResult(1, "Resolve complaint with mandatory remarks and optional evidence", pass1, `Status: ${data.status}`);
      logResult(2, "Verify resolutionHistory entry appended with resolvedBy and resolvedAt", pass2, `entry._id: ${resolutionId1}, evidence: ${evidenceKey1}`);
    }

    // STEP 3: Submit citizen feedback for that resolution
    {
      const res = await fetch(`${baseUrl}/api/feedback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenCitizenA}`,
        },
        body: JSON.stringify({
          complaintId,
          rating: 5,
          comment: "Excellent repair job, no more leaks!",
          workCompleted: true,
          percentDone: 100,
        }),
      });

      const data = await res.json();
      const passed =
        res.status === 201 &&
        data.resolutionId?.toString() === resolutionId1 &&
        data.rating === 5 &&
        data.history?.length === 0;

      logResult(3, "Submit citizen feedback for resolution 1", passed, `Feedback resolutionId: ${data.resolutionId}`);
    }

    // STEP 11: Verify duplicate feedback for the same resolution is rejected
    {
      const res = await fetch(`${baseUrl}/api/feedback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenCitizenA}`,
        },
        body: JSON.stringify({
          complaintId,
          rating: 4,
          comment: "Duplicate submission attempt",
          workCompleted: true,
          percentDone: 100,
        }),
      });

      const data = await res.json();
      const passed =
        res.status === 400 &&
        data.message?.includes("Feedback has already been submitted for this resolution attempt");

      logResult(11, "Verify duplicate feedback for the same resolution is rejected", passed, `Status ${res.status}: ${data.message}`);
    }

    // STEP 4 & 5: Reopen the complaint and verify resolution history & feedback remain preserved
    {
      const formData = new FormData();
      formData.append("status", "In Progress");

      const res = await fetch(`${baseUrl}/api/complaints/${complaintId}/status`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${tokenOfficer1}`,
        },
        body: formData,
      });

      const data = await res.json();
      const dbComplaint = await Complaint.findById(complaintId);
      const dbFeedback = await Feedback.findOne({ complaintId });

      const pass4 = res.status === 200 && data.status === "In Progress";
      const pass5 =
        dbComplaint.resolutionHistory?.length === 1 &&
        dbComplaint.resolutionHistory[0].remarks === "Repaired ruptured pipe fitting with reinforced sleeve." &&
        dbComplaint.sla?.resolvedAt === undefined &&
        dbFeedback !== null &&
        dbFeedback.rating === 5;

      logResult(4, "Reopen the complaint to In Progress", pass4, `Complaint status: ${data.status}`);
      logResult(5, "Verify previous resolution history and feedback remain preserved", pass5, `Preserved history entries: ${dbComplaint.resolutionHistory?.length}`);
    }

    // STEP 6 & 7: Resolve the complaint again with different remarks and verify second entry appended
    let resolutionId2 = null;
    let evidenceKey2 = null;
    {
      const formData = new FormData();
      formData.append("status", "Resolved");
      formData.append("remarks", "Replaced secondary valve gasket and applied weather seal.");
      const dummyJpeg2 = createDummyJpeg();
      formData.append("evidence", new Blob([dummyJpeg2], { type: "image/jpeg" }), "repair_v2.jpg");

      const res = await fetch(`${baseUrl}/api/complaints/${complaintId}/status`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${tokenOfficer1}`,
        },
        body: formData,
      });

      const data = await res.json();
      const history = data.resolutionHistory || [];
      const entry2 = history[1];

      const resolvedById2 = (entry2?.resolvedBy?._id || entry2?.resolvedBy?.id || entry2?.resolvedBy)?.toString();
      const pass6 = res.status === 200 && data.status === "Resolved";
      const pass7 =
        history.length === 2 &&
        entry2?.remarks === "Replaced secondary valve gasket and applied weather seal." &&
        resolvedById2 === officerWater1._id.toString() &&
        Boolean(entry2?.resolvedAt) &&
        Boolean(entry2?.evidence);

      resolutionId2 = entry2?._id?.toString() || entry2?.id?.toString();
      evidenceKey2 = entry2?.evidence;

      logResult(6, "Resolve complaint again with different remarks", pass6, `Status: ${data.status}`);
      logResult(7, "Verify a second resolutionHistory entry is appended", pass7, `Total entries: ${history.length}, entry2._id: ${resolutionId2}`);
    }

    // STEP 8, 9, 10: Submit new feedback for the second resolution
    {
      const res = await fetch(`${baseUrl}/api/feedback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenCitizenA}`,
        },
        body: JSON.stringify({
          complaintId,
          rating: 4,
          comment: "Leak completely resolved after second repair. Satisfied.",
          workCompleted: true,
          percentDone: 100,
        }),
      });

      const data = await res.json();
      const pass8 = res.status === 201;
      const pass9 =
        data.history?.length === 1 &&
        data.history[0].rating === 5 &&
        data.history[0].comment === "Excellent repair job, no more leaks!" &&
        data.history[0].resolutionId?.toString() === resolutionId1;
      const pass10 = data.resolutionId?.toString() === resolutionId2 && data.rating === 4;

      logResult(8, "Submit new feedback for the second resolution", pass8, `HTTP ${res.status}`);
      logResult(9, "Verify the first feedback is archived in feedback.history", pass9, `Archived count: ${data.history?.length}, archived rating: ${data.history?.[0]?.rating}`);
      logResult(10, "Verify current feedback references second resolutionId", pass10, `Current resolutionId: ${data.resolutionId}`);
    }

    // STEP 13: Verify previous resolution evidence remains retrievable using its entryId
    {
      const res1 = await fetch(`${baseUrl}/api/complaints/${complaintId}/resolution-evidence?entryId=${resolutionId1}`, {
        headers: { Authorization: `Bearer ${tokenCitizenA}` },
      });
      const buf1 = await res1.arrayBuffer();

      const res2 = await fetch(`${baseUrl}/api/complaints/${complaintId}/resolution-evidence?entryId=${resolutionId2}`, {
        headers: { Authorization: `Bearer ${tokenCitizenA}` },
      });
      const buf2 = await res2.arrayBuffer();

      const passed =
        res1.status === 200 &&
        res1.headers.get("content-type") === "image/jpeg" &&
        buf1.byteLength > 0 &&
        res2.status === 200 &&
        res2.headers.get("content-type") === "image/jpeg" &&
        buf2.byteLength > 0;

      logResult(13, "Verify previous resolution evidence remains retrievable using entryId", passed, `Entry1: ${res1.status} (${buf1.byteLength} bytes), Entry2: ${res2.status} (${buf2.byteLength} bytes)`);
    }

    // RBAC VERIFICATION
    console.log("-------------------------------------------------------------------------------");
    console.log("RBAC VERIFICATION:");
    {
      // 1. Citizen owner: allowed
      const resCitizenOwner = await fetch(`${baseUrl}/api/complaints/${complaintId}/resolution-evidence?entryId=${resolutionId2}`, {
        headers: { Authorization: `Bearer ${tokenCitizenA}` },
      });
      logResult("RBAC-1", "Citizen owner access to resolution evidence", resCitizenOwner.status === 200, `Status: ${resCitizenOwner.status}`);

      // 2. Unrelated Citizen (cross-citizen): 403 Forbidden
      const resCitizenOther = await fetch(`${baseUrl}/api/complaints/${complaintId}/resolution-evidence?entryId=${resolutionId2}`, {
        headers: { Authorization: `Bearer ${tokenCitizenB}` },
      });
      logResult("RBAC-2", "Cross-citizen access denial (403)", resCitizenOther.status === 403, `Status: ${resCitizenOther.status}`);

      // 3. Same-department Authority: allowed
      const resAuthWater = await fetch(`${baseUrl}/api/complaints/${complaintId}/resolution-evidence?entryId=${resolutionId2}`, {
        headers: { Authorization: `Bearer ${tokenAuthWater}` },
      });
      logResult("RBAC-3", "Same-department Authority access (200)", resAuthWater.status === 200, `Status: ${resAuthWater.status}`);

      // 4. Cross-department Authority: 403 Forbidden
      const resAuthRoads = await fetch(`${baseUrl}/api/complaints/${complaintId}/resolution-evidence?entryId=${resolutionId2}`, {
        headers: { Authorization: `Bearer ${tokenAuthRoads}` },
      });
      logResult("RBAC-4", "Cross-department Authority access denial (403)", resAuthRoads.status === 403, `Status: ${resAuthRoads.status}`);

      // 5. Assigned Field Officer: allowed
      const resOfficerAssigned = await fetch(`${baseUrl}/api/complaints/${complaintId}/resolution-evidence?entryId=${resolutionId2}`, {
        headers: { Authorization: `Bearer ${tokenOfficer1}` },
      });
      logResult("RBAC-5", "Assigned Field Officer access (200)", resOfficerAssigned.status === 200, `Status: ${resOfficerAssigned.status}`);

      // 6. Unassigned Field Officer: 403 Forbidden
      const resOfficerUnassigned = await fetch(`${baseUrl}/api/complaints/${complaintId}/resolution-evidence?entryId=${resolutionId2}`, {
        headers: { Authorization: `Bearer ${tokenOfficer2}` },
      });
      logResult("RBAC-6", "Unassigned Field Officer access denial (403)", resOfficerUnassigned.status === 403, `Status: ${resOfficerUnassigned.status}`);

      // 7. Admin: allowed
      const resAdmin = await fetch(`${baseUrl}/api/complaints/${complaintId}/resolution-evidence?entryId=${resolutionId2}`, {
        headers: { Authorization: `Bearer ${tokenAdmin}` },
      });
      logResult("RBAC-7", "Admin access (200)", resAdmin.status === 200, `Status: ${resAdmin.status}`);
    }

    // STEP 14: Restart the backend and verify resolution and feedback history persist
    console.log("-------------------------------------------------------------------------------");
    console.log("SIMULATING BACKEND RESTART & VERIFYING PERSISTENCE:");
    {
      // Close ephemeral HTTP server
      await new Promise((resolve) => server.close(resolve));
      // Disconnect mongoose
      await mongoose.disconnect();

      // Reconnect to test DB
      await mongoose.connect(uri, {
        dbName: TEST_DB_NAME,
        serverSelectionTimeoutMS: 10000,
      });

      const restartedComplaint = await Complaint.findById(complaintId).lean();
      const restartedFeedback = await Feedback.findOne({ complaintId }).lean();

      const passRestart =
        restartedComplaint?.resolutionHistory?.length === 2 &&
        restartedComplaint.resolutionHistory[0].remarks === "Repaired ruptured pipe fitting with reinforced sleeve." &&
        restartedComplaint.resolutionHistory[1].remarks === "Replaced secondary valve gasket and applied weather seal." &&
        restartedFeedback?.history?.length === 1 &&
        restartedFeedback.history[0].rating === 5 &&
        restartedFeedback.rating === 4 &&
        restartedFeedback.resolutionId?.toString() === resolutionId2;

      logResult(14, "Restart backend and verify resolution and feedback history persist", passRestart, `Persisted resolutionHistory: ${restartedComplaint?.resolutionHistory?.length}, feedbackHistory: ${restartedFeedback?.history?.length}`);
    }

  } finally {
    // TASK 6 Cleanup
    console.log("===============================================================================");
    console.log("TASK 6: CLEANUP AND ATLAS SAFETY AUDIT");
    console.log("===============================================================================");

    const currentDb = mongoose.connection.name;
    const rawDb = mongoose.connection.db?.databaseName;

    if (currentDb.startsWith("govai_phase7b_") && currentDb !== "govai" && rawDb !== "govai") {
      console.log(`Dropping isolated test database "${currentDb}"...`);
      await mongoose.connection.dropDatabase();
      console.log(`Database "${currentDb}" successfully dropped.`);
    } else {
      console.error(`SAFETY ALERT: Current database name "${currentDb}" is not an isolated test db! Skipping drop.`);
    }

    // Clean up temporary uploads directory
    try {
      if (fs.existsSync(testUploadDir)) {
        fs.rmSync(testUploadDir, { recursive: true, force: true });
        console.log(`Cleaned up temporary upload directory: ${testUploadDir}`);
      }
    } catch (e) {
      console.warn("Upload cleanup warning:", e.message);
    }

    // Disconnect from test DB
    await mongoose.disconnect();

    // Connect strictly READ-ONLY to live `govai` and report final counts
    console.log("Connecting strictly READ-ONLY to live database 'govai' to verify collection counts...");
    await mongoose.connect(uri, {
      dbName: "govai",
      serverSelectionTimeoutMS: 10000,
    });

    const liveDbName = mongoose.connection.name;
    console.log(`Live DB Connection verified: ${liveDbName}`);

    const counts = {
      complaints: await Complaint.countDocuments(),
      users: await User.countDocuments(),
      members: await Member.countDocuments(),
      feedbacks: await Feedback.countDocuments(),
      notifications: await Notification.countDocuments(),
    };

    console.log("LIVE ATLAS 'govai' AUDITED COLLECTION COUNTS:");
    console.log(JSON.stringify(counts, null, 2));

    await mongoose.disconnect();
  }

  // Summary
  console.log("===============================================================================");
  console.log("ISOLATED INTEGRATION TEST SUMMARY:");
  const allPassed = results.every((r) => r.passed);
  console.log(`Total checks: ${results.length} | Passed: ${results.filter((r) => r.passed).length} | Failed: ${results.filter((r) => !r.passed).length}`);
  console.log(`Overall Result: ${allPassed ? "ALL TESTS PASSED (PASS)" : "SOME TESTS FAILED (FAIL)"}`);
  console.log("===============================================================================");

  if (!allPassed) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("FATAL ERROR in isolated integration test:", err);
  process.exit(1);
});
