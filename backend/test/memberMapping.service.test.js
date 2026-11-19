import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import {
  validateMemberUserMapping,
  resolveOfficerUser,
  findEligibleDepartmentUsers,
  MemberMappingError,
} from "../src/services/memberMapping.service.js";

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
      if (query._id?.$ne && m._id.toString() === query._id.$ne.toString()) return false;
      if (query.department && m.department !== query.department) return false;
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
    const list = members.filter((m) => {
      if (query.department && m.department !== query.department) return false;
      if (query.userId?.$ne === null && !m.userId) return false;
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

test("valid Member-to-User mapping: active department user with matching department", async () => {
  const userId = sampleObjectId();
  const user = {
    _id: userId,
    name: "Officer Verma",
    email: "verma@govai.gov",
    role: "department",
    department: "Road & Infrastructure",
    status: "active",
  };

  const userModel = createMockUserModel([user]);
  const memberModel = createMockMemberModel([]);

  const result = await validateMemberUserMapping({
    userId,
    department: "Road & Infrastructure",
    userModel,
    memberModel,
  });

  assert.equal(result.valid, true);
  assert.equal(result.user._id, userId);
  assert.equal(result.user.department, "Road & Infrastructure");
});

test("legacy department account without departmentRole remains mappable as an officer", async () => {
  const userId = sampleObjectId();
  const legacyOfficer = {
    _id: userId,
    name: "Legacy Road Officer",
    role: "department",
    department: "Road & Infrastructure",
    status: "active",
  };

  const result = await validateMemberUserMapping({
    userId,
    department: "Road & Infrastructure",
    userModel: createMockUserModel([legacyOfficer]),
    memberModel: createMockMemberModel([]),
  });

  assert.equal(result.valid, true);
  assert.equal(result.user._id, userId);
  assert.equal(result.user.departmentRole, undefined);
});

test("missing User mapping: null or undefined userId returns valid without linked user", async () => {
  const userModel = createMockUserModel([]);
  const memberModel = createMockMemberModel([]);

  const resultNull = await validateMemberUserMapping({
    userId: null,
    department: "Road & Infrastructure",
    userModel,
    memberModel,
  });
  assert.deepEqual(resultNull, { valid: true, user: null });

  const resultUndefined = await validateMemberUserMapping({
    userId: undefined,
    department: "Water Supply",
    userModel,
    memberModel,
  });
  assert.deepEqual(resultUndefined, { valid: true, user: null });
});

test("invalid or inactive linked account: throws appropriate MemberMappingError", async () => {
  const activeUserId = sampleObjectId();
  const pendingUserId = sampleObjectId();
  const rejectedUserId = sampleObjectId();
  const citizenUserId = sampleObjectId();
  const nonExistentUserId = sampleObjectId();

  const users = [
    { _id: activeUserId, name: "Active", role: "department", department: "Water Supply", status: "active" },
    { _id: pendingUserId, name: "Pending", role: "department", department: "Water Supply", status: "pending" },
    { _id: rejectedUserId, name: "Rejected", role: "department", department: "Water Supply", status: "rejected" },
    { _id: citizenUserId, name: "Citizen", role: "citizen", department: "Water Supply", status: "active" },
  ];

  const userModel = createMockUserModel(users);
  const memberModel = createMockMemberModel([]);

  // Non-existent user
  await assert.rejects(
    validateMemberUserMapping({ userId: nonExistentUserId, department: "Water Supply", userModel, memberModel }),
    (err) => err instanceof MemberMappingError && err.statusCode === 404
  );

  // Pending user
  await assert.rejects(
    validateMemberUserMapping({ userId: pendingUserId, department: "Water Supply", userModel, memberModel }),
    (err) => err instanceof MemberMappingError && err.statusCode === 400 && err.message.includes("must be active")
  );

  // Rejected user
  await assert.rejects(
    validateMemberUserMapping({ userId: rejectedUserId, department: "Water Supply", userModel, memberModel }),
    (err) => err instanceof MemberMappingError && err.statusCode === 400 && err.message.includes("must be active")
  );

  // Citizen account cannot act as officer
  await assert.rejects(
    validateMemberUserMapping({ userId: citizenUserId, department: "Water Supply", userModel, memberModel }),
    (err) => err instanceof MemberMappingError && err.statusCode === 400 && err.message.includes("department role")
  );

  // Authority account cannot be linked as field officer
  const authorityUserId = sampleObjectId();
  const authorityUserModel = createMockUserModel([
    { _id: authorityUserId, name: "Supervisor", role: "department", department: "Water Supply", departmentRole: "authority", status: "active" },
  ]);
  await assert.rejects(
    validateMemberUserMapping({ userId: authorityUserId, department: "Water Supply", userModel: authorityUserModel, memberModel }),
    (err) => err instanceof MemberMappingError && err.statusCode === 400 && err.message.includes("Department authority accounts cannot be linked")
  );
});

test("department mismatch: throws error when user department does not match member department", async () => {
  const userId = sampleObjectId();
  const user = {
    _id: userId,
    name: "Water Officer",
    role: "department",
    department: "Water Supply",
    status: "active",
  };

  const userModel = createMockUserModel([user]);
  const memberModel = createMockMemberModel([]);

  await assert.rejects(
    validateMemberUserMapping({
      userId,
      department: "Road & Infrastructure", // Mismatch!
      userModel,
      memberModel,
    }),
    (err) => err instanceof MemberMappingError && err.statusCode === 400 && err.message.includes("Department mismatch")
  );
});

test("prevents duplicate mapping: user already linked to another member cannot be relinked", async () => {
  const userId = sampleObjectId();
  const existingMemberId = sampleObjectId();
  const newMemberId = sampleObjectId();

  const user = {
    _id: userId,
    name: "Officer Sharma",
    role: "department",
    department: "Electricity",
    status: "active",
  };

  const members = [
    { _id: existingMemberId, name: "Officer Sharma", department: "Electricity", userId },
  ];

  const userModel = createMockUserModel([user]);
  const memberModel = createMockMemberModel(members);

  // Attempting to link to newMemberId fails because userId is already assigned to existingMemberId
  await assert.rejects(
    validateMemberUserMapping({
      userId,
      department: "Electricity",
      memberId: newMemberId,
      userModel,
      memberModel,
    }),
    (err) => err instanceof MemberMappingError && err.statusCode === 409 && err.message.includes("already linked")
  );

  // Updating the same existing member with its own userId succeeds
  const updateSameResult = await validateMemberUserMapping({
    userId,
    department: "Electricity",
    memberId: existingMemberId,
    userModel,
    memberModel,
  });
  assert.equal(updateSameResult.valid, true);
});

test("resolveOfficerUser: resolves active matching user and returns null for unlinked or inactive", async () => {
  const linkedUserId = sampleObjectId();
  const inactiveUserId = sampleObjectId();
  const memberId1 = sampleObjectId();
  const memberId2 = sampleObjectId();
  const unlinkedMemberId = sampleObjectId();

  const users = [
    { _id: linkedUserId, name: "Officer Active", role: "department", department: "Environment", status: "active" },
    { _id: inactiveUserId, name: "Officer Inactive", role: "department", department: "Environment", status: "pending" },
  ];

  const members = [
    { _id: memberId1, name: "Officer Active", department: "Environment", userId: linkedUserId },
    { _id: memberId2, name: "Officer Inactive", department: "Environment", userId: inactiveUserId },
    { _id: unlinkedMemberId, name: "Officer Unlinked", department: "Environment", userId: null },
  ];

  const userModel = createMockUserModel(users);
  const memberModel = createMockMemberModel(members);

  // Valid linked member
  const resolved = await resolveOfficerUser(memberId1, "Environment", { userModel, memberModel });
  assert.equal(resolved._id, linkedUserId);

  // Inactive linked user returns null
  const resolvedInactive = await resolveOfficerUser(memberId2, "Environment", { userModel, memberModel });
  assert.equal(resolvedInactive, null);

  // Unlinked member returns null
  const resolvedUnlinked = await resolveOfficerUser(unlinkedMemberId, "Environment", { userModel, memberModel });
  assert.equal(resolvedUnlinked, null);
});

test("findEligibleDepartmentUsers: lists eligible department users and flags linked ones", async () => {
  const user1 = { _id: sampleObjectId(), name: "Officer 1", email: "off1@govai.gov", role: "department", department: "Water Supply", status: "active" };
  const user2 = { _id: sampleObjectId(), name: "Officer 2", email: "off2@govai.gov", role: "department", department: "Water Supply", status: "active" };

  const members = [
    { _id: sampleObjectId(), name: "Officer 1", department: "Water Supply", userId: user1._id },
  ];

  const userModel = createMockUserModel([user1, user2]);
  const memberModel = createMockMemberModel(members);

  const eligible = await findEligibleDepartmentUsers({
    department: "Water Supply",
    userModel,
    memberModel,
  });

  assert.equal(eligible.length, 2);
  const entry1 = eligible.find((e) => e.id === user1._id.toString());
  const entry2 = eligible.find((e) => e.id === user2._id.toString());

  assert.equal(entry1.isLinked, true);
  assert.equal(entry2.isLinked, false);
});

