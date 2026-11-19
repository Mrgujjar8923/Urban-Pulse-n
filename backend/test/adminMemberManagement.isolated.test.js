import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import {
  createMember,
  updateMember,
  listMembers,
  listEligibleDepartmentUsers,
} from "../src/controllers/member.controller.js";
import { Member } from "../src/models/Member.js";
import { User } from "../src/models/User.js";
import {
  validateMemberUserMapping,
  MemberMappingError,
} from "../src/services/memberMapping.service.js";

const sampleObjectId = () => new mongoose.Types.ObjectId().toString();

const createMockRes = () => {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };
  return res;
};

// Fixture helpers
const mockAdmin = {
  _id: sampleObjectId(),
  name: "System Admin",
  email: "admin@govai.gov",
  role: "admin",
  status: "active",
};

const mockWaterAuthority = {
  _id: sampleObjectId(),
  name: "Water Authority",
  email: "water.auth@govai.gov",
  role: "department",
  department: "Water Supply",
  departmentRole: "authority",
  status: "active",
};

const mockRoadOfficer = {
  _id: sampleObjectId(),
  name: "Road Officer Account",
  email: "road.officer@govai.gov",
  role: "department",
  department: "Road & Infrastructure",
  departmentRole: "officer",
  status: "active",
};

const mockWaterOfficer = {
  _id: sampleObjectId(),
  name: "Water Officer Account",
  email: "water.officer@govai.gov",
  role: "department",
  department: "Water Supply",
  departmentRole: "officer",
  status: "active",
};

// ==========================================
// ISOLATED IN-MEMORY TESTS (ZERO ATLAS WRITES)
// ==========================================

test("1. Link eligible officer to unlinked member", async () => {
  const memberId = sampleObjectId();
  const unlinkedMember = {
    _id: memberId,
    name: "Officer Rajesh",
    department: "Water Supply",
    userId: null,
    save: async function () {
      return this;
    },
  };

  const origMemberFindById = Member.findById;
  const origUserFindById = User.findById;
  const origMemberFindOne = Member.findOne;

  try {
    Member.findById = (id) => {
      if (id.toString() === memberId) {
        return {
          ...unlinkedMember,
          populate: async () => ({
            ...unlinkedMember,
            userId: mockWaterOfficer,
          }),
        };
      }
      return null;
    };

    User.findById = (id) => ({
      select: () => ({
        lean: async () => {
          if (id.toString() === mockWaterOfficer._id.toString()) return mockWaterOfficer;
          return null;
        },
      }),
    });

    Member.findOne = () => ({
      select: () => ({
        lean: async () => null,
      }),
    });

    const req = {
      params: { id: memberId },
      body: { userId: mockWaterOfficer._id.toString() },
      user: mockAdmin,
    };
    const res = createMockRes();

    await updateMember(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.name, "Officer Rajesh");
    assert.equal(res.body.userId._id.toString(), mockWaterOfficer._id.toString());
  } finally {
    Member.findById = origMemberFindById;
    User.findById = origUserFindById;
    Member.findOne = origMemberFindOne;
  }
});

test("2. Unlink existing officer from member", async () => {
  const memberId = sampleObjectId();
  const linkedMember = {
    _id: memberId,
    name: "Officer Priya",
    department: "Road & Infrastructure",
    userId: mockRoadOfficer._id,
    save: async function () {
      linkedMember.userId = this.userId;
      return this;
    },
    populate: async function () {
      return {
        ...linkedMember,
        userId: linkedMember.userId,
      };
    },
  };

  const origMemberFindById = Member.findById;

  try {
    Member.findById = (id) => {
      if (id.toString() === memberId) {
        return linkedMember;
      }
      return null;
    };

    const req = {
      params: { id: memberId },
      body: { unlinkUser: true },
      user: mockAdmin,
    };
    const res = createMockRes();

    await updateMember(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.userId, null);
    assert.equal(linkedMember.userId, null);
  } finally {
    Member.findById = origMemberFindById;
  }
});

