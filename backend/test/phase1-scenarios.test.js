import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { getLoginValidationError } from "../src/controllers/auth.controller.js";
import {
  evaluateComplaintAccess,
  evaluateStatusUpdate,
  evaluateAssignComplaint,
} from "./officerAuthorization.test.js";
import { canAccessDepartmentComplaint } from "../src/services/complaintAccess.service.js";

const sampleId = () => new mongoose.Types.ObjectId().toString();

// Realistic test fixtures
const priyaMemberId = sampleId();
const amitMemberId = sampleId();

const roadOfficerUser = {
  _id: sampleId(),
  name: "Officer Priya",
  email: "officer.road@govai.gov",
  role: "department",
  departmentRole: "officer",
  department: "Road & Infrastructure",
  status: "active",
};

const electricityOfficerUser = {
  _id: sampleId(),
  name: "Officer Amit",
  email: "officer.electricity@govai.gov",
  role: "department",
  departmentRole: "officer",
  department: "Electricity",
  status: "active",
};

const unlinkedWaterOfficerUser = {
  _id: sampleId(),
  name: "Water Officer",
  email: "officer.water@govai.gov",
  role: "department",
  departmentRole: "officer",
  department: "Water Supply",
  status: "active",
};

const unlinkedEnvironmentOfficerUser = {
  _id: sampleId(),
  name: "Environment Officer",
  email: "officer.env@govai.gov",
  role: "department",
  departmentRole: "officer",
  department: "Environment",
  status: "active",
};

const inactiveOfficerUser = {
  _id: sampleId(),
  name: "Inactive Officer",
  email: "officer.inactive@govai.gov",
  role: "department",
  departmentRole: "officer",
  department: "Road & Infrastructure",
  status: "inactive",
};

const roadAuthorityUser = {
  _id: sampleId(),
  name: "Road Authority",
  email: "authority@demo.com",
  role: "department",
  departmentRole: "authority",
  department: "Road & Infrastructure",
  status: "active",
};

const adminUser = {
  _id: sampleId(),
  name: "System Admin",
  email: "admin@govai.gov",
  role: "admin",
  status: "active",
};

// Complaint fixtures
const priyaAssignedComplaint = {
  _id: sampleId(),
  title: "Pothole repair on MG Road",
  category: "Road & Infrastructure",
  status: "In Progress",
  assignedTo: priyaMemberId,
};

const amitAssignedComplaint = {
  _id: sampleId(),
  title: "Transformer sparking on 5th Ave",
  category: "Electricity",
  status: "In Progress",
  assignedTo: amitMemberId,
};

const unassignedRoadComplaint = {
  _id: sampleId(),
  title: "Faded lane markings near school",
  category: "Road & Infrastructure",
  status: "Pending",
  assignedTo: null,
};

const waterSupplyComplaint = {
  _id: sampleId(),
  title: "Low water pressure in sector 4",
  category: "Water Supply",
  status: "Assigned",
  assignedTo: sampleId(),
};

test("Scenario 1: Manual Road Officer login without specifying department upfront", () => {
  const validation = getLoginValidationError({
    user: roadOfficerUser,
    requestedRole: "department",
    departmentRole: "officer",
  });
  assert.equal(validation, null, "Manual officer login without department payload must succeed");
});

test("Scenario 2: Manual Electricity Officer login without specifying department upfront", () => {
  const validation = getLoginValidationError({
    user: electricityOfficerUser,
    requestedRole: "department",
    departmentRole: "officer",
  });
  assert.equal(validation, null, "Manual electricity officer login must succeed");
});

test("Scenario 3: Invalid credentials or role mismatches", () => {
  // Citizen role mismatch
  const roleMismatch = getLoginValidationError({
    user: roadOfficerUser,
    requestedRole: "citizen",
  });
  assert.equal(roleMismatch.status, 403);
  assert.match(roleMismatch.message, /registered as department/);

  // Department mismatch if provided
  const deptMismatch = getLoginValidationError({
    user: roadOfficerUser,
    requestedRole: "department",
    department: "Electricity",
    departmentRole: "officer",
  });
  assert.equal(deptMismatch.status, 403);
  assert.match(deptMismatch.message, /different department/);
});

test("Scenario 4: Inactive Officer login is rejected with 403", () => {
  const validation = getLoginValidationError({
    user: inactiveOfficerUser,
    requestedRole: "department",
    departmentRole: "officer",
  });
  assert.equal(validation.status, 403);
  assert.match(validation.message, /not active/);
});

