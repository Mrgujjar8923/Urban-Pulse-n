import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import {
  updateComplaintStatus,
  assignComplaint,
} from "../src/controllers/complaint.controller.js";
import { Complaint } from "../src/models/Complaint.js";
import { Member } from "../src/models/Member.js";
import { User } from "../src/models/User.js";
import { Notification } from "../src/models/Notification.js";
import { runOverdueSlaJob } from "../src/services/slaEscalation.service.js";

const sampleId = () => new mongoose.Types.ObjectId().toString();

// Prevent Notification.create from buffering when no DB is connected
Notification.create = async (doc) => ({
  _id: sampleId(),
  ...doc,
});

// Prevent unmocked Member/User lookups from buffering when no DB is connected
const defaultOfficerUserId = sampleId();
Member.findById = (id) => {
  const obj = { _id: id, name: "Default Officer", department: "Water", userId: defaultOfficerUserId };
  const promise = Promise.resolve(obj);
  promise.select = () => ({
    lean: async () => obj,
  });
  return promise;
};

User.findOne = () => ({
  select: () => ({
    lean: async () => ({
      _id: defaultOfficerUserId,
      name: "Default Officer",
      email: "officer@example.com",
      department: "Water",
      status: "active",
      role: "citizen",
    }),
  }),
});

const createMockReqRes = ({ params = {}, body = {}, user = {} } = {}) => {
  const req = {
    params,
    body,
    user,
  };
  let responseStatus = 200;
  let responseJson = null;

  const res = {
    status(code) {
      responseStatus = code;
      return this;
    },
    json(data) {
      responseJson = data;
      return this;
    },
  };

  return { req, res, getResult: () => ({ status: responseStatus, json: responseJson }) };
};

// ==========================================
// 1. STATUS TRANSITION VALIDATION & RBAC
// ==========================================

test("updateComplaintStatus: rejects invalid transition Pending -> Resolved with HTTP 400", async () => {
  const complaintId = sampleId();
  const mockComplaint = {
    _id: complaintId,
    status: "Pending",
    category: "Water",
    assignedTo: null,
  };

  const origFindById = Complaint.findById;
  Complaint.findById = () => ({
    ...mockComplaint,
  });

  try {
    const { req, res, getResult } = createMockReqRes({
      params: { id: complaintId },
      body: { status: "Resolved", remarks: "Issue has been resolved successfully" },
      user: { role: "admin" },
    });

    await updateComplaintStatus(req, res);
    const result = getResult();

    assert.equal(result.status, 400);
    assert.match(result.json.message, /Cannot transition complaint status from "Pending" to "Resolved"/);
  } finally {
    Complaint.findById = origFindById;
  }
});

test("updateComplaintStatus: rejects invalid transition In Progress -> Pending with HTTP 400", async () => {
  const complaintId = sampleId();
  const mockComplaint = {
    _id: complaintId,
    status: "In Progress",
    category: "Roads",
    assignedTo: sampleId(),
  };

  const origFindById = Complaint.findById;
  Complaint.findById = () => ({
    ...mockComplaint,
  });

  try {
    const { req, res, getResult } = createMockReqRes({
      params: { id: complaintId },
      body: { status: "Pending" },
      user: { role: "admin" },
    });

    await updateComplaintStatus(req, res);
    const result = getResult();

    assert.equal(result.status, 400);
    assert.match(result.json.message, /Cannot transition complaint status from "In Progress" to "Pending"/);
  } finally {
    Complaint.findById = origFindById;
  }
});

// ==========================================
// 2. IDEMPOTENT STATUS UPDATE (NO TIMELINE CLUTTER / NO EXTRA DB WRITE)
// ==========================================

