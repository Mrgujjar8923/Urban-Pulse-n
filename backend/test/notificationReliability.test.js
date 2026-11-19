import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import {
  notifyComplaintAssignment,
  notifyComplaintStatusChanged,
  notifyDepartmentUsers,
} from "../src/services/complaintNotification.service.js";

const sampleObjectId = () => new mongoose.Types.ObjectId().toString();

const createMockUserModel = (users) => ({
  findById(id) {
    const found = users.find((u) => u._id.toString() === id.toString());
    return {
      select() {
        return {
          lean: async () => found || null,
        };
      },
    };
  },
  findOne(query) {
    const found = users.find((u) => {
      if (query._id && u._id.toString() !== query._id.toString()) return false;
      if (query.status && u.status !== query.status) return false;
      if (query.role && u.role !== query.role) return false;
      if (query.departmentRole && u.departmentRole !== query.departmentRole) return false;
      if (query.department && u.department !== query.department) return false;
      return true;
    });
    return {
      select() {
        return {
          lean: async () => found || null,
        };
      },
    };
  },
  find(query) {
    const list = users.filter((u) => {
      if (query.status && u.status !== query.status) return false;
      if (query.role && u.role !== query.role) return false;
      if (query.departmentRole && u.departmentRole !== query.departmentRole) return false;
      if (query.department && u.department !== query.department) return false;
      return true;
    });
    return {
      select() {
        return {
          lean: async () => list,
        };
      },
    };
  },
});

const createMockMemberModel = (members) => ({
  findById(id) {
    const found = members.find((m) => m._id.toString() === id.toString());
    return {
      select() {
        return {
          lean: async () => found || null,
        };
      },
    };
  },
});

const createLogger = () => ({
  errors: [],
  error(...args) {
    this.errors.push(args);
  },
  warn() {},
  info() {},
});

// ==========================================
// 1. CIRCULAR REASSIGNMENT (A -> B -> A)
// ==========================================

test("Circular Reassignment: distinct operations generate separate notifications without dedupe key collision", async () => {
  const citizenId = sampleObjectId();
  const officerAUserId = sampleObjectId();
  const officerBUserId = sampleObjectId();
  const memberAId = sampleObjectId();
  const memberBId = sampleObjectId();
  const complaintId = sampleObjectId();

  const citizen = { _id: citizenId, role: "citizen", status: "active" };
  const officerAUser = { _id: officerAUserId, role: "department", departmentRole: "officer", department: "Water Supply", status: "active" };
  const officerBUser = { _id: officerBUserId, role: "department", departmentRole: "officer", department: "Water Supply", status: "active" };
  const memberA = { _id: memberAId, name: "Officer A", department: "Water Supply", userId: officerAUserId };
  const memberB = { _id: memberBId, name: "Officer B", department: "Water Supply", userId: officerBUserId };

  const userModel = createMockUserModel([citizen, officerAUser, officerBUser]);
  const memberModel = createMockMemberModel([memberA, memberB]);

  const persistedNotifications = [];
  const dedupeKeySet = new Set();

  const notificationModel = {
    async create(doc) {
      if (doc.dedupeKey && dedupeKeySet.has(doc.dedupeKey)) {
        const error = new Error("E11000 duplicate key error");
        error.code = 11000;
        throw error;
      }
      if (doc.dedupeKey) dedupeKeySet.add(doc.dedupeKey);
      persistedNotifications.push(doc);
      return doc;
    },
  };

  const emit = async () => true;

  // Step 1: Assign to Officer A at T1
  const complaintT1 = {
    _id: complaintId,
    title: "Leaking valve",
    category: "Water Supply",
    createdBy: citizenId,
    assignedTo: memberAId,
    updatedAt: new Date("2026-11-09T10:00:00.000Z"),
  };

  const result1 = await notifyComplaintAssignment(complaintT1, null, {
    userModel,
    memberModel,
    notificationModel,
    emit,
    logger: createLogger(),
  });
  assert.equal(result1.created, 2, "T1: Citizen and Officer A must be notified");

  // Step 2: Reassign to Officer B at T2
  const complaintT2 = {
    ...complaintT1,
    assignedTo: memberBId,
    updatedAt: new Date("2026-11-09T10:30:00.000Z"),
  };

  const result2 = await notifyComplaintAssignment(complaintT2, memberAId, {
    userModel,
    memberModel,
    notificationModel,
    emit,
    logger: createLogger(),
  });
  assert.equal(result2.created, 3, "T2: Citizen, Officer B, and unassigned Officer A must be notified");

  // Step 3: Reassign BACK to Officer A at T3 (CIRCULAR)
  const complaintT3 = {
    ...complaintT1,
    assignedTo: memberAId,
    updatedAt: new Date("2026-11-09T11:00:00.000Z"),
  };

  const result3 = await notifyComplaintAssignment(complaintT3, memberBId, {
    userModel,
    memberModel,
    notificationModel,
    emit,
    logger: createLogger(),
  });
  assert.equal(result3.created, 3, "T3: Circular reassignment must succeed without dedupe key collision");

  // Step 4: Verify idempotency - Retrying Step 3 with identical updatedAt timestamp
  const retryResult = await notifyComplaintAssignment(complaintT3, memberBId, {
    userModel,
    memberModel,
    notificationModel,
    emit,
    logger: createLogger(),
  });
  assert.equal(retryResult.created, 0, "Idempotent retry with identical timestamp must create 0 duplicate notifications");
});

// ==========================================
// 2. DEPARTMENT INTAKE TARGETING (AUTHORITIES ONLY)
// ==========================================

