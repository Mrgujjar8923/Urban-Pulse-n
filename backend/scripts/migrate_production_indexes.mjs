#!/usr/bin/env node
/**
 * GovAI Resolve — Production Database Index Migration Script
 *
 * SAFETY GUARD CONTROLS:
 * 1. Requires explicit TARGET_DB parameter.
 * 2. If TARGET_DB === "govai", execution strictly aborts unless the exact token:
 *    CONFIRM_LIVE_GOVAI_MIGRATION="YES_I_CONFIRM_GOVAI_PRODUCTION_INDEX_MIGRATION"
 *    is provided in the environment.
 * 3. Dry-run mode (--dry-run) prints the index plan without connecting or mutating.
 * 4. Indexes are created non-blockingly with background: true.
 * 5. Existing indexes are never dropped. Existing data is never modified.
 *
 * Usage Examples:
 *   Dry Run:
 *     node backend/scripts/migrate_production_indexes.mjs --dry-run
 *
 *   Test DB Migration:
 *     TARGET_DB=govai_test node backend/scripts/migrate_production_indexes.mjs
 *
 *   Live Production Migration (Requires Explicit Confirmation Token):
 *     TARGET_DB=govai CONFIRM_LIVE_GOVAI_MIGRATION=YES_I_CONFIRM_GOVAI_PRODUCTION_INDEX_MIGRATION \
 *       node backend/scripts/migrate_production_indexes.mjs
 */

import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config({ path: "./backend/.env" });

const REQUIRED_INDEXES = [
  {
    collection: "complaints",
    name: "idx_complaints_creator_created",
    spec: { createdBy: 1, createdAt: -1 },
    options: { background: true },
    purpose: "Accelerates Citizen dashboard and complaint queue queries (getMyComplaints)",
  },
  {
    collection: "complaints",
    name: "idx_complaints_category_created",
    spec: { category: 1, createdAt: -1 },
    options: { background: true },
    purpose: "Accelerates Department Authority complaint list queries (getDepartmentComplaints)",
  },
  {
    collection: "complaints",
    name: "idx_complaints_dept_assigned_created",
    spec: { category: 1, assignedTo: 1, createdAt: -1 },
    options: { background: true },
    purpose: "Accelerates Department Officer assigned queue queries (getMyAssignedComplaints)",
  },
  {
    collection: "complaints",
    name: "idx_complaints_sla_deadline_status",
    spec: { "sla.deadline": 1, status: 1 },
    options: { background: true },
    purpose: "Accelerates background SLA breach escalation scanner and status evaluation",
  },
  {
    collection: "complaints",
    name: "idx_complaints_client_request_id",
    spec: { clientRequestId: 1 },
    options: {
      unique: true,
      partialFilterExpression: { clientRequestId: { $type: "string" } },
      background: true,
    },
    purpose: "Guarantees idempotent complaint submissions, preventing network retry duplicates",
  },
  {
    collection: "notifications",
    name: "idx_notifications_user_created",
    spec: { userId: 1, createdAt: -1 },
    options: { background: true },
    purpose: "Accelerates real-time notification lookups, sorting, and unread counts",
  },
  {
    collection: "notifications",
    name: "idx_notifications_dedupe_key",
    spec: { dedupeKey: 1 },
    options: { unique: true, sparse: true, background: true },
    purpose: "Prevents duplicate alerts and notification spam across asynchronous workers",
  },
  {
    collection: "members",
    name: "idx_members_userId_unique",
    spec: { userId: 1 },
    options: {
      unique: true,
      partialFilterExpression: { userId: { $type: "objectId" } },
      background: true,
    },
    purpose: "Guarantees one-to-one mapping between officer user accounts and member records",
  },
  {
    collection: "users",
    name: "idx_users_email_unique",
    spec: { email: 1 },
    options: { unique: true, background: true },
    purpose: "Enforces unique user emails for authentication and login queries",
  },
];

async function main() {
  const isDryRun = process.argv.includes("--dry-run");
  const targetDb = process.env.TARGET_DB || process.env.MONGO_DB_NAME || "govai";
  const liveGovAiApproval = process.env.CONFIRM_LIVE_GOVAI_MIGRATION;
  const REQUIRED_APPROVAL_TOKEN = "YES_I_CONFIRM_GOVAI_PRODUCTION_INDEX_MIGRATION";

  console.log("=================================================================");
  console.log("GovAI Resolve — Production Database Index Migration Guard");
  console.log("=================================================================");
  console.log(`Target Database: ${targetDb}`);
  console.log(`Dry Run Mode   : ${isDryRun ? "YES (No changes will be made)" : "NO"}`);
  console.log("=================================================================\n");

  if (isDryRun) {
    console.log("[DRY RUN] Index Specification Plan:");
    for (const item of REQUIRED_INDEXES) {
      console.log(`\nCollection: ${item.collection}.${item.name}`);
      console.log(`  Spec    : ${JSON.stringify(item.spec)}`);
      console.log(`  Options : ${JSON.stringify(item.options)}`);
      console.log(`  Purpose : ${item.purpose}`);
    }
    console.log("\n[DRY RUN] Complete. No database connections were established.");
    process.exit(0);
  }

  // SAFETY ASSERTION: Guard against unintended execution against live Atlas govai
  if (targetDb === "govai") {
    if (liveGovAiApproval !== REQUIRED_APPROVAL_TOKEN) {
      console.error("\n❌ SAFETY CHECK ABORT: Target database is the live production database 'govai'.");
      console.error("To prevent unintended index builds on live data, execution was halted.");
      console.error("\nIf you genuinely intend to build indexes on live 'govai', you must explicitly pass:");
      console.error(`  TARGET_DB=govai CONFIRM_LIVE_GOVAI_MIGRATION=${REQUIRED_APPROVAL_TOKEN} node backend/scripts/migrate_production_indexes.mjs\n`);
      process.exit(1);
    }
    console.log("⚠️ CAUTION: Explicit production approval token supplied. Proceeding with migration on 'govai'.");
  }

  if (!process.env.MONGO_URI) {
    console.error("❌ ERROR: MONGO_URI is missing from backend/.env");
    process.exit(1);
  }

  console.log(`Connecting to MongoDB for database '${targetDb}'...`);
  await mongoose.connect(process.env.MONGO_URI, { dbName: targetDb });
  const db = mongoose.connection.db;
  console.log(`Connected to: ${db.databaseName}`);

  let createdCount = 0;
  let existingCount = 0;

  for (const item of REQUIRED_INDEXES) {
    const coll = db.collection(item.collection);
    const existing = await coll.indexes();
    const alreadyExists = existing.some((idx) => idx.name === item.name);

    if (alreadyExists) {
      console.log(`  [EXISTS]  ${item.collection}.${item.name}`);
      existingCount++;
    } else {
      console.log(`  [CREATING] ${item.collection}.${item.name} (${JSON.stringify(item.spec)})...`);
      await coll.createIndex(item.spec, { ...item.options, name: item.name });
      console.log(`  ✔ Created: ${item.collection}.${item.name}`);
      createdCount++;
    }
  }

  console.log("\n=================================================================");
  console.log("Migration Summary:");
  console.log(`  Existing Indexes Unchanged: ${existingCount}`);
  console.log(`  Newly Created Indexes    : ${createdCount}`);
  console.log("=================================================================");

  await mongoose.disconnect();
  console.log("Database disconnected cleanly. Migration completed.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