test("Scenario 5: Unlinked Water Officer authenticates, but complaint access is rejected", () => {
  // Auth succeeds
  const authValidation = getLoginValidationError({
    user: unlinkedWaterOfficerUser,
    requestedRole: "department",
    departmentRole: "officer",
  });
  assert.equal(authValidation, null, "Unlinked officer can authenticate");

  // Complaint access without linked member fails with 403
  const access = evaluateComplaintAccess({
    user: unlinkedWaterOfficerUser,
    complaint: waterSupplyComplaint,
    linkedMember: null,
  });
  assert.equal(access.allowed, false);
  assert.equal(access.status, 403);
});

test("Scenario 6: Unlinked Environment Officer cannot access complaints", () => {
  const access = canAccessDepartmentComplaint({
    user: unlinkedEnvironmentOfficerUser,
    complaint: { category: "Environment", assignedTo: null },
    memberId: null,
  });
  assert.equal(access, false, "Unlinked officer cannot access unassigned complaint");
});

test("Scenario 7: Officer dashboard with zero complaints", () => {
  const assignedList = [priyaAssignedComplaint].filter(
    (c) => c.assignedTo === "non-existent-member"
  );
  assert.equal(assignedList.length, 0);
});

test("Scenario 8: Officer dashboard with assigned complaints", () => {
  const assignedList = [priyaAssignedComplaint, unassignedRoadComplaint].filter(
    (c) => c.assignedTo === priyaMemberId
  );
  assert.equal(assignedList.length, 1);
  assert.equal(assignedList[0]._id, priyaAssignedComplaint._id);
});

test("Scenario 9: Opening an assigned complaint by the linked officer", () => {
  const access = evaluateComplaintAccess({
    user: roadOfficerUser,
    complaint: priyaAssignedComplaint,
    linkedMember: { _id: priyaMemberId, name: "Officer Priya" },
  });
  assert.equal(access.allowed, true);
  assert.equal(access.status, 200);
});

test("Scenario 10: Opening another Officer's complaint is rejected with 403", () => {
  const access = evaluateComplaintAccess({
    user: roadOfficerUser,
    complaint: amitAssignedComplaint,
    linkedMember: { _id: priyaMemberId, name: "Officer Priya" },
  });
  assert.equal(access.allowed, false);
  assert.equal(access.status, 403);
});

test("Scenario 11: Opening an unassigned complaint by an officer is rejected with 403", () => {
  const access = evaluateComplaintAccess({
    user: roadOfficerUser,
    complaint: unassignedRoadComplaint,
    linkedMember: { _id: priyaMemberId, name: "Officer Priya" },
  });
  assert.equal(access.allowed, false);
  assert.equal(access.status, 403);
});

test("Scenario 12: Opening a cross-department complaint is rejected with 403", () => {
  const access = evaluateComplaintAccess({
    user: roadOfficerUser,
    complaint: waterSupplyComplaint,
    linkedMember: { _id: priyaMemberId, name: "Officer Priya" },
  });
  assert.equal(access.allowed, false);
  assert.equal(access.status, 403);
  assert.match(access.message, /another department/);
});

test("Scenario 13: Authority complaint access allows all complaints in their department", () => {
  // Assigned to Priya
  const access1 = evaluateComplaintAccess({
    user: roadAuthorityUser,
    complaint: priyaAssignedComplaint,
    linkedMember: null,
  });
  assert.equal(access1.allowed, true);
  assert.equal(access1.status, 200);

  // Unassigned in Road
  const access2 = evaluateComplaintAccess({
    user: roadAuthorityUser,
    complaint: unassignedRoadComplaint,
    linkedMember: null,
  });
  assert.equal(access2.allowed, true);
  assert.equal(access2.status, 200);

  // Cross-department rejected
  const access3 = evaluateComplaintAccess({
    user: roadAuthorityUser,
    complaint: waterSupplyComplaint,
    linkedMember: null,
  });
  assert.equal(access3.allowed, false);
  assert.equal(access3.status, 403);
});

test("Scenario 14: Admin has cross-department access to all complaints", () => {
  for (const complaint of [priyaAssignedComplaint, amitAssignedComplaint, unassignedRoadComplaint, waterSupplyComplaint]) {
    const access = evaluateComplaintAccess({
      user: adminUser,
      complaint,
      linkedMember: null,
    });
    assert.equal(access.allowed, true, `Admin must have access to complaint ${complaint.title}`);
    assert.equal(access.status, 200);
  }
});

