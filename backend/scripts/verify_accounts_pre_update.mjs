import mongoose from "mongoose";
import "dotenv/config";

const TARGET_EMAILS = [
  "citizen.demo@govai.gov",
  "admin@govai.gov",
  "authority@demo.com",
  "water@demo.com",
  "electricity@demo.com",
  "environment@demo.com",
  "road.demo@govai.gov",
  "water.demo@govai.gov",
  "electricity.demo@govai.gov",
  "environment.demo@govai.gov",
];

async function run() {
  const uri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/govai_demo";
  console.log("Connecting to:", uri);
  const conn = await mongoose.connect(uri);
  const db = conn.connection.db;

  console.log("\n=== PHASE 2: PRE-UPDATE ACCOUNT VERIFICATION ===\n");
  const results = [];

  for (const email of TARGET_EMAILS) {
    const count = await db.collection("users").countDocuments({ email });
    const user = await db.collection("users").findOne({ email });

    if (!user) {
      console.error(`ERROR: Account not found: ${email}`);
      results.push({ email, exists: false });
      continue;
    }

    const unique = count === 1;
    const active = user.status === "active";

    results.push({
      email: user.email,
      id: user._id.toString(),
      name: user.name,
      role: user.role,
      department: user.department || "N/A",
      departmentRole: user.departmentRole || "N/A",
      status: user.status,
      unique,
      active,
    });
  }

  console.table(results);

  const allPassed = results.every(r => r.id && r.unique && r.active);
  console.log(`\nAll 10 accounts exist, active, and unique: ${allPassed ? "YES" : "NO"}`);

  await mongoose.disconnect();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});

