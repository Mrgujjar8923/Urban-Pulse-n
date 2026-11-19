import mongoose from "mongoose";
import http from "http";
import app from "./src/app.js";
import fs from "fs";
import path from "path";

const CREDS_PATH = path.resolve("../demo-credentials.local.json");

async function main() {
  console.log("=== LIVE BACKEND AUTHENTICATION TEST ===");
  await mongoose.connect("mongodb://127.0.0.1:27017/govai_demo");
  console.log("Connected to mongodb://127.0.0.1:27017/govai_demo");

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Backend server listening on ${baseUrl}\n`);

  const credsData = JSON.parse(fs.readFileSync(CREDS_PATH, "utf8"));
  const accounts = credsData.accounts;

  const results = [];

  for (const acc of accounts) {
    const payload = {
      email: acc.email,
      password: acc.password,
      role: acc.category === "admin" ? "admin" : (acc.category === "citizen" ? "citizen" : "department"),
      department: acc.department,
      departmentRole: acc.category === "authority" ? "authority" : (acc.category === "officer" ? "officer" : undefined),
    };

    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const status = res.status;
    const data = await res.json();
    const token = data.token;

    let meData = null;
    let meStatus = null;
    let complaintsStatus = null;
    let complaintsCount = null;
    let complaintsMessage = null;

    if (token) {
      const meRes = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      meStatus = meRes.status;
      meData = await meRes.json();

      if (acc.category === "officer") {
        const compRes = await fetch(`${baseUrl}/api/complaints/my-assigned`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        complaintsStatus = compRes.status;
        const compData = await compRes.json();
        if (Array.isArray(compData)) {
          complaintsCount = compData.length;
        } else {
          complaintsMessage = compData.message;
        }
      }
    }

    results.push({
      label: acc.label,
      email: acc.email,
      category: acc.category,
      department: acc.department,
      loginStatus: status,
      tokenPresent: !!token,
      meStatus,
      meUser: meData?.user ? {
        id: meData.user.id || meData.user._id,
        role: meData.user.role,
        departmentRole: meData.user.departmentRole,
        department: meData.user.department,
        isOfficer: meData.user.isOfficer,
        memberId: meData.user.memberId,
        memberName: meData.user.memberName,
      } : null,
      complaintsStatus,
      complaintsCount,
      complaintsMessage,
    });
  }

  // Test Negative cases
  // 1. Invalid Password
  const invalidPwRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "citizen.demo@govai.gov", password: "WrongPassword123!" }),
  });
  const invalidPwStatus = invalidPwRes.status;
  const invalidPwData = await invalidPwRes.json();

  // 2. Missing Password
  const missingPwRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "citizen.demo@govai.gov", password: "" }),
  });
  const missingPwStatus = missingPwRes.status;
  const missingPwData = await missingPwRes.json();

  console.log(JSON.stringify({
    accounts: results,
    negativeCases: {
      invalidPassword: { status: invalidPwStatus, message: invalidPwData.message },
      missingPassword: { status: missingPwStatus, message: missingPwData.message },
    }
  }, null, 2));

  server.close();
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
