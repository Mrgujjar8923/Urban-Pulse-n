import test from "node:test";
import assert from "node:assert/strict";
import { Complaint } from "../src/models/Complaint.js";
import { Notification } from "../src/models/Notification.js";

test("Database Indexes & AutoIndex Safety (Phase 7E.4)", async (t) => {
  await t.test("Complaint schema explicitly disables autoIndex to prevent unintended writes", () => {
    assert.strictEqual(
      Complaint.schema.options.autoIndex,
      false,
      "Complaint schema must have autoIndex: false"
    );
  });

  await t.test("Notification schema explicitly disables autoIndex to prevent unintended writes", () => {
    assert.strictEqual(
      Notification.schema.options.autoIndex,
      false,
      "Notification schema must have autoIndex: false"
    );
  });

  await t.test("Complaint schema defines verified high-value compound indexes with stable names", () => {
    const indexes = Complaint.schema.indexes();

    const findIndex = (name) => indexes.find(([, options]) => options?.name === name);

    // 1. Citizen list & dashboard
    const creatorIndex = findIndex("idx_complaints_creator_created");
    assert.ok(creatorIndex, "Missing idx_complaints_creator_created");
    assert.deepStrictEqual(creatorIndex[0], { createdBy: 1, createdAt: -1 });

    // 2. Department Authority dashboard
    const categoryIndex = findIndex("idx_complaints_category_created");
    assert.ok(categoryIndex, "Missing idx_complaints_category_created");
    assert.deepStrictEqual(categoryIndex[0], { category: 1, createdAt: -1 });

    // 3. Department Officer assigned queue
    const officerIndex = findIndex("idx_complaints_dept_assigned_created");
    assert.ok(officerIndex, "Missing idx_complaints_dept_assigned_created");
    assert.deepStrictEqual(officerIndex[0], { category: 1, assignedTo: 1, createdAt: -1 });

    // 4. SLA Overdue periodic escalation job
    const slaIndex = findIndex("idx_complaints_sla_deadline_status");
    assert.ok(slaIndex, "Missing idx_complaints_sla_deadline_status");
    assert.deepStrictEqual(slaIndex[0], { "sla.deadline": 1, status: 1 });
  });

  await t.test("Notification schema defines verified compound index with stable name", () => {
    const indexes = Notification.schema.indexes();
    const findIndex = (name) => indexes.find(([, options]) => options?.name === name);

    const userCreatedIndex = findIndex("idx_notifications_user_created");
    assert.ok(userCreatedIndex, "Missing idx_notifications_user_created");
    assert.deepStrictEqual(userCreatedIndex[0], { userId: 1, createdAt: -1 });
  });
});
