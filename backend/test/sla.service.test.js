import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateSlaState,
  withCalculatedSla,
  VALID_SLA_STATES,
} from "../src/services/sla.service.js";
import {
  getSlaDurationMinutes,
  SLA_DURATION_MINUTES,
} from "../src/config/sla.js";
import { createSla } from "../src/controllers/complaint.controller.js";

// ==========================================
// 1. SLA CONFIGURATION & PRIORITY DURATIONS
// ==========================================

test("SLA Durations: maps all priority levels to correct minutes", () => {
  assert.equal(getSlaDurationMinutes("Critical"), 4 * 60); // 240 mins (4 hours)
  assert.equal(getSlaDurationMinutes("High"), 24 * 60); // 1,440 mins (24 hours)
  assert.equal(getSlaDurationMinutes("Medium"), 72 * 60); // 4,320 mins (72 hours)
  assert.equal(getSlaDurationMinutes("Low"), 168 * 60); // 10,080 mins (168 hours / 7 days)
});

test("SLA Durations: returns null for undefined, null, or unknown priority directly from config", () => {
  assert.equal(getSlaDurationMinutes(undefined), null);
  assert.equal(getSlaDurationMinutes(null), null);
  assert.equal(getSlaDurationMinutes("UnknownPriority"), null);
});

test("SLA Durations: createSla defaults to Medium (72h) for undefined, null, or unknown priority", () => {
  assert.equal(createSla(undefined).durationMinutes, 72 * 60);
  assert.equal(createSla(null).durationMinutes, 72 * 60);
  assert.equal(createSla("UnknownPriority").durationMinutes, 72 * 60);
  assert.equal(createSla("").durationMinutes, 72 * 60);
});

test("SLA Durations: SLA_DURATION_MINUTES matches official constants", () => {
  assert.deepEqual(SLA_DURATION_MINUTES, {
    Critical: 240,
    High: 1440,
    Medium: 4320,
    Low: 10080,
  });
});

// ==========================================
// 2. SLA CALCULATION: RESOLVED STATUS
// ==========================================

test("SLA Calculation: marks Resolved complaint as Resolved with remainingMs 0", () => {
  const now = new Date("2026-11-08T12:00:00.000Z");
  const pastDeadline = new Date("2026-11-08T10:00:00.000Z");

  const complaint = {
    status: "Resolved",
    sla: {
      deadline: pastDeadline,
      durationMinutes: 240,
    },
  };

  const state = calculateSlaState(complaint, now);
  assert.equal(state.slaStatus, "Resolved");
  assert.equal(state.remainingMs, 0);
  assert.equal(state.isOverdue, false);
});

test("SLA Calculation: marks Resolved complaint as Resolved even when deadline is in future", () => {
  const now = new Date("2026-11-08T12:00:00.000Z");
  const futureDeadline = new Date("2026-11-08T16:00:00.000Z");

  const complaint = {
    status: "Resolved",
    sla: {
      deadline: futureDeadline,
      durationMinutes: 240,
    },
  };

  const state = calculateSlaState(complaint, now);
  assert.equal(state.slaStatus, "Resolved");
  assert.equal(state.remainingMs, 0);
  assert.equal(state.isOverdue, false);
});

// ==========================================
// 3. SLA CALCULATION: OVERDUE STATUS
// ==========================================

test("SLA Calculation: detects Overdue when remainingMs is negative", () => {
  const now = new Date("2026-11-08T12:00:00.000Z");
  const deadline = new Date("2026-11-08T11:59:59.999Z"); // 1ms overdue

  const complaint = {
    status: "In Progress",
    sla: {
      deadline,
      durationMinutes: 240,
    },
  };

  const state = calculateSlaState(complaint, now);
  assert.equal(state.slaStatus, "Overdue");
  assert.equal(state.remainingMs, -1);
  assert.equal(state.isOverdue, true);
});

test("SLA Calculation: detects Overdue for Assigned status past deadline", () => {
  const now = new Date("2026-11-08T15:00:00.000Z");
  const deadline = new Date("2026-11-08T12:00:00.000Z"); // 3 hours overdue

  const complaint = {
    status: "Assigned",
    sla: {
      deadline,
      durationMinutes: 240,
    },
  };

  const state = calculateSlaState(complaint, now);
  assert.equal(state.slaStatus, "Overdue");
  assert.equal(state.remainingMs, -3 * 3600 * 1000);
  assert.equal(state.isOverdue, true);
});

// ==========================================
// 4. SLA CALCULATION: DUE SOON BOUNDARIES (<= 20%)
// ==========================================

test("SLA Calculation: Due Soon at exact 20% remaining threshold", () => {
  const durationMinutes = 100; // Total 100 mins -> 20% is 20 mins
  const durationMs = durationMinutes * 60 * 1000;
  const now = new Date("2026-11-08T12:00:00.000Z");
  const deadline = new Date(now.getTime() + durationMs * 0.2); // exactly 20% remaining

  const complaint = {
    status: "In Progress",
    sla: {
      deadline,
      durationMinutes,
    },
  };

  const state = calculateSlaState(complaint, now);
  assert.equal(state.slaStatus, "Due Soon");
  assert.equal(state.remainingMs, durationMs * 0.2);
  assert.equal(state.isOverdue, false);
});

