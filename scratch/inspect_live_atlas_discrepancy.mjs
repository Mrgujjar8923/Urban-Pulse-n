import path from "path";
import dotenv from "../backend/node_modules/dotenv/lib/main.js";
import mongoose from "../backend/node_modules/mongoose/index.js";

const envPath = path.resolve(process.cwd(), "backend/.env");
dotenv.config({ path: envPath, override: true });

const uri = process.env.MONGO_URI;
if (!uri) {
  console.error("MONGO_URI not configured");
  process.exit(1);
}

// Connect strictly to live 'govai' in READ-ONLY mode
await mongoose.connect(uri, {
  dbName: "govai",
  readPreference: "secondaryPreferred",
});

const db = mongoose.connection.db;
console.log(`Connected to: ${db.databaseName} (read-only inspection)`);

// 1. Fetch complaints
const complaints = await db.collection("complaints").find({}).sort({ createdAt: 1 }).toArray();
console.log(`Total complaints in live govai: ${complaints.length}`);

console.log("\n=======================================================");
console.log("INSPECTING COMPLAINTS #20 and #21 (indices 19 and 20):");
console.log("=======================================================");

for (let i = 18; i < complaints.length; i++) {
  const c = complaints[i];
  console.log(`\n--- Complaint #${i + 1} (index ${i}) ---`);
  console.log(JSON.stringify(c, null, 2));

  // Find user who created it
  if (c.createdBy) {
    const creator = await db.collection("users").findOne({ _id: c.createdBy });
    console.log(`[Creator Details for #${i + 1}]:`, JSON.stringify(creator, null, 2));
  }
}

// 2. Fetch notifications
const notifications = await db.collection("notifications").find({}).sort({ createdAt: 1 }).toArray();
console.log(`\nTotal notifications in live govai: ${notifications.length}`);

console.log("\n=======================================================");
console.log("INSPECTING NOTIFICATIONS #18 and #19 (indices 17 and 18):");
console.log("=======================================================");

for (let i = 16; i < notifications.length; i++) {
  const n = notifications[i];
  console.log(`\n--- Notification #${i + 1} (index ${i}) ---`);
  console.log(JSON.stringify(n, null, 2));

  if (n.userId) {
    const recipient = await db.collection("users").findOne({ _id: n.userId });
    console.log(`[Recipient Details for Notification #${i + 1}]:`, JSON.stringify(recipient, null, 2));
  }
}

await mongoose.disconnect();
console.log("\nRead-only Atlas inspection complete.");
