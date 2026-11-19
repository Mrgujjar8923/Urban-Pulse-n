import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { getLoginValidationError, getOfficerOptions } from "../src/controllers/auth.controller.js";
import { Member } from "../src/models/Member.js";

const departmentUser = (departmentRole = "authority", overrides = {}) => ({
  role: "department",
  department: "Road & Infrastructure",
  departmentRole,
  status: "active",
  ...overrides,
});

test("active Authority login requires the selected Authority role and matching department", () => {
  assert.equal(getLoginValidationError({
    user: departmentUser("authority"),
    requestedRole: "department",
    department: "Road & Infrastructure",
    departmentRole: "authority",
  }), null);
  assert.equal(getLoginValidationError({
    user: departmentUser("officer"),
    requestedRole: "department",
    department: "Road & Infrastructure",
    departmentRole: "authority",
  }).status, 403);
  assert.equal(getLoginValidationError({
    user: departmentUser("authority"),
    requestedRole: "department",
    department: "Water Supply",
    departmentRole: "authority",
  }).status, 403);
});

test("active Officer login is accepted, including an account without a Member link", () => {
  assert.equal(getLoginValidationError({
    user: departmentUser("officer"),
    requestedRole: "department",
    department: "Road & Infrastructure",
    departmentRole: "officer",
  }), null);

  // Normal Officer login: department omitted, backend determines from account
  assert.equal(getLoginValidationError({
    user: departmentUser("officer"),
    requestedRole: "department",
    departmentRole: "officer",
  }), null);

  // Mismatched department rejected
  assert.equal(getLoginValidationError({
    user: departmentUser("officer"),
    requestedRole: "department",
    department: "Water Supply",
    departmentRole: "officer",
  }).status, 403);

  // Officer attempting to authenticate on Authority account rejected
  assert.equal(getLoginValidationError({
    user: departmentUser("authority"),
    requestedRole: "department",
    departmentRole: "officer",
  }).status, 403);
});

test("inactive accounts and mismatched login roles are rejected without account mutation", () => {
  assert.equal(getLoginValidationError({
    user: departmentUser("officer", { status: "inactive" }),
    requestedRole: "department",
    department: "Road & Infrastructure",
    departmentRole: "officer",
  }).status, 403);
  assert.equal(getLoginValidationError({ user: { role: "citizen", status: "active" }, requestedRole: "admin" }).status, 403);
});

test("active Citizen and Admin role checks remain valid", () => {
  assert.equal(getLoginValidationError({ user: { role: "citizen", status: "active" }, requestedRole: "citizen" }), null);
  assert.equal(getLoginValidationError({ user: { role: "admin", status: "active" }, requestedRole: "admin" }), null);
});

test("getOfficerOptions: returns only active, linked officers without exposing sensitive fields", async () => {
  const origMemberFind = Member.find;

  const mockActiveOfficerUser = {
    _id: new mongoose.Types.ObjectId(),
    name: "Officer Priya",
    email: "road.demo@govai.gov",
    status: "active",
    role: "department",
    departmentRole: "officer",
    department: "Road & Infrastructure",
  };

  const mockInactiveOfficerUser = {
    _id: new mongoose.Types.ObjectId(),
    name: "Inactive Officer",
    email: "inactive@govai.gov",
    status: "inactive",
    role: "department",
    departmentRole: "officer",
    department: "Road & Infrastructure",
  };

  const mockMembers = [
    {
      _id: new mongoose.Types.ObjectId(),
      name: "Officer Priya",
      department: "Road & Infrastructure",
      userId: mockActiveOfficerUser,
    },
    {
      _id: new mongoose.Types.ObjectId(),
      name: "Inactive Member",
      department: "Road & Infrastructure",
      userId: mockInactiveOfficerUser,
    },
    {
      _id: new mongoose.Types.ObjectId(),
      name: "Unlinked Member",
      department: "Road & Infrastructure",
      userId: null,
    },
  ];

  Member.find = () => ({
    populate: () => ({
      sort: () => ({
        lean: async () => mockMembers,
      }),
    }),
  });

  try {
    let statusCode = 200;
    let jsonResult = null;
    const req = { query: { department: "Road & Infrastructure" } };
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        jsonResult = data;
        return this;
      },
    };

    await getOfficerOptions(req, res);

    assert.equal(statusCode, 200);
    assert.equal(Array.isArray(jsonResult), true);
    assert.equal(jsonResult.length, 1);
    assert.equal(jsonResult[0].name, "Officer Priya");
    assert.equal(jsonResult[0].email, "road.demo@govai.gov");
    assert.equal(jsonResult[0].department, "Road & Infrastructure");
    assert.equal(jsonResult[0].isLinked, true);
    assert.equal(jsonResult[0].statusBadge, "Active • Linked");

    // Verify sensitive data is NOT exposed
    assert.equal(jsonResult[0].password, undefined);
    assert.equal(jsonResult[0].passwordResetToken, undefined);
  } finally {
    Member.find = origMemberFind;
  }
});

test("getOfficerOptions: rejects invalid department with HTTP 400", async () => {
  let statusCode = 200;
  let jsonResult = null;
  const req = { query: { department: "Nonexistent Department" } };
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      jsonResult = data;
      return this;
    },
  };

  await getOfficerOptions(req, res);

  assert.equal(statusCode, 400);
  assert.match(jsonResult.message, /Invalid department/i);
});