test("updateComplaintStatus: idempotent when status matches current status (no timeline write, no save)", async () => {
  const complaintId = sampleId();
  let saveCalled = false;
  const mockComplaint = {
    _id: complaintId,
    status: "In Progress",
    category: "Electricity",
    assignedTo: sampleId(),
    timeline: [{ eventType: "status_changed", status: "In Progress" }],
    save: async () => {
      saveCalled = true;
    },
  };

  const origFindById = Complaint.findById;
  Complaint.findById = (id) => {
    if (id === complaintId) {
      return {
        ...mockComplaint,
        populate: () => ({
          ...mockComplaint,
          toObject: () => ({ ...mockComplaint }),
        }),
      };
    }
    return null;
  };

  try {
    const { req, res, getResult } = createMockReqRes({
      params: { id: complaintId },
      body: { status: "In Progress" }, // SAME STATUS
      user: { role: "admin" },
    });

    await updateComplaintStatus(req, res);
    const result = getResult();

    assert.equal(result.status, 200);
    assert.equal(saveCalled, false, "Database save must NOT be called on idempotent status update");
    assert.equal(mockComplaint.timeline.length, 1, "Timeline length must remain unchanged on idempotent update");
  } finally {
    Complaint.findById = origFindById;
  }
});

// ==========================================
// 3. REOPENING & SLA PRESERVATION
// ==========================================

test("updateComplaintStatus: transitions In Progress -> Resolved setting sla.resolvedAt", async () => {
  const complaintId = sampleId();
  let savedComplaint = null;
  const mockComplaint = {
    _id: complaintId,
    status: "In Progress",
    category: "Water",
    assignedTo: sampleId(),
    sla: {
      startedAt: new Date("2026-11-08T08:00:00.000Z"),
      durationMinutes: 240,
      deadline: new Date("2026-11-08T12:00:00.000Z"),
      resolvedAt: undefined,
    },
    timeline: [],
    save: async function () {
      savedComplaint = this;
    },
  };

  const origFindById = Complaint.findById;
  Complaint.findById = () => ({
    ...mockComplaint,
    populate: () => ({
      ...mockComplaint,
      toObject: () => ({ ...mockComplaint }),
    }),
  });

  try {
    const { req, res, getResult } = createMockReqRes({
      params: { id: complaintId },
      body: { status: "Resolved", remarks: "Issue has been resolved successfully" },
      user: { role: "admin" },
    });

    await updateComplaintStatus(req, res);
    const result = getResult();

    assert.equal(result.status, 200);
    assert.equal(savedComplaint.status, "Resolved");
    assert.ok(savedComplaint.sla.resolvedAt instanceof Date);
    assert.equal(savedComplaint.timeline.length, 1);
    assert.equal(savedComplaint.timeline[0].eventType, "status_changed");
    assert.equal(savedComplaint.timeline[0].status, "Resolved");
  } finally {
    Complaint.findById = origFindById;
  }
});

test("updateComplaintStatus: reopening Resolved -> In Progress clears sla.resolvedAt and preserves deadline", async () => {
  const complaintId = sampleId();
  let savedComplaint = null;
  const initialStartedAt = new Date("2026-11-08T08:00:00.000Z");
  const initialDeadline = new Date("2026-11-08T12:00:00.000Z");

  const mockComplaint = {
    _id: complaintId,
    status: "Resolved",
    category: "Water",
    assignedTo: sampleId(),
    sla: {
      startedAt: initialStartedAt,
      durationMinutes: 240,
      deadline: initialDeadline,
      resolvedAt: new Date("2026-11-08T10:00:00.000Z"),
    },
    timeline: [],
    save: async function () {
      savedComplaint = this;
    },
  };

  const origFindById = Complaint.findById;
  Complaint.findById = () => ({
    ...mockComplaint,
    populate: () => ({
      ...mockComplaint,
      toObject: () => ({ ...mockComplaint }),
    }),
  });

  try {
    const { req, res, getResult } = createMockReqRes({
      params: { id: complaintId },
      body: { status: "In Progress" },
      user: { role: "admin" },
    });

    await updateComplaintStatus(req, res);
    const result = getResult();

    assert.equal(result.status, 200);
    assert.equal(savedComplaint.status, "In Progress");
    assert.equal(savedComplaint.sla.resolvedAt, undefined, "resolvedAt must be cleared on reopen");
    assert.equal(savedComplaint.sla.startedAt.toISOString(), initialStartedAt.toISOString(), "startedAt must be preserved");
    assert.equal(savedComplaint.sla.deadline.toISOString(), initialDeadline.toISOString(), "deadline must be preserved");
  } finally {
    Complaint.findById = origFindById;
  }
});

