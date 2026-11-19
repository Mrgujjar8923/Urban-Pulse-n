import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { assignComplaint } from "../src/controllers/complaint.controller.js";
import { getOfficerOptions } from "../src/controllers/auth.controller.js";
import { validateMemberUserMapping, MemberMappingError } from "../src/services/memberMapping.service.js";
import { Complaint } from "../src/models/Complaint.js";
import { Member } from "../src/models/Member.js";
import { User } from "../src/models/User.js";
import { Notification } from "../src/models/Notification.js";

const sampleId = () => new mongoose.Types.ObjectId();

const createMockReqRes = ({ body = {}, params = {}, query = {}, user = {} } = {}) => {
  let statusCode = 200;
  let jsonPayload = null;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      jsonPayload = payload;
      return this;
    },
  };
  return {
    req: { body, params, query, user },
    res,
    getResult: () => ({ status: statusCode, json: jsonPayload }),
  };
};

test("Phase 8.11 Integration: 1. Unlinked Officer assignment is rejected with HTTP 400", async () => {
  const complaintId = sampleId();
  const memberId = sampleId();

  const origComplaintFindById = Complaint.findById;
  const origMemberFindById = Member.findById;

  Complaint.findById = () => ({
    _id: complaintId,
    status: "Pending",
    category: "Road & Infrastructure",
  });

  Member.findById = () => ({
    _id: memberId,
    name: "Officer Ghost",
    department: "Road & Infrastructure",
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

test("Phase 8.11 Integration: 2. Inactive Officer assignment is rejected with HTTP 400", async () => {
  const complaintId = sampleId();
  const memberId = sampleId();
  const inactiveUserId = sampleId();

  const origComplaintFindById = Complaint.findById;
  const origMemberFindById = Member.findById;
  const origUserFindById = User.findById;

  Complaint.findById = () => ({
    _id: complaintId,
    status: "Pending",
    category: "Road & Infrastructure",
  });

  Member.findById = () => ({
    _id: memberId,
    name: "Officer Inactive",
    department: "Road & Infrastructure",
    userId: inactiveUserId,
  });

  User.findById = () => ({
    select: () => ({
      lean: async () => ({
        _id: inactiveUserId,
        status: "inactive",
        role: "department",
        departmentRole: "officer",
        department: "Road & Infrastructure",
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

test("Phase 8.11 Integration: 3. Wrong-department Officer assignment is rejected with HTTP 400", async () => {
  const complaintId = sampleId();
  const memberId = sampleId();
  const waterOfficerUserId = sampleId();

  const origComplaintFindById = Complaint.findById;
  const origMemberFindById = Member.findById;
  const origUserFindById = User.findById;

  // Case A: Member department does not match complaint category
  Complaint.findById = () => ({
    _id: complaintId,
    status: "Pending",
    category: "Road & Infrastructure",
  });

  Member.findById = () => ({
    _id: memberId,
    name: "Officer Water",
    department: "Water Supply", // MISMATCH
    userId: waterOfficerUserId,
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
    User.findById = origUserFindById;
  }
});

test("Phase 8.11 Integration: 4. Valid linked Officer assignment succeeds with status update and timeline record", async () => {
  const complaintId = sampleId();
  const memberId = sampleId();
  const activeOfficerUserId = sampleId();
  let savedComplaint = null;

  const mockComplaint = {
    _id: complaintId,
    status: "Pending",
    category: "Road & Infrastructure",
    timeline: [],
    save: async function () {
      savedComplaint = this;
    },
  };

  const origComplaintFindById = Complaint.findById;
  const origMemberFindById = Member.findById;
  const origUserFindById = User.findById;
  const origUserFindOne = User.findOne;
  const origNotificationCreate = Notification.create;

  Notification.create = async () => ({});

  Complaint.findById = () => ({
    ...mockComplaint,
    populate: () => ({
      ...mockComplaint,
      toObject: () => ({ ...mockComplaint }),
    }),
  });

  const mockMember = {
    _id: memberId,
    name: "Officer Priya",
    department: "Road & Infrastructure",
    userId: activeOfficerUserId,
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
        _id: activeOfficerUserId,
        status: "active",
        role: "department",
        departmentRole: "officer",
        department: "Road & Infrastructure",
      }),
    }),
  });

  User.findOne = () => ({
    select: () => ({
      lean: async () => ({
        _id: activeOfficerUserId,
        name: "Officer Priya",
        email: "road.demo@govai.gov",
        department: "Road & Infrastructure",
        status: "active",
      }),
    }),
  });

  try {
    const { req, res, getResult } = createMockReqRes({
      params: { id: complaintId },
      body: { memberId },
      user: {
        role: "department",
        department: "Road & Infrastructure",
        departmentRole: "authority",
      },
    });

    await assignComplaint(req, res);
    const result = getResult();

    assert.equal(result.status, 200);
    assert.equal(savedComplaint.status, "Assigned");
    assert.equal(savedComplaint.assignedTo.toString(), memberId.toString());
    assert.equal(savedComplaint.timeline.length, 1);
    assert.equal(savedComplaint.timeline[0].eventType, "officer_assigned");
    assert.equal(savedComplaint.timeline[0].note, "Officer Priya");
  } finally {
    Complaint.findById = origComplaintFindById;
    Member.findById = origMemberFindById;
    User.findById = origUserFindById;
    User.findOne = origUserFindOne;
    Notification.create = origNotificationCreate;
  }
});

test("Phase 8.11 Integration: 5. Officer options API returns only active, linked Officers and excludes unlinked/inactive", async () => {
  const origMemberFind = Member.find;

  const activeOfficer = {
    _id: sampleId(),
    name: "Officer Priya",
    email: "road.demo@govai.gov",
    department: "Road & Infrastructure",
    role: "department",
    departmentRole: "officer",
    status: "active",
  };

  const inactiveOfficer = {
    _id: sampleId(),
    name: "Officer Inactive",
    email: "inactive@govai.gov",
    department: "Road & Infrastructure",
    role: "department",
    departmentRole: "officer",
    status: "inactive", // INACTIVE
  };

  const authorityAccount = {
    _id: sampleId(),
    name: "Authority Boss",
    email: "boss@govai.gov",
    department: "Road & Infrastructure",
    role: "department",
    departmentRole: "authority", // AUTHORITY, NOT OFFICER
    status: "active",
  };

  const mockRoster = [
    {
      _id: sampleId(),
      name: "Officer Priya",
      department: "Road & Infrastructure",
      userId: activeOfficer,
    },
    {
      _id: sampleId(),
      name: "Officer Inactive",
      department: "Road & Infrastructure",
      userId: inactiveOfficer,
    },
    {
      _id: sampleId(),
      name: "Authority Member",
      department: "Road & Infrastructure",
      userId: authorityAccount,
    },
    {
      _id: sampleId(),
      name: "Unlinked Member",
      department: "Road & Infrastructure",
      userId: null,
    },
  ];

  Member.find = () => ({
    populate: () => ({
      sort: () => ({
        lean: async () => mockRoster,
      }),
    }),
  });

  try {
    const { req, res, getResult } = createMockReqRes({
      query: { department: "Road & Infrastructure" },
    });

    await getOfficerOptions(req, res);
    const result = getResult();

    assert.equal(result.status, 200);
    assert.equal(Array.isArray(result.json), true);
    // Only activeOfficer should be included
    assert.equal(result.json.length, 1);
    assert.equal(result.json[0].name, "Officer Priya");
    assert.equal(result.json[0].email, "road.demo@govai.gov");
    assert.equal(result.json[0].isLinked, true);
    assert.equal(result.json[0].statusBadge, "Active • Linked");

    // Zero sensitive fields exposed
    assert.equal(result.json[0].password, undefined);
    assert.equal(result.json[0].passwordResetToken, undefined);
  } finally {
    Member.find = origMemberFind;
  }
});

test("Phase 8.11 Integration: 6. Department filtering in officer options strictly rejects invalid departments", async () => {
  const { req, res, getResult } = createMockReqRes({
    query: { department: "Invalid Department XYZ" },
  });

  await getOfficerOptions(req, res);
  const result = getResult();

  assert.equal(result.status, 400);
  assert.match(result.json.message, /Invalid department/i);
});

test("Phase 8.11 Integration: 7. Duplicate Member/User mapping is safely rejected with HTTP 409 Conflict", async () => {
  const userId = sampleId();
  const existingMemberId = sampleId();

  const mockUserModel = {
    findById: () => ({
      select: () => ({
        lean: async () => ({
          _id: userId,
          name: "Officer Rajesh",
          email: "water.demo@govai.gov",
          role: "department",
          departmentRole: "officer",
          department: "Water Supply",
          status: "active",
        }),
      }),
    }),
  };

  const mockMemberModel = {
    findOne: () => ({
      select: () => ({
        lean: async () => ({
          _id: existingMemberId,
          name: "Existing Officer Rajesh Slot",
        }),
      }),
    }),
  };

  await assert.rejects(
    async () => {
      await validateMemberUserMapping({
        userId,
        department: "Water Supply",
        memberId: sampleId(), // Attempting to link to a DIFFERENT member slot
        userModel: mockUserModel,
        memberModel: mockMemberModel,
      });
    },
    (err) => {
      assert.equal(err instanceof MemberMappingError, true);
      assert.equal(err.statusCode, 409);
      assert.match(err.message, /already linked to another officer/i);
      return true;
    }
  );
});
