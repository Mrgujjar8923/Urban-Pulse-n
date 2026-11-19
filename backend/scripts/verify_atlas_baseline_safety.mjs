import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = process.env.MONGO_DB_NAME || "govai";

if (!MONGO_URI) {
  console.error("MONGO_URI not set!");
  process.exit(1);
}

const EXPECTED_COUNTS = {
  complaints: 18,
  users: 22,
  members: 4,
  feedbacks: 0,
  notifications: 14,
};

async function check() {
  console.log("Connecting to MongoDB Atlas (Read-Only Safety Audit)...");
  await mongoose.connect(MONGO_URI, { dbName: DB_NAME, serverSelectionTimeoutMS: 10000 });

  console.log(`Connected to: ${mongoose.connection.host} / ${mongoose.connection.name}`);

  const db = mongoose.connection.db;

  const actualCounts = {
    complaints: await db.collection("complaints").countDocuments(),
    users: await db.collection("users").countDocuments(),
    members: await db.collection("members").countDocuments(),
    feedbacks: await db.collection("feedbacks").countDocuments(),
    notifications: await db.collection("notifications").countDocuments(),
  };

  console.log("\nCollection Counts Audit:");
  let hasDiff = false;
  for (const [col, expected] of Object.entries(EXPECTED_COUNTS)) {
    const actual = actualCounts[col];
    const diff = actual - expected;
    console.log(` - ${col.padEnd(15)}: Expected = ${expected}, Actual = ${actual}, Δ = ${diff}`);
    if (diff !== 0) {
      hasDiff = true;
    }
  }

  // Audit Member mappings
  console.log("\nOfficer-Member Mappings Audit:");
  const members = await db.collection("members").find({}).toArray();
  const users = await db.collection("users").find({}).toArray();
  const userMap = new Map(users.map(u => [u._id.toString(), u]));

  for (const m of members) {
    const linked = m.userId ? userMap.get(m.userId.toString()) : null;
    console.log(` - Member: ${m.name.padEnd(16)} | Dept: ${m.department.padEnd(23)} | Status: ${linked ? "LINKED" : "UNLINKED"} | Linked User: ${linked ? `${linked.name} (${linked.email})` : "none"}`);
  }

  const priya = members.find(m => m.name === "Officer Priya");
  const amit = members.find(m => m.name === "Officer Amit");
  const rajesh = members.find(m => m.name === "Officer Rajesh");
  const neha = members.find(m => m.name === "Officer Neha");

  if (!priya?.userId) throw new Error("Safety violation: Officer Priya mapping lost!");
  if (!amit?.userId) throw new Error("Safety violation: Officer Amit mapping lost!");
  if (rajesh?.userId) throw new Error("Safety violation: Officer Rajesh was unexpectedly linked!");
  if (neha?.userId) throw new Error("Safety violation: Officer Neha was unexpectedly linked!");

  if (hasDiff) {
    throw new Error("Safety audit failed: Collection counts do not match expected baseline (Δ != 0)!");
  }

  console.log("\n=======================================================");
  console.log("DATABASE SAFETY AUDIT PASSED: ZERO MUTATIONS (Δ = 0)");
  console.log("=======================================================\n");

  await mongoose.disconnect();
}

check().catch((err) => {
  console.error("Safety Audit Error:", err);
  process.exit(1);
});