// ==========================================
// 5. SLA ESCALATION DEDUPLICATION & REOPENING PRESERVATION
// ==========================================

test("SLA Escalation: runOverdueSlaJob suppresses duplicate escalation event on already-escalated complaint", async () => {
  const complaintId = sampleId();
  const now = new Date("2026-11-08T12:00:00.000Z");
  const pastDeadline = new Date("2026-11-08T10:00:00.000Z");

  const overdueComplaint = {
    _id: complaintId,
    status: "In Progress",
    category: "Roads",
    sla: {
      deadline: pastDeadline,
      durationMinutes: 240,
    },
    timeline: [
      {
        eventType: "sla_overdue_escalated",
        timestamp: new Date("2026-11-08T10:01:00.000Z"),
      },
    ],
  };

  const origComplaintFind = Complaint.find;
  const origComplaintUpdateOne = Complaint.updateOne;
  const origUserFind = User.find;

  Complaint.find = () => ({
    select: () => ({
      lean: async () => [overdueComplaint],
    }),
  });

  let updateCalled = false;
  Complaint.updateOne = async (_filter) => {
    updateCalled = true;
    // Simulating MongoDB $not: { $elemMatch: { eventType: "sla_overdue_escalated" } }
    // Since it already has the event, modifiedCount is 0
    return { modifiedCount: 0 };
  };

  User.find = () => ({
    select: () => ({
      lean: async () => [{ _id: sampleId() }],
    }),
  });

  try {
    const outcome = await runOverdueSlaJob(now);
    assert.equal(outcome.examined, 1);
    assert.equal(outcome.escalated, 0, "Already-escalated complaint must not be counted as newly escalated");
    assert.equal(updateCalled, true);
  } finally {
    Complaint.find = origComplaintFind;
    Complaint.updateOne = origComplaintUpdateOne;
    User.find = origUserFind;
  }
});

test("SLA Escalation: runOverdueSlaJob escalates unescalated overdue complaint once", async () => {
  const complaintId = sampleId();
  const now = new Date("2026-11-08T12:00:00.000Z");
  const pastDeadline = new Date("2026-11-08T10:00:00.000Z");

  const freshOverdueComplaint = {
    _id: complaintId,
    status: "In Progress",
    category: "Roads",
    sla: {
      deadline: pastDeadline,
      durationMinutes: 240,
    },
    timeline: [], // NO prior escalation
  };

  const origComplaintFind = Complaint.find;
  const origComplaintUpdateOne = Complaint.updateOne;
  const origUserFind = User.find;

  Complaint.find = () => ({
    select: () => ({
      lean: async () => [freshOverdueComplaint],
    }),
  });

  let updateCalledWithFilter = null;
  Complaint.updateOne = async (filter, _update) => {
    updateCalledWithFilter = filter;
    return { modifiedCount: 1 };
  };

  User.find = () => ({
    select: () => ({
      lean: async () => [{ _id: sampleId() }],
    }),
  });

  try {
    const outcome = await runOverdueSlaJob(now);
    assert.equal(outcome.examined, 1);
    assert.equal(outcome.escalated, 1, "First-time overdue complaint must be escalated");
    assert.deepEqual(updateCalledWithFilter.timeline, {
      $not: { $elemMatch: { eventType: "sla_overdue_escalated" } },
    });
  } finally {
    Complaint.find = origComplaintFind;
    Complaint.updateOne = origComplaintUpdateOne;
    User.find = origUserFind;
  }
});


