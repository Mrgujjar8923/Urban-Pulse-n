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
const ISOLATED_TEST_DB = "govai_phase5e_test";
const TEST_PORT = 5005;
const RESTART_TEST_PORT = 5006;

if (!MONGO_URI || !JWT_SECRET) {
  console.error("FATAL: MONGO_URI or JWT_SECRET is missing from environment.");
  process.exit(1);
}

// Set process flags so src/config/db.js permits the test db
process.env.MONGO_DB_NAME = ISOLATED_TEST_DB;
process.env.ALLOW_TEST_DB = "true";
process.env.NODE_ENV = "test";
process.env.ENABLE_SLA_JOB = "false";

import app from "../src/app.js";
import { User } from "../src/models/User.js";
import { Member } from "../src/models/Member.js";

const sampleObjectId = () => new mongoose.Types.ObjectId().toString();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function run() {
  console.log("================================================================================");
  console.log("PHASE 5E.2: REAL MONGODB INTEGRATION & PERSISTENCE VERIFICATION");
  console.log("================================================================================");

  // ── Step 1: Database Environment Setup ──
  console.log("\n[1] Verifying Isolated Database Environment Setup...");
  await mongoose.connect(MONGO_URI, {
    dbName: ISOLATED_TEST_DB,
    serverSelectionTimeoutMS: 10000,
  });

  const connectedHost = mongoose.connection.host;
  const connectedDb = mongoose.connection.db.databaseName;
  const readyState = mongoose.connection.readyState;

  console.log(`Connected Host: ${connectedHost}`);
  console.log(`Effective Connected Database: "${connectedDb}"`);
  console.log(`Connection readyState: ${readyState}`);

  // CRITICAL INVARIANT: Verify we are NOT in govai
  if (connectedDb !== ISOLATED_TEST_DB) {
    throw new Error(`CRITICAL ABORT: Connected database is "${connectedDb}", expected "${ISOLATED_TEST_DB}"! Refusing to run tests.`);
  }
  if (connectedDb === "govai") {
    throw new Error("CRITICAL ABORT: Refusing to run write tests against live 'govai' database!");
  }
  console.log("✓ Safety check passed: Connected explicitly to isolated test database.");

  // Clean test database collections
  await mongoose.connection.db.collection("members").deleteMany({});
  await mongoose.connection.db.collection("users").deleteMany({});

  // Ensure partial unique index on members.userId
  await mongoose.connection.db.collection("members").createIndex(
    { userId: 1 },
    { unique: true, partialFilterExpression: { userId: { $type: "objectId" } } }
  );
  console.log("✓ Partial unique index on Member.userId verified.");

  // ── Step 2: Prepare Isolated Test Data ──
  console.log("\n[2] Seeding Isolated Test Data in", ISOLATED_TEST_DB, "...");
  const hashedPassword = await bcrypt.hash("Password123!", 10);

  // 1. Admin
  const adminDoc = await User.create({
    name: "Test System Administrator",
    email: "admin.test@govai.test",
    password: hashedPassword,
    role: "admin",
    status: "active",
  });

  // 2. Active Road Officer
  const roadOfficerDoc = await User.create({
    name: "Test Road Field Officer",
    email: "road.officer.test@govai.test",
    password: hashedPassword,
    role: "department",
    department: "Road & Infrastructure",
    departmentRole: "officer",
    status: "active",
  });

  // 3. Active Water Officer
  const waterOfficerDoc = await User.create({
    name: "Test Water Field Officer",
    email: "water.officer.test@govai.test",
    password: hashedPassword,
    role: "department",
    department: "Water Supply",
    departmentRole: "officer",
    status: "active",
  });

  // 4. Road Authority
  const roadAuthorityDoc = await User.create({
    name: "Test Road Authority",
    email: "road.authority.test@govai.test",
    password: hashedPassword,
    role: "department",
    department: "Road & Infrastructure",
    departmentRole: "authority",
    status: "active",
  });

  // 5. Water Authority
  const waterAuthorityDoc = await User.create({
    name: "Test Water Authority",
    email: "water.authority.test@govai.test",
    password: hashedPassword,
    role: "department",
    department: "Water Supply",
    departmentRole: "authority",
    status: "active",
  });

  // 6. Inactive Officer
  const inactiveOfficerDoc = await User.create({
    name: "Test Inactive Officer",
    email: "inactive.officer.test@govai.test",
    password: hashedPassword,
    role: "department",
    department: "Water Supply",
    departmentRole: "officer",
    status: "pending",
  });

  // 7. Citizen
  const citizenDoc = await User.create({
    name: "Test Citizen User",
    email: "citizen.test@govai.test",
    password: hashedPassword,
    role: "citizen",
    status: "active",
  });

  // 8. Existing Linked Member (Road & Infrastructure -> roadOfficerDoc)
  const linkedMemberDoc = await Member.create({
    name: "Test Member Priya (Linked)",
    department: "Road & Infrastructure",
    userId: roadOfficerDoc._id,
    createdBy: adminDoc._id,
  });

  // 9. Existing Unlinked Member (Water Supply -> null)
  const unlinkedMemberDoc = await Member.create({
    name: "Test Member Rajesh (Unlinked)",
    department: "Water Supply",
    userId: null,
    createdBy: adminDoc._id,
  });

  console.log("✓ Seeded isolated records:");
  console.log(`  - Admin: ${adminDoc.email} (${adminDoc._id})`);
  console.log(`  - Road Officer: ${roadOfficerDoc.email} (${roadOfficerDoc._id})`);
  console.log(`  - Water Officer: ${waterOfficerDoc.email} (${waterOfficerDoc._id})`);
  console.log(`  - Road Authority: ${roadAuthorityDoc.email} (${roadAuthorityDoc._id})`);
  console.log(`  - Water Authority: ${waterAuthorityDoc.email} (${waterAuthorityDoc._id})`);
  console.log(`  - Inactive Officer: ${inactiveOfficerDoc.email} (${inactiveOfficerDoc._id})`);
  console.log(`  - Citizen: ${citizenDoc.email} (${citizenDoc._id})`);
  console.log(`  - Linked Member: ${linkedMemberDoc.name} (${linkedMemberDoc._id}) -> ${roadOfficerDoc._id}`);
  console.log(`  - Unlinked Member: ${unlinkedMemberDoc.name} (${unlinkedMemberDoc._id}) -> null`);

  // Tokens
  const signToken = (user) => jwt.sign({ id: user._id.toString() }, JWT_SECRET, { expiresIn: "1h" });
  const adminToken = signToken(adminDoc);
  const roadOfficerToken = signToken(roadOfficerDoc);
  const waterOfficerToken = signToken(waterOfficerDoc);
  const roadAuthorityToken = signToken(roadAuthorityDoc);
  const waterAuthorityToken = signToken(waterAuthorityDoc);
  const citizenToken = signToken(citizenDoc);

  // ── Step 3: Start Real Test HTTP Server ──
  let testServer = http.createServer(app);
  await new Promise((resolve) => testServer.listen(TEST_PORT, resolve));
  console.log(`\n[3] Test HTTP Server listening at http://127.0.0.1:${TEST_PORT}`);

  const baseUrl = `http://127.0.0.1:${TEST_PORT}`;

  // Helper fetch function
  const apiCall = async (endpoint, { method = "GET", token = null, body = null } = {}) => {
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${baseUrl}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => null);
    return { status: res.status, ok: res.ok, body: data };
  };

  console.log("\n=======================================================");
  console.log("RUNNING REAL HTTP API INTEGRATION TESTS");
  console.log("=======================================================");

  // ── Test 1: Create Member Without Officer ──
  console.log("\nTest 1: Create Member Without Officer (POST /api/members)...");
  const t1Res = await apiCall("/api/members", {
    method: "POST",
    token: adminToken,
    body: {
      name: "Test Unlinked Member Alpha",
      department: "Electricity",
    },
  });
  console.log(`HTTP ${t1Res.status}:`, t1Res.body);
  if (t1Res.status !== 201) throw new Error(`Test 1 Failed: expected 201, got ${t1Res.status}`);
  if (t1Res.body.name !== "Test Unlinked Member Alpha" || t1Res.body.userId !== null) {
    throw new Error(`Test 1 Failed: unexpected response body ${JSON.stringify(t1Res.body)}`);
  }

  // Verify in MongoDB
  const t1DbDoc = await Member.findById(t1Res.body._id).lean();
  if (!t1DbDoc || t1DbDoc.userId !== null) {
    throw new Error("Test 1 Failed: MongoDB record does not have userId === null");
  }
  console.log("✓ Test 1 Passed: Member created and persisted with userId: null.");

  // ── Test 2: Create Member With Officer ──
  console.log("\nTest 2: Create Member With Officer (POST /api/members)...");
  const t2Res = await apiCall("/api/members", {
    method: "POST",
    token: adminToken,
    body: {
      name: "Test Linked Member Beta",
      department: "Water Supply",
      userId: waterOfficerDoc._id.toString(),
    },
  });
  console.log(`HTTP ${t2Res.status}:`, t2Res.body);
  if (t2Res.status !== 201) throw new Error(`Test 2 Failed: expected 201, got ${t2Res.status}`);
  if (t2Res.body.userId?.email !== "water.officer.test@govai.test") {
    throw new Error(`Test 2 Failed: populated officer email mismatch: ${t2Res.body.userId?.email}`);
  }

  // Verify in MongoDB
  const t2DbDoc = await Member.findById(t2Res.body._id).lean();
  if (!t2DbDoc || t2DbDoc.userId?.toString() !== waterOfficerDoc._id.toString()) {
    throw new Error("Test 2 Failed: MongoDB record does not map to water officer!");
  }
  console.log("✓ Test 2 Passed: Member created with eligible officer, relationship and populated response verified.");

  // ── Test 3: Link Existing Unlinked Member ──
  console.log("\nTest 3: Link Existing Unlinked Member (PUT /api/members/:id)...");
  // Create an additional active Road Officer
  const roadOfficer2Doc = await User.create({
    name: "Test Road Field Officer 2",
    email: "road.officer2.test@govai.test",
    password: hashedPassword,
    role: "department",
    department: "Road & Infrastructure",
    departmentRole: "officer",
    status: "active",
  });
  // Create an unlinked Road Member
  const unlinkedRoadMember = await Member.create({
    name: "Test Member To Link",
    department: "Road & Infrastructure",
    userId: null,
    createdBy: adminDoc._id,
  });

  const t3Res = await apiCall(`/api/members/${unlinkedRoadMember._id}`, {
    method: "PUT",
    token: adminToken,
    body: {
      userId: roadOfficer2Doc._id.toString(),
    },
  });
  console.log(`HTTP ${t3Res.status}:`, t3Res.body);
  if (t3Res.status !== 200) throw new Error(`Test 3 Failed: expected 200, got ${t3Res.status}`);
  if (t3Res.body.userId?.email !== "road.officer2.test@govai.test") {
    throw new Error(`Test 3 Failed: returned user email mismatch: ${t3Res.body.userId?.email}`);
  }

  // Verify via GET /api/members
  const t3ListRes = await apiCall(`/api/members?department=${encodeURIComponent("Road & Infrastructure")}`, {
    token: adminToken,
  });
  const foundMemberInList = t3ListRes.body.find((m) => m._id.toString() === unlinkedRoadMember._id.toString());
  if (!foundMemberInList || foundMemberInList.userId?.email !== "road.officer2.test@govai.test") {
    throw new Error("Test 3 Failed: GET /api/members does not return newly linked officer!");
  }

  // Verify in MongoDB
  const t3DbDoc = await Member.findById(unlinkedRoadMember._id).lean();
  if (t3DbDoc.userId?.toString() !== roadOfficer2Doc._id.toString()) {
    throw new Error("Test 3 Failed: MongoDB record userId not updated!");
  }
  console.log("✓ Test 3 Passed: Existing unlinked Member linked successfully and verified via GET API and MongoDB.");

  // ── Test 4: Unlink Existing Officer ──
  console.log("\nTest 4: Unlink Existing Officer (PUT /api/members/:id with { unlinkUser: true })...");
  const t4Res = await apiCall(`/api/members/${unlinkedRoadMember._id}`, {
    method: "PUT",
    token: adminToken,
    body: {
      unlinkUser: true,
    },
  });
  console.log(`HTTP ${t4Res.status}:`, t4Res.body);
  if (t4Res.status !== 200) throw new Error(`Test 4 Failed: expected 200, got ${t4Res.status}`);
  if (t4Res.body.userId !== null) {
    throw new Error(`Test 4 Failed: expected userId: null, got ${JSON.stringify(t4Res.body.userId)}`);
  }

  // Verify in MongoDB
  const t4DbDoc = await Member.findById(unlinkedRoadMember._id).lean();
  if (t4DbDoc.userId !== null) {
    throw new Error("Test 4 Failed: MongoDB record userId is not null!");
  }

  // Verify original User account still exists and remains active
  const officer2StillExists = await User.findById(roadOfficer2Doc._id).lean();
  if (!officer2StillExists || officer2StillExists.status !== "active") {
    throw new Error("Test 4 Failed: Original officer user account was deleted or mutated!");
  }
  console.log("✓ Test 4 Passed: Officer unlinked successfully, Member.userId is null, User account remains active.");

  // ── Test 5: Duplicate Mapping Prevention ──
  console.log("\nTest 5: Duplicate Mapping Prevention...");
  // Attempt to link roadOfficerDoc (already assigned to linkedMemberDoc) to another Member (unlinkedRoadMember)
  const t5Res = await apiCall(`/api/members/${unlinkedRoadMember._id}`, {
    method: "PUT",
    token: adminToken,
    body: {
      userId: roadOfficerDoc._id.toString(),
    },
  });
  console.log(`HTTP ${t5Res.status}:`, t5Res.body);
  if (t5Res.status !== 409) {
    throw new Error(`Test 5 Failed: expected 409 conflict, got ${t5Res.status}`);
  }
  if (!t5Res.body.message.includes("already linked")) {
    throw new Error(`Test 5 Failed: unexpected message ${t5Res.body.message}`);
  }

  // Verify MongoDB document remained unchanged
  const t5DbDoc = await Member.findById(unlinkedRoadMember._id).lean();
  if (t5DbDoc.userId !== null) {
    throw new Error("Test 5 Failed: target member was corrupted by duplicate mapping!");
  }
  console.log("✓ Test 5 Passed: Duplicate mapping strictly rejected with HTTP 409, records unchanged.");

  // ── Test 6: Cross-Department Mapping Prevention ──
  console.log("\nTest 6: Cross-Department Mapping Prevention...");
  // Attempt to link waterOfficerDoc (Water Supply) to unlinkedRoadMember (Road & Infrastructure)
  const t6Res = await apiCall(`/api/members/${unlinkedRoadMember._id}`, {
    method: "PUT",
    token: adminToken,
    body: {
      userId: waterOfficerDoc._id.toString(),
    },
  });
  console.log(`HTTP ${t6Res.status}:`, t6Res.body);
  if (t6Res.status !== 400) {
    throw new Error(`Test 6 Failed: expected 400 bad request, got ${t6Res.status}`);
  }
  if (!t6Res.body.message.includes("Department mismatch")) {
    throw new Error(`Test 6 Failed: unexpected message ${t6Res.body.message}`);
  }
  console.log("✓ Test 6 Passed: Cross-department mapping rejected with HTTP 400, records unchanged.");

  // ── Test 7: Invalid Account Rejection ──
  console.log("\nTest 7: Invalid Account Rejection...");

  // 7a: Authority account rejection
  const t7a = await apiCall(`/api/members/${unlinkedRoadMember._id}`, {
    method: "PUT",
    token: adminToken,
    body: { userId: roadAuthorityDoc._id.toString() },
  });
  console.log("7a (Authority):", t7a.status, t7a.body.message);
  if (t7a.status !== 400 || !t7a.body.message.includes("authority")) {
    throw new Error("Test 7a Failed: authority account was not rejected!");
  }

  // 7b: Citizen account rejection
  const t7b = await apiCall(`/api/members/${unlinkedRoadMember._id}`, {
    method: "PUT",
    token: adminToken,
    body: { userId: citizenDoc._id.toString() },
  });
  console.log("7b (Citizen):", t7b.status, t7b.body.message);
  if (t7b.status !== 400 || !t7b.body.message.includes("department role")) {
    throw new Error("Test 7b Failed: citizen account was not rejected!");
  }

  // 7c: Inactive officer account rejection
  const t7c = await apiCall(`/api/members/${unlinkedMemberDoc._id}`, {
    method: "PUT",
    token: adminToken,
    body: { userId: inactiveOfficerDoc._id.toString() },
  });
  console.log("7c (Inactive):", t7c.status, t7c.body.message);
  if (t7c.status !== 400 || !t7c.body.message.includes("must be active")) {
    throw new Error("Test 7c Failed: inactive account was not rejected!");
  }

  // 7d: Nonexistent User ID rejection
  const nonExistentId = sampleObjectId();
  const t7d = await apiCall(`/api/members/${unlinkedRoadMember._id}`, {
    method: "PUT",
    token: adminToken,
    body: { userId: nonExistentId },
  });
  console.log("7d (Nonexistent):", t7d.status, t7d.body.message);
  if (t7d.status !== 404) {
    throw new Error("Test 7d Failed: nonexistent account was not rejected with 404!");
  }
  console.log("✓ Test 7 Passed: Authority, citizen, inactive, and nonexistent accounts rejected.");

  // ── Test 8: Authorization Checks ──
  console.log("\nTest 8: Authorization Checks...");

  // 8a: Citizen cannot create member
  const t8a = await apiCall("/api/members", {
    method: "POST",
    token: citizenToken,
    body: { name: "Citizen Rogue Member", department: "Electricity" },
  });
  if (t8a.status !== 403) throw new Error(`Test 8a Failed: citizen expected 403, got ${t8a.status}`);

  // 8b: Citizen cannot update member
  const t8b = await apiCall(`/api/members/${unlinkedRoadMember._id}`, {
    method: "PUT",
    token: citizenToken,
    body: { unlinkUser: true },
  });
  if (t8b.status !== 403) throw new Error(`Test 8b Failed: citizen update expected 403, got ${t8b.status}`);

  // 8c: Officer cannot create member
  const t8c = await apiCall("/api/members", {
    method: "POST",
    token: roadOfficerToken,
    body: { name: "Officer Rogue Member", department: "Road & Infrastructure" },
  });
  if (t8c.status !== 403) throw new Error(`Test 8c Failed: officer expected 403, got ${t8c.status}`);

  // 8d: Officer cannot update/link member
  const t8d = await apiCall(`/api/members/${unlinkedRoadMember._id}`, {
    method: "PUT",
    token: roadOfficerToken,
    body: { unlinkUser: true },
  });
  if (t8d.status !== 403) throw new Error(`Test 8d Failed: officer update expected 403, got ${t8d.status}`);

  // 8e: Water Authority cannot modify Road Member
  const t8e = await apiCall(`/api/members/${unlinkedRoadMember._id}`, {
    method: "PUT",
    token: waterAuthorityToken,
    body: { unlinkUser: true },
  });
  if (t8e.status !== 403 || !t8e.body.message.includes("another department")) {
    throw new Error(`Test 8e Failed: water authority modifying road member expected 403, got ${t8e.status}`);
  }

  // 8f: Road Authority CAN modify Road Member
  const t8f = await apiCall(`/api/members/${unlinkedRoadMember._id}`, {
    method: "PUT",
    token: roadAuthorityToken,
    body: { name: "Updated by Road Authority" },
  });
  if (t8f.status !== 200) throw new Error(`Test 8f Failed: road authority expected 200, got ${t8f.status}`);

  console.log("✓ Test 8 Passed: Citizen, field officer, and cross-department authority restrictions enforced.");

  // ── Step 4: Server Restart & Persistence Verification ──
  console.log("\n[4] Server Restart & Persistence Verification...");

  // Snapshot before restart
  const preRestartMembers = await Member.find({}).sort({ createdAt: 1 }).lean();
  console.log(`Current member count before restart: ${preRestartMembers.length}`);

  // Stop current test server and disconnect Mongoose
  await new Promise((resolve) => testServer.close(resolve));
  await mongoose.disconnect();
  console.log("Server stopped and MongoDB disconnected.");

  await sleep(1500);

  // Restart backend and reconnect to MongoDB
  console.log("Restarting server and reconnecting to isolated database", ISOLATED_TEST_DB, "...");
  await mongoose.connect(MONGO_URI, {
    dbName: ISOLATED_TEST_DB,
    serverSelectionTimeoutMS: 10000,
  });

  const restartedServer = http.createServer(app);
  await new Promise((resolve) => restartedServer.listen(RESTART_TEST_PORT, resolve));
  console.log(`Restarted server listening at http://127.0.0.1:${RESTART_TEST_PORT}`);

  // Query restarted server via HTTP
  const restartRes = await fetch(`http://127.0.0.1:${RESTART_TEST_PORT}/api/members`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const restartMembers = await restartRes.json();

  if (restartMembers.length !== preRestartMembers.length) {
    throw new Error(`Persistence failure: expected ${preRestartMembers.length} members after restart, found ${restartMembers.length}!`);
  }

  // Verify all mappings match exactly
  for (const pre of preRestartMembers) {
    const post = restartMembers.find((m) => m._id.toString() === pre._id.toString());
    if (!post) throw new Error(`Persistence failure: member ${pre.name} missing after reboot!`);
    const preUserId = pre.userId ? pre.userId.toString() : null;
    const postUserId = post.userId ? (post.userId._id ? post.userId._id.toString() : post.userId.toString()) : null;
    if (preUserId !== postUserId) {
      throw new Error(`Persistence failure: member ${pre.name} mapping changed from ${preUserId} to ${postUserId}!`);
    }
  }

  console.log("✓ Server restart persistence verified: All records, relationships, and mappings persisted identically.");

  // ── Step 5: Concurrency Verification ──
  console.log("\n[5] Concurrency Verification (Simultaneous Mapping Collision)...");

  // Create two distinct unlinked members in Road & Infrastructure
  const concurrentMemberA = await Member.create({
    name: "Concurrent Test Member A",
    department: "Road & Infrastructure",
    userId: null,
    createdBy: adminDoc._id,
  });
  const concurrentMemberB = await Member.create({
    name: "Concurrent Test Member B",
    department: "Road & Infrastructure",
    userId: null,
    createdBy: adminDoc._id,
  });

  // Create one available active Road Officer
  const concurrentOfficer = await User.create({
    name: "Concurrent Candidate Officer",
    email: "concurrent.officer@govai.test",
    password: hashedPassword,
    role: "department",
    department: "Road & Infrastructure",
    departmentRole: "officer",
    status: "active",
  });

  console.log(`Created Concurrent Member A (${concurrentMemberA._id}) and Member B (${concurrentMemberB._id})`);
  console.log(`Targeting single available Officer: ${concurrentOfficer.email} (${concurrentOfficer._id})`);

  // Fire two simultaneous PUT requests against the restarted server
  const concurrencyUrlA = `http://127.0.0.1:${RESTART_TEST_PORT}/api/members/${concurrentMemberA._id}`;
  const concurrencyUrlB = `http://127.0.0.1:${RESTART_TEST_PORT}/api/members/${concurrentMemberB._id}`;

  const reqA = fetch(concurrencyUrlA, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ userId: concurrentOfficer._id.toString() }),
  });

  const reqB = fetch(concurrencyUrlB, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ userId: concurrentOfficer._id.toString() }),
  });

  const [resA, resB] = await Promise.all([reqA, reqB]);
  const statuses = [resA.status, resB.status].sort();

  console.log(`Concurrent Request Results: Statuses = [${statuses.join(", ")}]`);

  if (statuses[0] !== 200 || statuses[1] !== 409) {
    throw new Error(`Concurrency test failed: Expected [200, 409], received [${statuses.join(", ")}]!`);
  }

  // Verify MongoDB engine state: Exactly one member has the officer assigned
  const assignedMembers = await Member.find({ userId: concurrentOfficer._id }).lean();
  console.log(`Database count of members linked to concurrent officer: ${assignedMembers.length}`);
  if (assignedMembers.length !== 1) {
    throw new Error(`Concurrency engine failure: Expected exactly 1 member linked, found ${assignedMembers.length}!`);
  }

  console.log("✓ Concurrency test passed: Partial unique index and conflict handler permitted exactly 1 link (HTTP 200) and rejected the concurrent collision (HTTP 409).");

  // Close restarted server and disconnect
  await new Promise((resolve) => restartedServer.close(resolve));
  await mongoose.disconnect();

  // ── Step 7: Live Atlas Baseline Safety Audit ──
  console.log("\n[7] Performing Live Atlas Database Safety Audit (Read-Only)...");
  await mongoose.connect(MONGO_URI, {
    dbName: "govai",
    serverSelectionTimeoutMS: 10000,
  });

  const liveDb = mongoose.connection.db;
  if (liveDb.databaseName !== "govai") {
    throw new Error(`Safety audit failed: Expected to audit "govai", got "${liveDb.databaseName}"`);
  }

  const liveCounts = {
    complaints: await liveDb.collection("complaints").countDocuments(),
    users: await liveDb.collection("users").countDocuments(),
    members: await liveDb.collection("members").countDocuments(),
    feedbacks: await liveDb.collection("feedbacks").countDocuments(),
    notifications: await liveDb.collection("notifications").countDocuments(),
  };

  const EXPECTED_LIVE = {
    complaints: 18,
    users: 22,
    members: 4,
    feedbacks: 0,
    notifications: 14,
  };

  console.log("Live Atlas Collection Counts Audit:");
  for (const [col, exp] of Object.entries(EXPECTED_LIVE)) {
    const act = liveCounts[col];
    const diff = act - exp;
    console.log(` - ${col.padEnd(15)}: Expected = ${exp}, Actual = ${act}, Δ = ${diff}`);
    if (diff !== 0) {
      throw new Error(`CRITICAL VIOLATION: Collection "${col}" mutated! Expected ${exp}, found ${act}`);
    }
  }

  const liveMembers = await liveDb.collection("members").find({}).toArray();
  const liveUsers = await liveDb.collection("users").find({}).toArray();
  const liveUserMap = new Map(liveUsers.map((u) => [u._id.toString(), u]));

  console.log("\nLive Atlas Member Mapping Verification:");
  for (const m of liveMembers) {
    const u = m.userId ? liveUserMap.get(m.userId.toString()) : null;
    console.log(` - Member: ${m.name.padEnd(16)} | Dept: ${m.department.padEnd(23)} | Status: ${u ? "LINKED" : "UNLINKED"} | Linked User: ${u ? `${u.name} (${u.email})` : "none"}`);
  }

  const priya = liveMembers.find((m) => m.name === "Officer Priya");
  const amit = liveMembers.find((m) => m.name === "Officer Amit");
  const rajesh = liveMembers.find((m) => m.name === "Officer Rajesh");
  const neha = liveMembers.find((m) => m.name === "Officer Neha");

  if (!priya?.userId) throw new Error("Safety violation: Officer Priya mapping lost in live Atlas!");
  if (!amit?.userId) throw new Error("Safety violation: Officer Amit mapping lost in live Atlas!");
  if (rajesh?.userId) throw new Error("Safety violation: Officer Rajesh was mutated in live Atlas!");
  if (neha?.userId) throw new Error("Safety violation: Officer Neha was mutated in live Atlas!");

  console.log("✓ Live Atlas verified: All 4 mappings intact and all collection counts Δ = 0.");
  await mongoose.disconnect();

  // ── Step 8: Cleanup Test Database ──
  console.log("\n[8] Cleaning up isolated test database", ISOLATED_TEST_DB, "...");
  await mongoose.connect(MONGO_URI, {
    dbName: ISOLATED_TEST_DB,
    serverSelectionTimeoutMS: 10000,
  });
  await mongoose.connection.db.dropDatabase();
  console.log("✓ Dropped isolated test database:", ISOLATED_TEST_DB);
  await mongoose.disconnect();

  console.log("\n================================================================================");
  console.log("ALL REAL MONGODB INTEGRATION & PERSISTENCE TESTS PASSED CLEANLY!");
  console.log("================================================================================\n");
}

run().catch((err) => {
  console.error("FATAL ERROR IN INTEGRATION VERIFICATION:", err);
  process.exit(1);
});
