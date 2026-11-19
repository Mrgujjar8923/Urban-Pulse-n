import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";

// Pure helper function modeling the getComplaintById authorization logic
export const checkComplaintAccess = (user, complaint) => {
  if (!complaint) return { allowed: false, status: 404, message: "Complaint not found" };

  const isCitizenOwner = user.role === "citizen" && complaint.createdBy?._id?.toString() === user._id.toString();
  const isDeptOwner = user.role === "department" && complaint.category === user.department;
  const isAssignedOfficer = user.role === "department" && (
    complaint.assignedTo?.userId?.toString() === user._id.toString()
  );
  const isAdmin = user.role === "admin";

  if (!(isCitizenOwner || isDeptOwner || isAssignedOfficer || isAdmin)) {
    return { allowed: false, status: 403, message: "Forbidden" };
  }

  return { allowed: true, status: 200 };
};

const sampleId = () => new mongoose.Types.ObjectId();

test("unauthorized complaint access: non-owner citizen is rejected with 403", () => {
  const citizen1Id = sampleId();
  const citizen2Id = sampleId();

  const complaint = {
    _id: sampleId(),
    category: "Electricity",
    createdBy: { _id: citizen1Id },
  };

  const user = { _id: citizen2Id, role: "citizen" };
  const result = checkComplaintAccess(user, complaint);
  assert.equal(result.allowed, false);
  assert.equal(result.status, 403);
});

test("unauthorized complaint access: officer from unrelated department is rejected with 403", () => {
  const officerId = sampleId();
  const complaint = {
    _id: sampleId(),
    category: "Water Supply",
    createdBy: { _id: sampleId() },
    assignedTo: null,
  };

  const user = { _id: officerId, role: "department", department: "Electricity" };
  const result = checkComplaintAccess(user, complaint);
  assert.equal(result.allowed, false);
  assert.equal(result.status, 403);
});

test("authorized complaint access: citizen owner can access their complaint", () => {
  const citizenId = sampleId();
  const complaint = {
    _id: sampleId(),
    category: "Water Supply",
    createdBy: { _id: citizenId },
  };

  const user = { _id: citizenId, role: "citizen" };
  const result = checkComplaintAccess(user, complaint);
  assert.equal(result.allowed, true);
  assert.equal(result.status, 200);
});

test("authorized complaint access: department officer in matching department can access complaint", () => {
  const officerId = sampleId();
  const complaint = {
    _id: sampleId(),
    category: "Road & Infrastructure",
    createdBy: { _id: sampleId() },
  };

  const user = { _id: officerId, role: "department", department: "Road & Infrastructure" };
  const result = checkComplaintAccess(user, complaint);
  assert.equal(result.allowed, true);
  assert.equal(result.status, 200);
});

test("authorized complaint access: explicitly assigned officer can access complaint", () => {
  const officerUserId = sampleId();
  const complaint = {
    _id: sampleId(),
    category: "Environment",
    createdBy: { _id: sampleId() },
    assignedTo: {
      _id: sampleId(),
      name: "Officer Verma",
      department: "Environment",
      userId: officerUserId,
    },
  };

  const user = { _id: officerUserId, role: "department", department: "Environment" };
  const result = checkComplaintAccess(user, complaint);
  assert.equal(result.allowed, true);
  assert.equal(result.status, 200);
});

test("authorized complaint access: admin has full access across departments", () => {
  const adminId = sampleId();
  const complaint = {
    _id: sampleId(),
    category: "Electricity",
    createdBy: { _id: sampleId() },
  };

  const user = { _id: adminId, role: "admin" };
  const result = checkComplaintAccess(user, complaint);
  assert.equal(result.allowed, true);
  assert.equal(result.status, 200);
});