test("assignComplaint: rejects assignment when Member linked User account is inactive", async () => {
  const complaintId = sampleId();
  const memberId = sampleId();
  const inactiveUserId = sampleId();

  const origComplaintFindById = Complaint.findById;
  const origMemberFindById = Member.findById;
  const origUserFindById = User.findById;

  Complaint.findById = () => ({
    _id: complaintId,
    status: "Pending",
    category: "Roads",
  });

  Member.findById = () => ({
    _id: memberId,
    name: "Officer Smith",
    department: "Roads",
    userId: inactiveUserId,
  });

  User.findById = () => ({
    select: () => ({
      lean: async () => ({
        _id: inactiveUserId,
        status: "inactive", // INACTIVE ACCOUNT
      }),
    }),
  });

  try {
    const { req, res, getResult } = createMockReqRes({
      params: { id: complaintId },
      body: { memberId },
      user: { role: "admin" },
    });

    await assignComplaint(req, res);
    const result = getResult();

    assert.equal(result.status, 400);
    assert.match(result.json.message, /Cannot assign to an officer whose linked account is inactive/i);
  } finally {
    Complaint.findById = origComplaintFindById;
    Member.findById = origMemberFindById;
    User.findById = origUserFindById;
  }
});

test("assignComplaint: succeeds when Member linked User account is active", async () => {
  const complaintId = sampleId();
  const memberId = sampleId();
  const activeUserId = sampleId();
  let savedComplaint = null;

  const mockComplaint = {
    _id: complaintId,
    status: "Pending",
    category: "Roads",
    timeline: [],
    save: async function () {
      savedComplaint = this;
    },
  };

  const origComplaintFindById = Complaint.findById;
  const origMemberFindById = Member.findById;
  const origUserFindById = User.findById;
  const origUserFindOne = User.findOne;

  Complaint.findById = () => ({
    ...mockComplaint,
    populate: () => ({
      ...mockComplaint,
      toObject: () => ({ ...mockComplaint }),
    }),
  });

  const mockMember = {
    _id: memberId,
    name: "Officer Active",
    department: "Roads",
    userId: activeUserId,
  };

  Member.findById = () => {
    const promise = Promise.resolve(mockMember);
    promise.select = () => ({
      lean: async () => mockMember,
    });
    return promise;
  };

  User.findById = () => ({
    select: () => ({
      lean: async () => ({
        _id: activeUserId,
        status: "active", // ACTIVE
        role: "department",
        departmentRole: "officer",
        department: "Roads",
      }),
    }),
  });

  User.findOne = () => ({
    select: () => ({
      lean: async () => ({
        _id: activeUserId,
        name: "Officer Active",
        email: "officer@example.com",
        department: "Roads",
        status: "active",
      }),
    }),
  });

  try {
    const { req, res, getResult } = createMockReqRes({
      params: { id: complaintId },
      body: { memberId },
      user: { role: "admin" },
    });

    await assignComplaint(req, res);
    const result = getResult();

    assert.equal(result.status, 200);
    assert.equal(savedComplaint.status, "Assigned");
    assert.equal(savedComplaint.assignedTo.toString(), memberId.toString());
    assert.equal(savedComplaint.timeline[0].eventType, "officer_assigned");
  } finally {
    Complaint.findById = origComplaintFindById;
    Member.findById = origMemberFindById;
    User.findById = origUserFindById;
    User.findOne = origUserFindOne;
  }
});

test("assignComplaint: rejects assignment when Member department does not match complaint category", async () => {
  const complaintId = sampleId();
  const memberId = sampleId();

  const origComplaintFindById = Complaint.findById;
  const origMemberFindById = Member.findById;

  Complaint.findById = () => ({
    _id: complaintId,
    status: "Pending",
    category: "Water", // Water
  });

  Member.findById = () => ({
    _id: memberId,
    name: "Officer Health",
    department: "Health", // Health mismatch
  });

  try {
    const { req, res, getResult } = createMockReqRes({
      params: { id: complaintId },
      body: { memberId },
      user: { role: "admin" },
    });

    await assignComplaint(req, res);
    const result = getResult();

    assert.equal(result.status, 400);
    assert.match(result.json.message, /Member belongs to a different department/i);
  } finally {
    Complaint.findById = origComplaintFindById;
    Member.findById = origMemberFindById;
  }
});

