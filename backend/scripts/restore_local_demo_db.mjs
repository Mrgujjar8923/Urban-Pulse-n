import fs from "fs";
import path from "path";
import mongoose from "mongoose";

const LOCAL_URI = "mongodb://127.0.0.1:27017/govai_demo";
const BACKUP_DIR = path.resolve("backups/phase2_pre_recovery_20261030T151320Z");

const parseEjson = (val) => {
  if (val === null || val === undefined) return val;
  if (Array.isArray(val)) return val.map(parseEjson);
  if (typeof val === "object") {
    if (val.$oid) return new mongoose.Types.ObjectId(val.$oid);
    if (val.$date) {
      if (typeof val.$date === "string") return new Date(val.$date);
      if (val.$date.$numberLong) return new Date(Number(val.$date.$numberLong));
      return new Date(val.$date);
    }
    if (val.$numberInt !== undefined) return Number(val.$numberInt);
    if (val.$numberLong !== undefined) return Number(val.$numberLong);
    
    const res = {};
    for (const [k, v] of Object.entries(val)) {
      res[k] = parseEjson(v);
    }
    return res;
  }
  return val;
};

async function run() {
  console.log("Connecting to local MongoDB:", LOCAL_URI);
  const conn = await mongoose.connect(LOCAL_URI);
  const db = conn.connection.db;

  console.log("Connected successfully. Dropping existing collections in govai_demo if any...");
  const existingCols = await db.listCollections().toArray();
  for (const c of existingCols) {
    console.log(`Dropping ${c.name}...`);
    await db.collection(c.name).drop();
  }

  // 1. Users
  const rawUsers = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, "collections/users.ejson"), "utf8"));
  const users = rawUsers.map(parseEjson);
  console.log(`Inserting ${users.length} users...`);
  await db.collection("users").insertMany(users);

  // 2. Members
  const rawMembers = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, "collections/members.ejson"), "utf8"));
  const members = rawMembers.map(parseEjson);
  console.log(`Inserting ${members.length} members...`);
  await db.collection("members").insertMany(members);

  // 3. Complaints
  const rawComplaints = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, "collections/complaints.ejson"), "utf8"));
  const complaints = rawComplaints.map(parseEjson);
  console.log(`Inserting ${complaints.length} complaints...`);
  await db.collection("complaints").insertMany(complaints);

  // 4. Feedbacks
  const rawFeedbacks = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, "collections/feedbacks.ejson"), "utf8"));
  const feedbacks = rawFeedbacks.map(parseEjson);
  console.log(`Inserting ${feedbacks.length} feedbacks...`);
  if (feedbacks.length > 0) {
    await db.collection("feedbacks").insertMany(feedbacks);
  }

  // 5. Notifications
  const rawNotifications = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, "collections/notifications.ejson"), "utf8"));
  const notifications = rawNotifications.map(parseEjson);
  console.log(`Inserting ${notifications.length} notifications...`);
  if (notifications.length > 0) {
    await db.collection("notifications").insertMany(notifications);
  }

  // Apply Phase 2 committed migration updates to bring it to exact verified state:
  console.log("Applying committed Phase 2 migration updates (departmentRole and member mappings)...");
  
  // Authorities:
  await db.collection("users").updateOne({ email: "authority@demo.com" }, { $set: { departmentRole: "authority" } });
  await db.collection("users").updateOne({ email: "water@demo.com" }, { $set: { departmentRole: "authority" } });
  await db.collection("users").updateOne({ email: "electricity@demo.com" }, { $set: { departmentRole: "authority" } });
  await db.collection("users").updateOne({ email: "environment@demo.com" }, { $set: { departmentRole: "authority" } });

  // Officers:
  await db.collection("users").updateOne({ email: "road.demo@govai.gov" }, { $set: { departmentRole: "officer" } });
  await db.collection("users").updateOne({ email: "electricity.demo@govai.gov" }, { $set: { departmentRole: "officer" } });
  await db.collection("users").updateOne({ email: "environment.demo@govai.gov" }, { $set: { departmentRole: "officer" } });
  await db.collection("users").updateOne({ email: "water.demo@govai.gov" }, { $set: { departmentRole: "officer" } });

  // Member links:
  const roadUser = await db.collection("users").findOne({ email: "road.demo@govai.gov" });
  const electricityUser = await db.collection("users").findOne({ email: "electricity.demo@govai.gov" });

  await db.collection("members").updateOne({ name: "Officer Priya" }, { $set: { userId: roadUser._id } });
  await db.collection("members").updateOne({ name: "Officer Amit" }, { $set: { userId: electricityUser._id } });

  // Counts verification
  const userCount = await db.collection("users").countDocuments();
  const memberCount = await db.collection("members").countDocuments();
  const complaintCount = await db.collection("complaints").countDocuments();
  const feedbackCount = await db.collection("feedbacks").countDocuments();
  const notifCount = await db.collection("notifications").countDocuments();

  console.log("\n=== BASELINE RESTORATION VERIFICATION ===");
  console.log(`Users: ${userCount} (Expected: 21) -> ${userCount === 21 ? "PASS" : "FAIL"}`);
  console.log(`Members: ${memberCount} (Expected: 4) -> ${memberCount === 4 ? "PASS" : "FAIL"}`);
  console.log(`Complaints: ${complaintCount} (Expected: 18) -> ${complaintCount === 18 ? "PASS" : "FAIL"}`);
  console.log(`Feedback: ${feedbackCount} (Expected: 0) -> ${feedbackCount === 0 ? "PASS" : "FAIL"}`);
  console.log(`Notifications: ${notifCount} (Expected: 14) -> ${notifCount === 14 ? "PASS" : "FAIL"}`);

  await mongoose.disconnect();
  console.log("Disconnected successfully.");
}

run().catch(err => {
  console.error("Restoration error:", err);
  process.exit(1);
});

