import assert from "node:assert/strict";
import test from "node:test";
import {
  validateComplaintStatus,
  validateStatusTransition,
  OFFICER_REQUIRED_STATUSES,
  VALID_STATUS_TRANSITIONS,
} from "../src/services/complaintWorkflow.service.js";

// ==========================================
// 1. BACKWARD COMPATIBILITY
// ==========================================

test("requires an officer for Assigned and In Progress", () => {
  assert.match(validateComplaintStatus("Assigned", null), /officer must be assigned/);
  assert.match(validateComplaintStatus("In Progress", undefined), /officer must be assigned/);
});

test("allows valid officer-backed operational statuses", () => {
  assert.equal(validateComplaintStatus("Assigned", "member-1"), null);
  assert.equal(validateComplaintStatus("In Progress", "member-1"), null);
});

test("preserves existing Pending and Resolved behavior without an officer", () => {
  assert.equal(validateComplaintStatus("Pending", null), null);
  assert.equal(validateComplaintStatus("Resolved", null), null);
});

// ==========================================
// 2. VALID STATUS TRANSITIONS
// ==========================================

test("Transition Validation: permits Pending -> Assigned when officer is assigned", () => {
  assert.equal(validateStatusTransition("Pending", "Assigned", "member-1"), null);
});

test("Transition Validation: permits Assigned -> In Progress when officer is assigned", () => {
  assert.equal(validateStatusTransition("Assigned", "In Progress", "member-1"), null);
});

test("Transition Validation: permits Assigned -> Resolved", () => {
  assert.equal(validateStatusTransition("Assigned", "Resolved", "member-1"), null);
});

test("Transition Validation: permits In Progress -> Resolved", () => {
  assert.equal(validateStatusTransition("In Progress", "Resolved", "member-1"), null);
});

test("Transition Validation: permits In Progress -> Assigned (pause/re-queue)", () => {
  assert.equal(validateStatusTransition("In Progress", "Assigned", "member-1"), null);
});

test("Transition Validation: permits reopening from Resolved -> Assigned with officer", () => {
  assert.equal(validateStatusTransition("Resolved", "Assigned", "member-1"), null);
});

test("Transition Validation: permits reopening from Resolved -> In Progress with officer", () => {
  assert.equal(validateStatusTransition("Resolved", "In Progress", "member-1"), null);
});

// ==========================================
// 3. INVALID / ILLEGAL TRANSITIONS
// ==========================================

test("Transition Validation: rejects Pending -> In Progress", () => {
  const err = validateStatusTransition("Pending", "In Progress", "member-1");
  assert.match(err, /Cannot transition complaint status from "Pending" to "In Progress"/);
});

test("Transition Validation: rejects Pending -> Resolved", () => {
  const err = validateStatusTransition("Pending", "Resolved", null);
  assert.match(err, /Cannot transition complaint status from "Pending" to "Resolved"/);
});

test("Transition Validation: rejects Assigned -> Pending", () => {
  const err = validateStatusTransition("Assigned", "Pending", "member-1");
  assert.match(err, /Cannot transition complaint status from "Assigned" to "Pending"/);
});

test("Transition Validation: rejects In Progress -> Pending", () => {
  const err = validateStatusTransition("In Progress", "Pending", "member-1");
  assert.match(err, /Cannot transition complaint status from "In Progress" to "Pending"/);
});

test("Transition Validation: rejects Resolved -> Pending", () => {
  const err = validateStatusTransition("Resolved", "Pending", null);
  assert.match(err, /Cannot transition complaint status from "Resolved" to "Pending"/);
});

// ==========================================
// 4. OFFICER REQUIREMENT IN TRANSITIONS
// ==========================================

test("Transition Validation: rejects Pending -> Assigned when officer is missing", () => {
  const err = validateStatusTransition("Pending", "Assigned", null);
  assert.match(err, /officer must be assigned before a complaint can be marked Assigned/);
});

test("Transition Validation: rejects Assigned -> In Progress when officer is missing", () => {
  const err = validateStatusTransition("Assigned", "In Progress", null);
  assert.match(err, /officer must be assigned before a complaint can be marked In Progress/);
});

test("Transition Validation: rejects Resolved -> In Progress when officer is missing", () => {
  const err = validateStatusTransition("Resolved", "In Progress", null);
  assert.match(err, /officer must be assigned before a complaint can be marked In Progress/);
});

// ==========================================
// 5. IDEMPOTENT (SAME-STATUS) TRANSITIONS
// ==========================================

test("Transition Validation: allows idempotent same-status update without error", () => {
  assert.equal(validateStatusTransition("Pending", "Pending", null), null);
  assert.equal(validateStatusTransition("Assigned", "Assigned", "member-1"), null);
  assert.equal(validateStatusTransition("In Progress", "In Progress", "member-1"), null);
  assert.equal(validateStatusTransition("Resolved", "Resolved", "member-1"), null);
});

// ==========================================
// 6. CONSTANTS & METADATA
// ==========================================

test("Transition Validation: VALID_STATUS_TRANSITIONS matches expected state graph", () => {
  assert.deepEqual(Array.from(VALID_STATUS_TRANSITIONS.Pending), ["Assigned"]);
  assert.deepEqual(Array.from(VALID_STATUS_TRANSITIONS.Assigned), ["In Progress", "Resolved"]);
  assert.deepEqual(Array.from(VALID_STATUS_TRANSITIONS["In Progress"]), ["Assigned", "Resolved"]);
  assert.deepEqual(Array.from(VALID_STATUS_TRANSITIONS.Resolved), ["Assigned", "In Progress"]);
  assert.ok(OFFICER_REQUIRED_STATUSES.has("Assigned"));
  assert.ok(OFFICER_REQUIRED_STATUSES.has("In Progress"));
});
