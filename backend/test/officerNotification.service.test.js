import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import {
  notifyComplaintAssignment,
  notifyComplaintStatusChanged,
  notifyDepartmentUsers,
  notifyFeedbackReceived,
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
  findOne(query) {
    const found = members.find((m) => {
      if (query.userId && (!m.userId || m.userId.toString() !== query.userId.toString())) return false;
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
});

const createLogger = () => ({
  errors: [],
  error(...args) {
    this.errors.push(args);
  },
  warn() {},
  info() {},
});

test("successful officer assignment notification: notifies both citizen owner and linked officer", async () => {
  const citizenId = sampleObjectId();
  const officerUserId = sampleObjectId();
  const memberId = sampleObjectId();
  const complaintId = sampleObjectId();

  const citizen = { _id: citizenId, role: "citizen", status: "active" };
  const officerUser = {
    _id: officerUserId,
    name: "Officer Ajay",
    role: "department",
    department: "Water Supply",
    status: "active",
  };
  const member = {
    _id: memberId,
    name: "Officer Ajay",
    department: "Water Supply",
    userId: officerUserId,
  };

  const complaint = {
    _id: complaintId,
    title: "Burst water main",
    category: "Water Supply",
    createdBy: citizenId,
    assignedTo: memberId,
  };

  const userModel = createMockUserModel([citizen, officerUser]);
  const memberModel = createMockMemberModel([member]);
  const persisted = [];
  const emitted = [];
  const logger = createLogger();

  const result = await notifyComplaintAssignment(complaint, null, {
    userModel,
    memberModel,
    notificationModel: {
      async create(notification) {
        persisted.push(notification);
        return notification;
      },
    },
    async emit(notification) {
      emitted.push(notification);
      return true;
    },
    logger,
  });

  assert.equal(result.created, 2);
  assert.equal(result.emitted, 2);
  assert.equal(persisted.length, 2);

  // 1. Citizen notification
  const citizenNotif = persisted.find((n) => n.userId.toString() === citizenId.toString());
  assert.ok(citizenNotif);
  assert.equal(citizenNotif.meta.type, "complaint_assigned");
  assert.equal(citizenNotif.meta.complaintId, complaintId);

  // 2. Officer notification
  const officerNotif = persisted.find((n) => n.userId.toString() === officerUserId.toString());
  assert.ok(officerNotif);
  assert.equal(officerNotif.meta.type, "complaint_assigned");
  assert.equal(officerNotif.meta.complaintId, complaintId);
  assert.equal(officerNotif.meta.department, "Water Supply");
  assert.ok(officerNotif.message.includes("Burst water main"));
  assert.equal(
    officerNotif.dedupeKey,
    `${complaintId}:officer-assigned:${officerUserId}:${memberId}`
  );
});

test("officer reassignment notification: notifies citizen, new officer, and previous officer", async () => {
  const citizenId = sampleObjectId();
  const oldOfficerUserId = sampleObjectId();
  const newOfficerUserId = sampleObjectId();
  const oldMemberId = sampleObjectId();
  const newMemberId = sampleObjectId();
  const complaintId = sampleObjectId();

  const citizen = { _id: citizenId, role: "citizen", status: "active" };
  const oldOfficerUser = {
    _id: oldOfficerUserId,
    name: "Old Officer",
    role: "department",
    department: "Road & Infrastructure",
    status: "active",
  };
  const newOfficerUser = {
    _id: newOfficerUserId,
    name: "New Officer",
    role: "department",
    department: "Road & Infrastructure",
    status: "active",
  };

  const oldMember = { _id: oldMemberId, name: "Old Officer", department: "Road & Infrastructure", userId: oldOfficerUserId };
  const newMember = { _id: newMemberId, name: "New Officer", department: "Road & Infrastructure", userId: newOfficerUserId };

  const complaint = {
    _id: complaintId,
    title: "Pothole repair on Main St",
    category: "Road & Infrastructure",
    createdBy: citizenId,
    assignedTo: newMemberId,
  };

  const userModel = createMockUserModel([citizen, oldOfficerUser, newOfficerUser]);
  const memberModel = createMockMemberModel([oldMember, newMember]);
  const persisted = [];

  const result = await notifyComplaintAssignment(complaint, oldMemberId, {
    userModel,
    memberModel,
    notificationModel: {
      async create(notification) {
        persisted.push(notification);
        return notification;
      },
    },
    async emit() {
      return true;
    },
    logger: createLogger(),
  });

  // Citizen + New Officer + Previous Officer = 3
  assert.equal(result.created, 3);
  assert.equal(result.emitted, 3);

  const citizenNotif = persisted.find((n) => n.userId.toString() === citizenId);
  const newOfficerNotif = persisted.find((n) => n.userId.toString() === newOfficerUserId);
  const oldOfficerNotif = persisted.find((n) => n.userId.toString() === oldOfficerUserId);

  assert.ok(citizenNotif, "Citizen must receive notification");
  assert.equal(citizenNotif.meta.type, "complaint_reassigned");

  assert.ok(newOfficerNotif, "New officer must receive reassignment notification");
  assert.equal(newOfficerNotif.meta.title, "Complaint reassigned to you");

  assert.ok(oldOfficerNotif, "Old officer must receive unassignment notification");
  assert.equal(oldOfficerNotif.meta.type, "complaint_unassigned");
  assert.ok(oldOfficerNotif.message.includes("has been reassigned to another officer"));
});

test("missing officer mapping: citizen is notified, no officer notification created, no error", async () => {
  const citizenId = sampleObjectId();
  const unlinkedMemberId = sampleObjectId();
  const complaintId = sampleObjectId();

  const citizen = { _id: citizenId, role: "citizen", status: "active" };
  const unlinkedMember = {
    _id: unlinkedMemberId,
    name: "Unlinked Roster Officer",
    department: "Electricity",
    userId: null, // Unlinked!
  };

  const complaint = {
    _id: complaintId,
    title: "Transformer sparking",
    category: "Electricity",
    createdBy: citizenId,
    assignedTo: unlinkedMemberId,
  };

  const userModel = createMockUserModel([citizen]);
  const memberModel = createMockMemberModel([unlinkedMember]);
  const persisted = [];

  const result = await notifyComplaintAssignment(complaint, null, {
    userModel,
    memberModel,
    notificationModel: {
      async create(notification) {
        persisted.push(notification);
        return notification;
      },
    },
    async emit() {
      return true;
    },
    logger: createLogger(),
  });

  assert.equal(result.created, 1);
  assert.equal(result.emitted, 1);
  assert.equal(persisted[0].userId.toString(), citizenId);
});

test("duplicate notification prevention: code 11000 duplicate key error returns created: 0", async () => {
  const citizenId = sampleObjectId();
  const complaintId = sampleObjectId();

  const complaint = {
    _id: complaintId,
    category: "Electricity",
    createdBy: citizenId,
    assignedTo: sampleObjectId(),
  };

  const userModel = createMockUserModel([{ _id: citizenId, role: "citizen", status: "active" }]);
  const memberModel = createMockMemberModel([]);

  const result = await notifyComplaintAssignment(complaint, null, {
    userModel,
    memberModel,
    notificationModel: {
      async create() {
        const error = new Error("E11000 duplicate key error collection");
        error.code = 11000;
        throw error;
      },
    },
    async emit() {
      return true;
    },
    logger: createLogger(),
  });

  assert.equal(result.created, 0);
  assert.equal(result.emitted, 0);
});

test("persistence before Socket.IO emission: persistence runs and completes before emission", async () => {
  const citizenId = sampleObjectId();
  const complaintId = sampleObjectId();
  const order = [];

  const complaint = {
    _id: complaintId,
    category: "Water Supply",
    createdBy: citizenId,
    assignedTo: sampleObjectId(),
  };

  const userModel = createMockUserModel([{ _id: citizenId, role: "citizen", status: "active" }]);
  const memberModel = createMockMemberModel([]);

  await notifyComplaintAssignment(complaint, null, {
    userModel,
    memberModel,
    notificationModel: {
      async create(doc) {
        order.push("persisted");
        return doc;
      },
    },
    async emit() {
      order.push("emitted");
      return true;
    },
    logger: createLogger(),
  });

  assert.deepEqual(order, ["persisted", "emitted"]);
});

test("socket failure after notification persistence: notification remains persisted, emission failure handled", async () => {
  const citizenId = sampleObjectId();
  const complaintId = sampleObjectId();
  const persisted = [];

  const complaint = {
    _id: complaintId,
    category: "Water Supply",
    createdBy: citizenId,
    assignedTo: sampleObjectId(),
  };

  const userModel = createMockUserModel([{ _id: citizenId, role: "citizen", status: "active" }]);
  const memberModel = createMockMemberModel([]);

  const result = await notifyComplaintAssignment(complaint, null, {
    userModel,
    memberModel,
    notificationModel: {
      async create(doc) {
        persisted.push(doc);
        return doc;
      },
    },
    async emit() {
      throw new Error("Socket connection dropped");
    },
    logger: createLogger(),
  });

  assert.equal(result.created, 1);
  assert.equal(result.emitted, 0);
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].userId.toString(), citizenId);
});