test("3. Create member without officer", async () => {
  const newMemberId = sampleObjectId();
  const createdDoc = {
    _id: newMemberId,
    name: "New Unassigned Member",
    department: "Water Supply",
    userId: null,
    createdBy: mockAdmin._id,
  };

  const origMemberCreate = Member.create;
  const origMemberFindById = Member.findById;

  try {
    Member.create = async (doc) => {
      assert.equal(doc.name, "New Unassigned Member");
      assert.equal(doc.department, "Water Supply");
      assert.equal(doc.userId, null);
      return createdDoc;
    };

    Member.findById = (id) => ({
      populate: async () => createdDoc,
    });

    const req = {
      body: {
        name: "New Unassigned Member",
        department: "Water Supply",
      },
      user: mockAdmin,
    };
    const res = createMockRes();

    await createMember(req, res);

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.name, "New Unassigned Member");
    assert.equal(res.body.userId, null);
    assert.equal(res.body.department, "Water Supply");
  } finally {
    Member.create = origMemberCreate;
    Member.findById = origMemberFindById;
  }
});

test("4. Create member with eligible officer", async () => {
  const newMemberId = sampleObjectId();
  const createdDoc = {
    _id: newMemberId,
    name: "Officer Rajesh",
    department: "Water Supply",
    userId: mockWaterOfficer._id,
    createdBy: mockAdmin._id,
  };

  const origMemberCreate = Member.create;
  const origMemberFindById = Member.findById;
  const origUserFindById = User.findById;
  const origMemberFindOne = Member.findOne;

  try {
    User.findById = (id) => ({
      select: () => ({
        lean: async () => {
          if (id.toString() === mockWaterOfficer._id.toString()) return mockWaterOfficer;
          return null;
        },
      }),
    });

    Member.findOne = () => ({
      select: () => ({
        lean: async () => null,
      }),
    });

    Member.create = async (doc) => {
      assert.equal(doc.name, "Officer Rajesh");
      assert.equal(doc.department, "Water Supply");
      assert.equal(doc.userId.toString(), mockWaterOfficer._id.toString());
      return createdDoc;
    };

    Member.findById = (id) => ({
      populate: async () => ({
        ...createdDoc,
        userId: mockWaterOfficer,
      }),
    });

    const req = {
      body: {
        name: "Officer Rajesh",
        department: "Water Supply",
        userId: mockWaterOfficer._id.toString(),
      },
      user: mockAdmin,
    };
    const res = createMockRes();

    await createMember(req, res);

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.name, "Officer Rajesh");
    assert.equal(res.body.userId.email, "water.officer@govai.gov");
  } finally {
    Member.create = origMemberCreate;
    Member.findById = origMemberFindById;
    User.findById = origUserFindById;
    Member.findOne = origMemberFindOne;
  }
});

test("5. Reject cross-department linking", async () => {
  const memberId = sampleObjectId();
  const waterMember = {
    _id: memberId,
    name: "Officer Rajesh",
    department: "Water Supply",
    userId: null,
    save: async function () {
      return this;
    },
  };

  const origMemberFindById = Member.findById;
  const origUserFindById = User.findById;

  try {
    Member.findById = () => waterMember;
    User.findById = () => ({
      select: () => ({
        // Officer belongs to Road & Infrastructure, but member is Water Supply
        lean: async () => mockRoadOfficer,
      }),
    });

    const req = {
      params: { id: memberId },
      body: { userId: mockRoadOfficer._id.toString() },
      user: mockAdmin,
    };
    const res = createMockRes();

    await updateMember(req, res);

    assert.equal(res.statusCode, 400);
    assert.ok(res.body.message.includes("Department mismatch"));
  } finally {
    Member.findById = origMemberFindById;
    User.findById = origUserFindById;
  }
});

