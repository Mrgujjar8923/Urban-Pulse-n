import dotenv from "../backend/node_modules/dotenv/lib/main.js";
import mongoose from "../backend/node_modules/mongoose/index.js";

dotenv.config({ path: "./backend/.env" });

async function runAudit() {
  console.log("=== GovAI Resolve — Phase 7D.4 READ-ONLY Audit ===");
  
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI not found in backend/.env");
  }

  // Connect read-only
  await mongoose.connect(process.env.MONGO_URI, { dbName: "govai" });
  const db = mongoose.connection.db;

  // 1. List all collections in govai
  const collectionsList = await db.listCollections().toArray();
  const collectionNames = collectionsList.map(c => c.name).sort();
  console.log("\n[Collections in govai]:", collectionNames);

  // 2. Collection counts
  const counts = {};
  for (const name of collectionNames) {
    counts[name] = await db.collection(name).countDocuments();
  }
  console.log("\n[Current Collection Counts]:", counts);

  // 3. Inspect the 19th complaint
  const allComplaints = await db.collection("complaints").find({}).sort({ createdAt: 1 }).toArray();
  console.log(`\nTotal complaints in DB: ${allComplaints.length}`);
  
  const complaint19 = allComplaints[allComplaints.length - 1]; // newest / 19th
  console.log("\n[19th Complaint Full Details]:");
  console.log(JSON.stringify(complaint19, null, 2));

  // 4. Inspect the creator user
  let creatorUser = null;
  if (complaint19?.createdBy) {
    const creatorId = typeof complaint19.createdBy === "string" 
      ? new mongoose.Types.ObjectId(complaint19.createdBy) 
      : complaint19.createdBy;
    creatorUser = await db.collection("users").findOne({ _id: creatorId });
    console.log("\n[19th Complaint Creator User Details]:");
    console.log(JSON.stringify(creatorUser ? {
      _id: creatorUser._id,
      name: creatorUser.name,
      email: creatorUser.email,
      role: creatorUser.role,
      department: creatorUser.department,
      departmentRole: creatorUser.departmentRole,
      status: creatorUser.status,
      createdAt: creatorUser.createdAt
    } : null, null, 2));
  }

  // 5. Inspect newest notification (17th)
  const allNotifications = await db.collection("notifications").find({}).sort({ createdAt: 1 }).toArray();
  console.log(`\nTotal notifications in DB: ${allNotifications.length}`);
  const latestNotification = allNotifications[allNotifications.length - 1];
  console.log("\n[Latest Notification Details]:");
  console.log(JSON.stringify(latestNotification, null, 2));

  // 6. Inspect Members and Officer-to-Member mappings
  const allMembers = await db.collection("members").find({}).toArray();
  console.log("\n[All Members in DB]:");
  console.log(JSON.stringify(allMembers, null, 2));

  const deptUsers = await db.collection("users").find({ 
    $or: [{ role: "department" }, { role: "officer" }, { role: "authority" }, { department: { $ne: null } }] 
  }).toArray();
  console.log("\n[All Department/Officer Users in DB]:");
  console.log(JSON.stringify(deptUsers.map(u => ({
    _id: u._id,
    name: u.name,
    email: u.email,
    role: u.role,
    department: u.department,
    departmentRole: u.departmentRole,
    status: u.status
  })), null, 2));

  await mongoose.disconnect();
  console.log("\nAudit execution completed successfully.");
}

runAudit().catch(err => {
  console.error("Audit error:", err);
  process.exit(1);
});
