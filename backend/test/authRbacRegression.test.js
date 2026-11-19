import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { register } from "../src/controllers/auth.controller.js";
import { User } from "../src/models/User.js";
import { canAccessDepartmentComplaint } from "../src/services/complaintAccess.service.js";

const JWT_SECRET = process.env.JWT_SECRET || "phase6c-test-jwt-secret";
process.env.JWT_SECRET = JWT_SECRET;

const sampleId = () => new mongoose.Types.ObjectId().toString();

const createMockReqRes = (body) => {
  const req = {
    body,
  };
  let responseStatus = null;
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
// 1. REGISTRATION RBAC: PREVENT PUBLIC ADMIN
// ==========================================

test("Registration RBAC: rejects public Admin registration with HTTP 400", async () => {
  let createdCount = 0;
  const origCreate = User.create;
  User.create = () => {
    createdCount++;
    throw new Error("User.create should NEVER be called for admin registration!");
  };

  try {
    const { req, res, getResult } = createMockReqRes({
      name: "Malicious Attacker",
      email: "attacker@exploit.com",
      password: "password123!",
      role: "admin",
    });

    await register(req, res);
    const result = getResult();

    assert.equal(result.status, 400);
    assert.match(result.json.message, /Admin registration is not allowed/i);
    assert.equal(createdCount, 0, "No user document must be created on rejected admin registration");
  } finally {
    User.create = origCreate;
  }
});

test("Registration RBAC: rejects invalid, unknown or missing roles with HTTP 400", async () => {
  const invalidRoles = ["superadmin", "moderator", "root", "", null, undefined];

  for (const invalidRole of invalidRoles) {
    const { req, res, getResult } = createMockReqRes({
      name: "Invalid Role User",
      email: "invalid@test.com",
      password: "password123!",
      role: invalidRole,
    });

    await register(req, res);
    const result = getResult();
    assert.equal(result.status, 400);
    assert.match(result.json.message, /Admin registration is not allowed|Invalid role/i);
  }
});

test("Registration RBAC: allows legitimate Citizen registration and returns HTTP 201", async () => {
  const origFindOne = User.findOne;
  const origCreate = User.create;

  const mockCitizen = {
    _id: sampleId(),
    name: "Valid Citizen",
    email: "citizen.legit@govai.gov",
    role: "citizen",
    status: "active",
    createdAt: new Date(),
  };

  User.findOne = () => Promise.resolve(null);
  User.create = (doc) => Promise.resolve({ ...mockCitizen, ...doc });

  try {
    const { req, res, getResult } = createMockReqRes({
      name: "Valid Citizen",
      email: "citizen.legit@govai.gov",
      password: "password123!",
      role: "citizen",
    });

    await register(req, res);
    const result = getResult();

    assert.equal(result.status, 201);
    assert.ok(result.json.token);
    assert.equal(result.json.user.role, "citizen");
    assert.equal(result.json.user.status, "active");
  } finally {
    User.findOne = origFindOne;
    User.create = origCreate;
  }
});

test("Registration RBAC: allows legitimate Department registration and marks pending with HTTP 202", async () => {
  const origFindOne = User.findOne;
  const origCreate = User.create;

  const mockDeptUser = {
    _id: sampleId(),
    name: "Applicant Officer",
    email: "applicant@govai.gov",
    role: "department",
    department: "Water Supply",
    departmentRole: "officer",
    status: "pending",
    createdAt: new Date(),
  };

  User.findOne = () => Promise.resolve(null);
  User.create = (doc) => Promise.resolve({ ...mockDeptUser, ...doc });

  try {
    const { req, res, getResult } = createMockReqRes({
      name: "Applicant Officer",
      email: "applicant@govai.gov",
      password: "password123!",
      role: "department",
      department: "Water Supply",
    });

    await register(req, res);
    const result = getResult();

    assert.equal(result.status, 202);
    assert.match(result.json.message, /pending admin approval/i);
    assert.equal(result.json.user.role, "department");
    assert.equal(result.json.user.status, "pending");
  } finally {
    User.findOne = origFindOne;
    User.create = origCreate;
  }
});

// ==========================================
// 2. CROSS-DEPARTMENT ACCESS RBAC
// ==========================================

test("Cross-Department RBAC: Department Authority is strictly denied access to another department's complaint", () => {
  const waterAuthority = {
    _id: sampleId(),
    role: "department",
    department: "Water Supply",
    departmentRole: "authority",
    status: "active",
  };

  const roadComplaint = {
    _id: sampleId(),
    category: "Road & Infrastructure",
    assignedTo: null,
  };

  const canAccess = canAccessDepartmentComplaint({
    user: waterAuthority,
    complaint: roadComplaint,
    memberId: null,
  });

  assert.equal(canAccess, false);
});

// ==========================================
// 3. OFFICER ACCESS & MEMBER LINKING RBAC
// ==========================================

test("Officer Queue RBAC: Officer can only access complaints explicitly assigned to their Member", () => {
  const officerMemberPriya = { _id: sampleId(), name: "Officer Priya", department: "Road & Infrastructure" };
  const officerMemberRajesh = { _id: sampleId(), name: "Officer Rajesh", department: "Road & Infrastructure" };

  const officerPriyaUser = {
    _id: sampleId(),
    role: "department",
    department: "Road & Infrastructure",
    departmentRole: "officer",
    status: "active",
  };

  const complaintAssignedToPriya = {
    _id: sampleId(),
    category: "Road & Infrastructure",
    assignedTo: officerMemberPriya._id,
  };

  const complaintAssignedToRajesh = {
    _id: sampleId(),
    category: "Road & Infrastructure",
    assignedTo: officerMemberRajesh._id,
  };

  // 1. Priya accesses her own assigned complaint -> ALLOWED
  const accessOwn = canAccessDepartmentComplaint({
    user: officerPriyaUser,
    complaint: complaintAssignedToPriya,
    memberId: officerMemberPriya._id,
  });
  assert.equal(accessOwn, true);

  // 2. Priya accesses Rajesh's complaint -> FORBIDDEN
  const accessPeer = canAccessDepartmentComplaint({
    user: officerPriyaUser,
    complaint: complaintAssignedToRajesh,
    memberId: officerMemberPriya._id,
  });
  assert.equal(accessPeer, false);
});

test("Officer Queue RBAC: Unlinked Officer is denied access to complaints", () => {
  const unlinkedOfficerUser = {
    _id: sampleId(),
    role: "department",
    department: "Water Supply",
    departmentRole: "officer",
    status: "active",
  };

  const complaint = {
    _id: sampleId(),
    category: "Water Supply",
    assignedTo: sampleId(),
  };

  const accessResult = canAccessDepartmentComplaint({
    user: unlinkedOfficerUser,
    complaint,
    memberId: null, // Unlinked
  });
  assert.equal(accessResult, false);
});

test("Officer Dynamic Authorization: Immediate access revocation upon Member unlinking", () => {
  const officerUser = {
    _id: sampleId(),
    role: "department",
    department: "Environment",
    departmentRole: "officer",
    status: "active",
  };

  const memberNeha = {
    _id: sampleId(),
    name: "Officer Neha",
    department: "Environment",
  };

  const complaint = {
    _id: sampleId(),
    category: "Environment",
    assignedTo: memberNeha._id,
  };

  // State 1: Officer is linked to memberNeha -> Has access
  const beforeUnlink = canAccessDepartmentComplaint({
    user: officerUser,
    complaint,
    memberId: memberNeha._id,
  });
  assert.equal(beforeUnlink, true);

  // State 2: Admin unlinks Neha (memberId becomes null in database)
  // Request is made with the EXACT SAME USER TOKEN
  const afterUnlink = canAccessDepartmentComplaint({
    user: officerUser,
    complaint,
    memberId: null, // Immediate database reflection
  });
  assert.equal(afterUnlink, false);
});