test("assignComplaint: rejects assignment when Member has no linked User (unlinked officer)", async () => {
  const complaintId = sampleId();
  const memberId = sampleId();

  const origComplaintFindById = Complaint.findById;
  const origMemberFindById = Member.findById;

  Complaint.findById = () => ({
    _id: complaintId,
    status: "Pending",
    category: "Roads",
  });

  Member.findById = () => ({
    _id: memberId,
    name: "Unlinked Officer",
    department: "Roads",
    userId: null, // UNLINKED
  });

  try {
    const { req, res, getResult } = createMockReqRes({
      params: { id: complaintId },
      body: { memberId },
      user: { role: "admin" },
    });

    await assignComplaint(req, res);
    const result = getResult();

    assert.equal(result.status, 400);
    assert.match(result.json.message, /Cannot assign to an unlinked officer/i);
  } finally {
    Complaint.findById = origComplaintFindById;
    Member.findById = origMemberFindById;
  }
});

test("assignComplaint: rejects assignment when linked User is not a department officer", async () => {
  const complaintId = sampleId();
  const memberId = sampleId();
  const authorityUserId = sampleId();

  const origComplaintFindById = Complaint.findById;
  const origMemberFindById = Member.findById;
  const origUserFindById = User.findById;

  Complaint.findById = () => ({
    _id: complaintId,
    status: "Pending",
    category: "Roads",
  });

  Member.findById = () => ({
    _id: memberId,
    name: "Authority Member",
    department: "Roads",
    userId: authorityUserId,
  });

  User.findById = () => ({
    select: () => ({
      lean: async () => ({
        _id: authorityUserId,
        status: "active",
        role: "department",
        departmentRole: "authority", // NOT AN OFFICER
        department: "Roads",
      }),
    }),
  });

  try {
    const { req, res, getResult } = createMockReqRes({
      params: { id: complaintId },
      body: { memberId },
      user: { role: "admin" },
    });

    await assignComplaint(req, res);
    const result = getResult();

    assert.equal(result.status, 400);
    assert.match(result.json.message, /Cannot assign to an account that is not a department officer/i);
  } finally {
    Complaint.findById = origComplaintFindById;
    Member.findById = origMemberFindById;
    User.findById = origUserFindById;
  }
});

test("assignComplaint: rejects assignment when linked User department does not match complaint category", async () => {
  const complaintId = sampleId();
  const memberId = sampleId();
  const wrongDeptUserId = sampleId();

  const origComplaintFindById = Complaint.findById;
  const origMemberFindById = Member.findById;
  const origUserFindById = User.findById;

  Complaint.findById = () => ({
    _id: complaintId,
    status: "Pending",
    category: "Roads",
  });

  Member.findById = () => ({
    _id: memberId,
    name: "Cross Dept Member",
    department: "Roads",
    userId: wrongDeptUserId,
  });

  User.findById = () => ({
    select: () => ({
      lean: async () => ({
        _id: wrongDeptUserId,
        status: "active",
        role: "department",
        departmentRole: "officer",
        department: "Water Supply", // MISMATCH
      }),
    }),
  });

  try {
    const { req, res, getResult } = createMockReqRes({
      params: { id: complaintId },
      body: { memberId },
      user: { role: "admin" },
    });

    await assignComplaint(req, res);
    const result = getResult();

    assert.equal(result.status, 400);
    assert.match(result.json.message, /Linked officer account belongs to a different department/i);
  } finally {
    Complaint.findById = origComplaintFindById;
    Member.findById = origMemberFindById;
    User.findById = origUserFindById;
  }
});