test("Department Targeting: sends new complaint submission notifications to Authorities only, excluding Field Officers", async () => {
  const authorityId = sampleObjectId();
  const officerId = sampleObjectId();
  const complaintId = sampleObjectId();

  const authorityUser = { _id: authorityId, role: "department", departmentRole: "authority", department: "Roads", status: "active" };
  const officerUser = { _id: officerId, role: "department", departmentRole: "officer", department: "Roads", status: "active" };

  const userModel = createMockUserModel([authorityUser, officerUser]);
  const persisted = [];

  const complaint = {
    _id: complaintId,
    category: "Roads",
  };

  const result = await notifyDepartmentUsers(complaint, {
    userModel,
    notificationModel: {
      async create(doc) {
        persisted.push(doc);
        return doc;
      },
    },
    emit: async () => true,
    logger: createLogger(),
  });

  assert.equal(result.created, 1);
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].userId.toString(), authorityId.toString(), "Notification must be sent to Authority");
  assert.ok(!persisted.some((n) => n.userId.toString() === officerId.toString()), "Field Officer must NOT receive submission notification");
});

// ==========================================
// 3. ASSIGNED OFFICER STATUS NOTIFICATIONS
// ==========================================

test("Officer Status Notification: notifies assigned Officer and Citizen when complaint status changes to Resolved", async () => {
  const citizenId = sampleObjectId();
  const officerUserId = sampleObjectId();
  const memberId = sampleObjectId();
  const complaintId = sampleObjectId();

  const citizen = { _id: citizenId, role: "citizen", status: "active" };
  const officerUser = { _id: officerUserId, role: "department", departmentRole: "officer", department: "Electricity", status: "active" };
  const member = { _id: memberId, name: "Officer Volt", department: "Electricity", userId: officerUserId };

  const userModel = createMockUserModel([citizen, officerUser]);
  const memberModel = createMockMemberModel([member]);
  const persisted = [];

  const complaint = {
    _id: complaintId,
    category: "Electricity",
    createdBy: citizenId,
    assignedTo: memberId,
    status: "Resolved",
    updatedAt: new Date("2026-11-09T11:15:00.000Z"),
  };

  const result = await notifyComplaintStatusChanged(complaint, "In Progress", {
    userModel,
    memberModel,
    notificationModel: {
      async create(doc) {
        persisted.push(doc);
        return doc;
      },
    },
    emit: async () => true,
    logger: createLogger(),
  });

  assert.equal(result.created, 2, "Both citizen owner and assigned officer must be notified on status change");
  assert.equal(persisted.length, 2);

  const citizenNotif = persisted.find((n) => n.userId.toString() === citizenId.toString());
  const officerNotif = persisted.find((n) => n.userId.toString() === officerUserId.toString());

  assert.ok(citizenNotif, "Citizen owner notification must exist");
  assert.ok(officerNotif, "Assigned officer notification must exist");
  assert.equal(citizenNotif.meta.type, "complaint_resolved");
  assert.equal(officerNotif.meta.type, "complaint_resolved");
  assert.match(citizenNotif.message, /Your complaint status is now Resolved/i);
  assert.match(officerNotif.message, /Assigned complaint status is now Resolved/i);
});

test("Officer Status Notification: notifies assigned Officer and Citizen when complaint is reopened", async () => {
  const citizenId = sampleObjectId();
  const officerUserId = sampleObjectId();
  const memberId = sampleObjectId();
  const complaintId = sampleObjectId();

  const citizen = { _id: citizenId, role: "citizen", status: "active" };
  const officerUser = { _id: officerUserId, role: "department", departmentRole: "officer", department: "Water Supply", status: "active" };
  const member = { _id: memberId, name: "Officer Hydro", department: "Water Supply", userId: officerUserId };

  const userModel = createMockUserModel([citizen, officerUser]);
  const memberModel = createMockMemberModel([member]);
  const persisted = [];

  const complaint = {
    _id: complaintId,
    category: "Water Supply",
    createdBy: citizenId,
    assignedTo: memberId,
    status: "In Progress",
    updatedAt: new Date("2026-11-09T11:20:00.000Z"),
  };

  // Reopening from "Resolved" to "In Progress"
  const result = await notifyComplaintStatusChanged(complaint, "Resolved", {
    userModel,
    memberModel,
    notificationModel: {
      async create(doc) {
        persisted.push(doc);
        return doc;
      },
    },
    emit: async () => true,
    logger: createLogger(),
  });

  assert.equal(result.created, 2);
  const officerNotif = persisted.find((n) => n.userId.toString() === officerUserId.toString());
  assert.ok(officerNotif);
  assert.equal(officerNotif.meta.type, "complaint_reopened");
  assert.match(officerNotif.message, /Assigned complaint has been reopened/i);
});

test("Officer Status Notification: notifies only citizen when complaint has no assigned officer", async () => {
  const citizenId = sampleObjectId();
  const complaintId = sampleObjectId();

  const citizen = { _id: citizenId, role: "citizen", status: "active" };
  const userModel = createMockUserModel([citizen]);
  const persisted = [];

  const complaint = {
    _id: complaintId,
    category: "Roads",
    createdBy: citizenId,
    assignedTo: null, // NO OFFICER ASSIGNED
    status: "Resolved",
    updatedAt: new Date("2026-11-09T11:25:00.000Z"),
  };

  const result = await notifyComplaintStatusChanged(complaint, "Assigned", {
    userModel,
    notificationModel: {
      async create(doc) {
        persisted.push(doc);
        return doc;
      },
    },
    emit: async () => true,
    logger: createLogger(),
  });

  assert.equal(result.created, 1);
  assert.equal(persisted[0].userId.toString(), citizenId.toString());
});