test("6. Reject linking already-linked officer", async () => {
  const memberId = sampleObjectId();
  const existingMemberId = sampleObjectId();
  const waterMember = {
    _id: memberId,
    name: "Officer Rajesh",
    department: "Water Supply",
    userId: null,
    save: async function () {
      return this;
    },
  };

  const origMemberFindById = Member.findById;
  const origUserFindById = User.findById;
  const origMemberFindOne = Member.findOne;

  try {
    Member.findById = () => waterMember;
    User.findById = () => ({
      select: () => ({
        lean: async () => mockWaterOfficer,
      }),
    });
    Member.findOne = () => ({
      select: () => ({
        // Another member already maps this user
        lean: async () => ({ _id: existingMemberId, name: "Another Officer" }),
      }),
    });

    const req = {
      params: { id: memberId },
      body: { userId: mockWaterOfficer._id.toString() },
      user: mockAdmin,
    };
    const res = createMockRes();

    await updateMember(req, res);

    assert.equal(res.statusCode, 409);
    assert.ok(res.body.message.includes("User is already linked to another officer"));
  } finally {
    Member.findById = origMemberFindById;
    User.findById = origUserFindById;
    Member.findOne = origMemberFindOne;
  }
});

test("7. Reject authority account mapping", async () => {
  const memberId = sampleObjectId();
  const waterMember = {
    _id: memberId,
    name: "Officer Rajesh",
    department: "Water Supply",
    userId: null,
    save: async function () {
      return this;
    },
  };

  const origMemberFindById = Member.findById;
  const origUserFindById = User.findById;

  try {
    Member.findById = () => waterMember;
    User.findById = () => ({
      select: () => ({
        lean: async () => mockWaterAuthority,
      }),
    });

    const req = {
      params: { id: memberId },
      body: { userId: mockWaterAuthority._id.toString() },
      user: mockAdmin,
    };
    const res = createMockRes();

    await updateMember(req, res);

    assert.equal(res.statusCode, 400);
    assert.ok(res.body.message.includes("Department authority accounts cannot be linked"));
  } finally {
    Member.findById = origMemberFindById;
    User.findById = origUserFindById;
  }
});

test("8. Reject inactive/unapproved accounts", async () => {
  const memberId = sampleObjectId();
  const waterMember = {
    _id: memberId,
    name: "Officer Rajesh",
    department: "Water Supply",
    userId: null,
    save: async function () {
      return this;
    },
  };

  const inactiveOfficer = {
    ...mockWaterOfficer,
    status: "pending",
  };

  const origMemberFindById = Member.findById;
  const origUserFindById = User.findById;

  try {
    Member.findById = () => waterMember;
    User.findById = () => ({
      select: () => ({
        lean: async () => inactiveOfficer,
      }),
    });

    const req = {
      params: { id: memberId },
      body: { userId: inactiveOfficer._id.toString() },
      user: mockAdmin,
    };
    const res = createMockRes();

    await updateMember(req, res);

    assert.equal(res.statusCode, 400);
    assert.ok(res.body.message.includes("must be active"));
  } finally {
    Member.findById = origMemberFindById;
    User.findById = origUserFindById;
  }
});

test("9. Reject duplicate mapping attempts", async () => {
  const memberId = sampleObjectId();
  const waterMember = {
    _id: memberId,
    name: "Officer Rajesh",
    department: "Water Supply",
    userId: null,
    save: async function () {
      const err = new Error("E11000 duplicate key error collection");
      err.code = 11000;
      throw err;
    },
  };

  const origMemberFindById = Member.findById;
  const origUserFindById = User.findById;
  const origMemberFindOne = Member.findOne;

  try {
    Member.findById = () => waterMember;
    User.findById = () => ({
      select: () => ({
        lean: async () => mockWaterOfficer,
      }),
    });
    Member.findOne = () => ({
      select: () => ({
        lean: async () => null,
      }),
    });

    const req = {
      params: { id: memberId },
      body: { userId: mockWaterOfficer._id.toString() },
      user: mockAdmin,
    };
    const res = createMockRes();

    await updateMember(req, res);

    assert.equal(res.statusCode, 409);
    assert.ok(res.body.message.includes("already linked to another officer"));
  } finally {
    Member.findById = origMemberFindById;
    User.findById = origUserFindById;
    Member.findOne = origMemberFindOne;
  }
});