test("SLA Calculation: Due Soon at 10% remaining (below 20% threshold)", () => {
  const durationMinutes = 240;
  const durationMs = durationMinutes * 60 * 1000;
  const now = new Date("2026-11-08T12:00:00.000Z");
  const deadline = new Date(now.getTime() + durationMs * 0.1); // 10% remaining

  const complaint = {
    status: "Assigned",
    sla: {
      deadline,
      durationMinutes,
    },
  };

  const state = calculateSlaState(complaint, now);
  assert.equal(state.slaStatus, "Due Soon");
  assert.equal(state.isOverdue, false);
});

test("SLA Calculation: On Track at just above 20% threshold (20.1%)", () => {
  const durationMinutes = 100;
  const durationMs = durationMinutes * 60 * 1000;
  const now = new Date("2026-11-08T12:00:00.000Z");
  const deadline = new Date(now.getTime() + durationMs * 0.201); // 20.1% remaining

  const complaint = {
    status: "In Progress",
    sla: {
      deadline,
      durationMinutes,
    },
  };

  const state = calculateSlaState(complaint, now);
  assert.equal(state.slaStatus, "On Track");
  assert.equal(state.isOverdue, false);
});

// ==========================================
// 5. SLA CALCULATION: ON TRACK STATUS
// ==========================================

test("SLA Calculation: On Track with 80% duration remaining", () => {
  const durationMinutes = 1440; // High: 24h
  const durationMs = durationMinutes * 60 * 1000;
  const now = new Date("2026-11-08T12:00:00.000Z");
  const deadline = new Date(now.getTime() + durationMs * 0.8);

  const complaint = {
    status: "Pending",
    sla: {
      deadline,
      durationMinutes,
    },
  };

  const state = calculateSlaState(complaint, now);
  assert.equal(state.slaStatus, "On Track");
  assert.equal(state.remainingMs, durationMs * 0.8);
  assert.equal(state.isOverdue, false);
});

// ==========================================
// 6. SLA CALCULATION: INVALID & UNAVAILABLE INPUTS
// ==========================================

test("SLA Calculation: returns Unavailable when complaint or sla is missing", () => {
  assert.deepEqual(calculateSlaState(null), {
    slaStatus: "Unavailable",
    remainingMs: null,
    isOverdue: false,
  });

  assert.deepEqual(calculateSlaState({}), {
    slaStatus: "Unavailable",
    remainingMs: null,
    isOverdue: false,
  });

  assert.deepEqual(calculateSlaState({ sla: null }), {
    slaStatus: "Unavailable",
    remainingMs: null,
    isOverdue: false,
  });
});

test("SLA Calculation: returns Unavailable when deadline is invalid", () => {
  const invalidDateComplaint = {
    status: "In Progress",
    sla: {
      deadline: "not-a-valid-date",
      durationMinutes: 240,
    },
  };

  const state = calculateSlaState(invalidDateComplaint);
  assert.equal(state.slaStatus, "Unavailable");
  assert.equal(state.remainingMs, null);
  assert.equal(state.isOverdue, false);
});

test("SLA Calculation: returns Unavailable when durationMinutes is 0 or negative", () => {
  const now = new Date();
  const zeroDuration = {
    status: "In Progress",
    sla: {
      deadline: new Date(now.getTime() + 60000),
      durationMinutes: 0,
    },
  };

  const negDuration = {
    status: "In Progress",
    sla: {
      deadline: new Date(now.getTime() + 60000),
      durationMinutes: -60,
    },
  };

  assert.equal(calculateSlaState(zeroDuration, now).slaStatus, "Unavailable");
  assert.equal(calculateSlaState(negDuration, now).slaStatus, "Unavailable");
});

// ==========================================
// 7. withCalculatedSla ENRICHMENT
// ==========================================

test("withCalculatedSla: enriches plain complaint object", () => {
  const now = new Date("2026-11-08T12:00:00.000Z");
  const deadline = new Date("2026-11-08T16:00:00.000Z");
  const raw = {
    _id: "complaint-1",
    title: "Leaking Pipe",
    status: "In Progress",
    sla: {
      deadline,
      durationMinutes: 240,
    },
  };

  const enriched = withCalculatedSla(raw, now);
  assert.equal(enriched.sla.slaStatus, "On Track");
  assert.equal(enriched.sla.remainingMs, 4 * 3600 * 1000);
  assert.equal(enriched.sla.isOverdue, false);
  assert.equal(enriched.sla.durationMinutes, 240);
});

test("withCalculatedSla: enriches object with toObject() method without mutating original", () => {
  const now = new Date("2026-11-08T12:00:00.000Z");
  const doc = {
    _id: "doc-1",
    status: "Resolved",
    sla: {
      deadline: new Date("2026-11-08T10:00:00.000Z"),
      durationMinutes: 240,
    },
    toObject() {
      return { _id: this._id, status: this.status, sla: { ...this.sla } };
    },
  };

  const enriched = withCalculatedSla(doc, now);
  assert.equal(enriched.sla.slaStatus, "Resolved");
  assert.equal(enriched.sla.remainingMs, 0);
  assert.equal(enriched.sla.isOverdue, false);
});

test("VALID_SLA_STATES exports expected states", () => {
  assert.deepEqual(VALID_SLA_STATES, ["Resolved", "Overdue", "Due Soon", "On Track", "Unavailable"]);
});
