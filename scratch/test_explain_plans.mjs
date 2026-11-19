import dotenv from "../backend/node_modules/dotenv/lib/main.js";
import mongoose from "../backend/node_modules/mongoose/index.js";

dotenv.config({ path: "./backend/.env" });

async function runExplainPlans() {
  console.log("=== GovAI Resolve — READ-ONLY Query Explain Plan Audit ===");
  await mongoose.connect(process.env.MONGO_URI, { dbName: "govai" });
  const db = mongoose.connection.db;

  const sampleCitizenId = new mongoose.Types.ObjectId("6aaffdb60d4d4252133081a6"); // Priyanshu
  const sampleMemberId = new mongoose.Types.ObjectId("69e08222f55981d3faedf6d8"); // Officer Rajesh
  const sampleUserId = new mongoose.Types.ObjectId("69e08219f55981d3faedf6cb"); // Meera Singh

  // 1. Citizen complaints query
  console.log("\n--- 1. Citizen Complaint List (Filter: createdBy, Sort: createdAt: -1) ---");
  const expCitizen = await db.collection("complaints")
    .find({ createdBy: sampleCitizenId })
    .sort({ createdAt: -1 })
    .explain("executionStats");
  console.log("Stage:", expCitizen.executionStats.executionStages.stage);
  console.log("Docs examined:", expCitizen.executionStats.totalDocsExamined, "| Returned:", expCitizen.executionStats.nReturned);
  console.log("Execution time (ms):", expCitizen.executionStats.executionTimeMillis);

  // 2. Department authority query
  console.log("\n--- 2. Department Complaint List (Filter: category, Sort: createdAt: -1) ---");
  const expDept = await db.collection("complaints")
    .find({ category: "Water Supply" })
    .sort({ createdAt: -1 })
    .explain("executionStats");
  console.log("Stage:", expDept.executionStats.executionStages.stage);
  console.log("Docs examined:", expDept.executionStats.totalDocsExamined, "| Returned:", expDept.executionStats.nReturned);

  // 3. Officer assigned query
  console.log("\n--- 3. Officer Assigned Complaints (Filter: category + assignedTo, Sort: createdAt: -1) ---");
  const expOfficer = await db.collection("complaints")
    .find({ category: "Water Supply", assignedTo: sampleMemberId })
    .sort({ createdAt: -1 })
    .explain("executionStats");
  console.log("Stage:", expOfficer.executionStats.executionStages.stage);
  console.log("Docs examined:", expOfficer.executionStats.totalDocsExamined, "| Returned:", expOfficer.executionStats.nReturned);

  // 4. SLA Overdue Job query
  console.log("\n--- 4. SLA Overdue Background Job (Filter: status $ne 'Resolved', sla.deadline $lte now) ---");
  const expSla = await db.collection("complaints")
    .find({ status: { $ne: "Resolved" }, "sla.deadline": { $exists: true, $lte: new Date() } })
    .explain("executionStats");
  console.log("Stage:", expSla.executionStats.executionStages.stage);
  console.log("Docs examined:", expSla.executionStats.totalDocsExamined, "| Returned:", expSla.executionStats.nReturned);

  // 5. Notification list query
  console.log("\n--- 5. Notification List (Filter: userId, Sort: createdAt: -1, Limit: 50) ---");
  const expNotif = await db.collection("notifications")
    .find({ userId: sampleUserId })
    .sort({ createdAt: -1 })
    .limit(50)
    .explain("executionStats");
  console.log("Stage:", expNotif.executionStats.executionStages.stage);
  console.log("Docs examined:", expNotif.executionStats.totalDocsExamined, "| Returned:", expNotif.executionStats.nReturned);

  // 6. User / Officer lookup
  console.log("\n--- 6. Eligible Officer Users (Filter: role + department + status) ---");
  const expUser = await db.collection("users")
    .find({ role: "department", department: "Water Supply", status: "active" })
    .explain("executionStats");
  console.log("Stage:", expUser.executionStats.executionStages.stage);
  console.log("Docs examined:", expUser.executionStats.totalDocsExamined, "| Returned:", expUser.executionStats.nReturned);

  await mongoose.disconnect();
  console.log("\nExplain plan audit completed.");
}

runExplainPlans().catch(console.error);