test("10. Verify concurrent linking safety via unique constraint simulation", async () => {
  // Simulate two concurrent requests trying to link the same user account
  const memberAId = sampleObjectId();
  const memberBId = sampleObjectId();

  let firstSaved = false;

  const makeMember = (id, name) => ({
    _id: id,
    name,
    department: "Water Supply",
    userId: null,
    save: async function () {
      if (firstSaved) {
        // Second concurrent save fails on partial unique index
        const err = new Error("E11000 duplicate key error index: userId_1");
        err.code = 11000;
        throw err;
      }
      firstSaved = true;
      return this;
    },
  });

  const origMemberFindById = Member.findById;
  const origUserFindById = User.findById;
  const origMemberFindOne = Member.findOne;

  try {
    User.findById = () => ({
      select: () => ({
        lean: async () => mockWaterOfficer,
      }),
    });
    // In concurrent race, findOne check might pass for both before either saves
    Member.findOne = () => ({
      select: () => ({
        lean: async () => null,
      }),
    });

    // Request A
    Member.findById = (id) => {
      const m = makeMember(id, "Officer A");
      return {
        ...m,
        populate: async () => m,
      };
    };
    const reqA = {
      params: { id: memberAId },
      body: { userId: mockWaterOfficer._id.toString() },
      user: mockAdmin,
    };
    const resA = createMockRes();

    // Request B
    const reqB = {
      params: { id: memberBId },
      body: { userId: mockWaterOfficer._id.toString() },
      user: mockAdmin,
    };
    const resB = createMockRes();

    await Promise.all([
      updateMember(reqA, resA),
      updateMember(reqB, resB),
    ]);

    const statuses = [resA.statusCode, resB.statusCode].sort();
    assert.deepEqual(statuses, [200, 409], "One concurrent link must succeed (200) and the second must fail (409)");
  } finally {
    Member.findById = origMemberFindById;
    User.findById = origUserFindById;
    Member.findOne = origMemberFindOne;
  }
});

test("11. Verify non-admin authorization restrictions", async () => {
  const memberId = sampleObjectId();
  const roadMember = {
    _id: memberId,
    name: "Officer Priya",
    department: "Road & Infrastructure",
    userId: null,
    save: async function () {
      return this;
    },
  };

  const origMemberFindById = Member.findById;

  try {
    Member.findById = () => roadMember;

    // A: Citizen cannot update members
    const citizenUser = {
      _id: sampleObjectId(),
      name: "Normal Citizen",
      role: "citizen",
      status: "active",
    };
    const reqCitizen = {
      params: { id: memberId },
      body: { unlinkUser: true },
      user: citizenUser,
    };
    const resCitizen = createMockRes();
    await updateMember(reqCitizen, resCitizen);
    assert.equal(resCitizen.statusCode, 403);
    assert.ok(resCitizen.body.message.includes("Only department authorities can manage"));

    // B: Field officer cannot update members
    const fieldOfficer = {
      _id: sampleObjectId(),
      name: "Field Officer",
      role: "department",
      department: "Road & Infrastructure",
      departmentRole: "officer",
      status: "active",
    };
    const reqOfficer = {
      params: { id: memberId },
      body: { unlinkUser: true },
      user: fieldOfficer,
    };
    const resOfficer = createMockRes();
    await updateMember(reqOfficer, resOfficer);
    assert.equal(resOfficer.statusCode, 403);
    assert.ok(resOfficer.body.message.includes("Only department authorities can manage"));

    // C: Authority of Water Supply cannot modify Member of Road & Infrastructure
    const waterAuthority = {
      _id: sampleObjectId(),
      name: "Water Authority",
      role: "department",
      department: "Water Supply",
      departmentRole: "authority",
      status: "active",
    };
    const reqWrongDept = {
      params: { id: memberId },
      body: { unlinkUser: true },
      user: waterAuthority,
    };
    const resWrongDept = createMockRes();
    await updateMember(reqWrongDept, resWrongDept);
    assert.equal(resWrongDept.statusCode, 403);
    assert.ok(resWrongDept.body.message.includes("Cannot modify members of another department"));
  } finally {
    Member.findById = origMemberFindById;
  }
});
