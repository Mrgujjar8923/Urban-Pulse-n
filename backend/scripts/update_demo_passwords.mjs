import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import "dotenv/config";
import { User } from "../src/models/User.js";

const CREDS_PATH = path.resolve("../demo-credentials.local.json");

async function run() {
  const uri = process.env.MONGO_URI || "";
  console.log("Checking database connection URI:", uri);
  if (!uri.includes("127.0.0.1") && !uri.includes("localhost")) {
    throw new Error("SAFETY ABORT: MONGO_URI must point to local demo database!");
  }
  if (!uri.includes("govai_demo")) {
    throw new Error("SAFETY ABORT: Target database must be govai_demo!");
  }

  const conn = await mongoose.connect(uri);
  const db = conn.connection.db;

  // Verify baseline counts before update
  const beforeCounts = {
    users: await db.collection("users").countDocuments(),
    members: await db.collection("members").countDocuments(),
    complaints: await db.collection("complaints").countDocuments(),
    feedbacks: await db.collection("feedbacks").countDocuments(),
    notifications: await db.collection("notifications").countDocuments(),
  };

  console.log("\n=== DATABASE COUNTS BEFORE PASSWORD UPDATE ===");
  console.log(beforeCounts);

  if (beforeCounts.users !== 21 || beforeCounts.members !== 4 || beforeCounts.complaints !== 18 || beforeCounts.feedbacks !== 0 || beforeCounts.notifications !== 14) {
    throw new Error("Baseline counts mismatch! Aborting.");
  }

  const credsData = JSON.parse(fs.readFileSync(CREDS_PATH, "utf8"));
  const accounts = credsData.accounts;
  console.log(`\nFound ${accounts.length} demo accounts to update.\n`);

  const results = [];

  for (const acc of accounts) {
    const existing = await User.findOne({ email: acc.email });
    if (!existing) {
      throw new Error(`Account not found: ${acc.email}`);
    }

    const originalId = existing._id.toString();
    const originalRole = existing.role;
    const originalDept = existing.department;
    const originalStatus = existing.status;
    const originalDeptRole = existing.departmentRole;
    const oldHash = existing.password;

    // Set plaintext password so the pre-save hook hashes it exactly once
    existing.password = acc.password;
    await existing.save();

    // Verify after save independently
    const reloaded = await User.findById(originalId);
    if (!reloaded) throw new Error(`Could not reload user ${acc.email}`);

    // Verify password is a bcrypt hash and not plaintext
    const isBcrypt = reloaded.password.startsWith("$2a$10$") || reloaded.password.startsWith("$2b$10$");
    const isPlaintext = reloaded.password === acc.password;
    const compareOk = await reloaded.comparePassword(acc.password);
    const wrongCompareFails = !(await reloaded.comparePassword("WrongPassword123!"));
    const idUnchanged = reloaded._id.toString() === originalId;
    const emailUnchanged = reloaded.email === acc.email;
    const roleUnchanged = reloaded.role === originalRole;
    const deptUnchanged = reloaded.department === originalDept;
    const statusUnchanged = reloaded.status === originalStatus;
    const deptRoleUnchanged = reloaded.departmentRole === originalDeptRole;
    const hashChanged = reloaded.password !== oldHash;

    const allOk = isBcrypt && !isPlaintext && compareOk && wrongCompareFails && idUnchanged && emailUnchanged && roleUnchanged && deptUnchanged && statusUnchanged && deptRoleUnchanged && hashChanged;

    results.push({
      email: acc.email,
      id: originalId,
      role: reloaded.role,
      department: reloaded.department || "N/A",
      departmentRole: reloaded.departmentRole || "N/A",
      status: reloaded.status,
      isBcrypt,
      compareOk,
      wrongCompareFails,
      metadataPreserved: idUnchanged && emailUnchanged && roleUnchanged && deptUnchanged && statusUnchanged && deptRoleUnchanged,
      hashChanged,
      statusPass: allOk ? "PASS" : "FAIL"
    });
  }

  console.table(results);

  // Verify counts after update
  const afterCounts = {
    users: await db.collection("users").countDocuments(),
    members: await db.collection("members").countDocuments(),
    complaints: await db.collection("complaints").countDocuments(),
    feedbacks: await db.collection("feedbacks").countDocuments(),
    notifications: await db.collection("notifications").countDocuments(),
  };

  console.log("\n=== DATABASE COUNTS AFTER PASSWORD UPDATE ===");
  console.log(afterCounts);

  const countsMatch = (
    beforeCounts.users === afterCounts.users &&
    beforeCounts.members === afterCounts.members &&
    beforeCounts.complaints === afterCounts.complaints &&
    beforeCounts.feedbacks === afterCounts.feedbacks &&
    beforeCounts.notifications === afterCounts.notifications
  );

  console.log(`All counts preserved exactly: ${countsMatch ? "YES" : "NO"}`);
  console.log(`All 10 accounts updated & verified: ${results.every(r => r.statusPass === "PASS") ? "YES" : "NO"}`);

  await mongoose.disconnect();
}

run().catch(err => {
  console.error("Update failed:", err);
  process.exit(1);
});

