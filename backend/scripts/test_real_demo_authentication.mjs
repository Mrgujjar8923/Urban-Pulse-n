import fs from "fs";
import path from "path";
import http from "http";
import app from "../src/app.js";
import { connectDB } from "../src/config/db.js";
import mongoose from "mongoose";

const CREDS_PATH = path.resolve("../demo-credentials.local.json");

async function run() {
  console.log("=== PHASE 8: REAL BACKEND AUTHENTICATION TEST SUITE ===\n");
  await connectDB();

  // Start HTTP server on dynamic ephemeral port
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Test server running on ${baseUrl}\n`);

  const credsData = JSON.parse(fs.readFileSync(CREDS_PATH, "utf8"));
  const accounts = credsData.accounts;

  const testResults = [];

  for (const acc of accounts) {
    console.log(`Testing account: ${acc.label} (${acc.email})...`);

    // 1. Login
    const loginPayload = {
      email: acc.email,
      password: acc.password,
      role: acc.category === "admin" ? "admin" : (acc.category === "citizen" ? "citizen" : "authority"),
      department: acc.department,
      departmentRole: acc.category === "authority" ? "authority" : (acc.category === "officer" ? "officer" : undefined),
    };

    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(loginPayload),
    });

    const loginData = await loginRes.json();
    const loginStatus = loginRes.status;
    const token = loginData.token;

    if (loginStatus !== 200 || !token) {
      testResults.push({
        label: acc.label,
        email: acc.email,
        loginSuccess: false,
        tokenReceived: false,
        getMeSuccess: false,
        roleMatch: false,
        dashboard: "N/A",
        pass: "FAIL",
      });
      console.error(`  -> Login failed: ${loginStatus}`, loginData);
      continue;
    }

    // 2. Fetch /api/auth/me using token
    const meRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const meData = await meRes.json();
    const meStatus = meRes.status;
    const user = meData.user;

    const roleMatch = user && (
      acc.category === "citizen" ? user.role === "citizen" :
      acc.category === "admin" ? user.role === "admin" :
      user.role === "department" && (acc.category === "authority" ? user.departmentRole === "authority" : user.departmentRole === "officer")
    );

    const isOfficerMatch = acc.isOfficer ? user.isOfficer === true : (!user.isOfficer || user.role !== "department" || user.departmentRole === "authority");

    const expectedDashboard = (
      user.role === "citizen" ? "/citizen" :
      user.role === "admin" ? "/admin" :
      "/department"
    );

    // 3. Test Session Restoration (calling getMe again)
    const restoreRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const sessionRestored = restoreRes.status === 200;

    const allPassed = loginStatus === 200 && Boolean(token) && meStatus === 200 && roleMatch && isOfficerMatch && sessionRestored;

    testResults.push({
      label: acc.label,
      email: acc.email,
      loginStatus,
      tokenReceived: Boolean(token),
      getMeStatus: meStatus,
      userRole: user.role,
      deptRole: user.departmentRole || "N/A",
      isOfficer: Boolean(user.isOfficer),
      expectedDashboard,
      sessionRestored,
      pass: allPassed ? "PASS" : "FAIL",
    });
    console.log(`  -> OK: token issued, getMe status ${meStatus}, role ${user.role}, isOfficer ${Boolean(user.isOfficer)}`);
  }

  console.log("\n=== REAL BACKEND ACCOUNT LOGIN & GETME RESULTS ===");
  console.table(testResults);

  // 4. Edge Cases & Security Tests
  console.log("\n=== TESTING SECURITY & AUTHORIZATION CONSTRAINTS ===");

  // 4.1 Wrong Password
  const wrongPwRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@govai.gov", password: "CompletelyWrongPassword!" }),
  });
  console.log(`1. Wrong password rejected (401): ${wrongPwRes.status === 401 ? "PASS" : "FAIL"}`);

  // 4.2 Non-existent user
  const notFoundRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "doesnotexist@govai.gov", password: "SomePassword123!" }),
  });
  console.log(`2. Non-existent user rejected (401): ${notFoundRes.status === 401 ? "PASS" : "FAIL"}`);

  // 4.3 Department mismatch
  const deptMismatchRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "authority@demo.com", password: accounts.find(a => a.email === "authority@demo.com").password, role: "authority", department: "Water Supply" }),
  });
  console.log(`3. Department mismatch rejected (403): ${deptMismatchRes.status === 403 ? "PASS" : "FAIL"}`);

  // 4.4 Department role mismatch (authority trying to login as officer)
  const roleMismatchRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "authority@demo.com", password: accounts.find(a => a.email === "authority@demo.com").password, role: "authority", department: "Road & Infrastructure", departmentRole: "officer" }),
  });
  console.log(`4. Department role mismatch rejected (403): ${roleMismatchRes.status === 403 ? "PASS" : "FAIL"}`);

  // 4.5 Officer Assigned Complaints Isolation
  // Road Officer (linked to Priya)
  const roadOfficerLogin = await (await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "road.demo@govai.gov", password: accounts.find(a => a.email === "road.demo@govai.gov").password, role: "authority", department: "Road & Infrastructure", departmentRole: "officer" }),
  })).json();

  const roadOfficerComplaintsRes = await fetch(`${baseUrl}/api/complaints/my-assigned`, {
    headers: { Authorization: `Bearer ${roadOfficerLogin.token}` },
  });
  const roadOfficerComplaints = await roadOfficerComplaintsRes.json();
  console.log(`5. Linked Road Officer accesses /my-assigned (200, Array): ${roadOfficerComplaintsRes.status === 200 && Array.isArray(roadOfficerComplaints) ? "PASS" : "FAIL"}`);

  // Water Officer (unlinked)
  const waterOfficerLogin = await (await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "water.demo@govai.gov", password: accounts.find(a => a.email === "water.demo@govai.gov").password, role: "authority", department: "Water Supply", departmentRole: "officer" }),
  })).json();

  const waterOfficerComplaintsRes = await fetch(`${baseUrl}/api/complaints/my-assigned`, {
    headers: { Authorization: `Bearer ${waterOfficerLogin.token}` },
  });
  const isSafeUnlinked = waterOfficerComplaintsRes.status === 403 || (waterOfficerComplaintsRes.status === 200 && (await waterOfficerComplaintsRes.json()).length === 0);
  console.log(`6. Unlinked Water Officer receives expected restriction (403 or []) on /my-assigned: ${isSafeUnlinked ? "PASS" : "FAIL"}`);

  // 4.6 Unlinked Officer 403 on arbitrary complaint
  const anyComplaint = await mongoose.connection.db.collection("complaints").findOne({ category: "Water Supply" });
  if (anyComplaint) {
    const unlinkedComplaintDetailRes = await fetch(`${baseUrl}/api/complaints/${anyComplaint._id.toString()}`, {
      headers: { Authorization: `Bearer ${waterOfficerLogin.token}` },
    });
    console.log(`7. Unlinked Officer gets 403 on complaint detail: ${unlinkedComplaintDetailRes.status === 403 ? "PASS" : "FAIL"}`);
  }

  // 4.7 Citizen Isolation
  const citizenLogin = await (await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "citizen.demo@govai.gov", password: accounts.find(a => a.email === "citizen.demo@govai.gov").password, role: "citizen" }),
  })).json();

  const otherCitizenComplaint = await mongoose.connection.db.collection("complaints").findOne({ createdBy: { $ne: new mongoose.Types.ObjectId(citizenLogin.user.id) } });
  if (otherCitizenComplaint) {
    const otherDetailRes = await fetch(`${baseUrl}/api/complaints/${otherCitizenComplaint._id.toString()}`, {
      headers: { Authorization: `Bearer ${citizenLogin.token}` },
    });
    console.log(`8. Citizen accessing other citizen's complaint gets 403: ${otherDetailRes.status === 403 ? "PASS" : "FAIL"}`);
  }

  // 4.8 Admin full access
  const adminLogin = await (await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@govai.gov", password: accounts.find(a => a.email === "admin@govai.gov").password, role: "admin" }),
  })).json();

  if (otherCitizenComplaint) {
    const adminDetailRes = await fetch(`${baseUrl}/api/complaints/${otherCitizenComplaint._id.toString()}`, {
      headers: { Authorization: `Bearer ${adminLogin.token}` },
    });
    console.log(`9. Admin accessing any complaint gets 200: ${adminDetailRes.status === 200 ? "PASS" : "FAIL"}`);
  }

  server.close();
  await mongoose.disconnect();
  console.log("\nAll real backend tests finished successfully.");
}

run().catch(err => {
  console.error("Test execution error:", err);
  process.exit(1);
});