test("existing notification behavior preserved: complaint submission, status change, feedback", async () => {
  const citizenId = sampleObjectId();
  const deptUserId = sampleObjectId();
  const complaintId = sampleObjectId();

  const citizen = { _id: citizenId, role: "citizen", status: "active" };
  const deptUser = { _id: deptUserId, role: "department", departmentRole: "authority", department: "Environment", status: "active" };
  const userModel = createMockUserModel([citizen, deptUser]);

  const complaint = {
    _id: complaintId,
    category: "Environment",
    createdBy: citizenId,
    status: "Resolved",
  };

  // 1. Department submission notification
  const subResult = await notifyDepartmentUsers(complaint, {
    userModel,
    notificationModel: { async create(doc) { return doc; } },
    async emit() { return true; },
  });
  assert.equal(subResult.created, 1);

  // 2. Status change notification
  const statusResult = await notifyComplaintStatusChanged(complaint, "In Progress", {
    userModel,
    notificationModel: { async create(doc) { return doc; } },
    async emit() { return true; },
  });
  assert.equal(statusResult.created, 1);

  // 3. Feedback notification
  const feedbackResult = await notifyFeedbackReceived(complaint, { _id: "f-1" }, {
    userModel,
    notificationModel: { async create(doc) { return doc; } },
    async emit() { return true; },
  });
  assert.equal(feedbackResult.created, 1);
});
