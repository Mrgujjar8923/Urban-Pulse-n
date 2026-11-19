import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";

const sampleId = () => new mongoose.Types.ObjectId().toString();

/**
 * Pure authorization model matching backend/src/controllers/complaint.controller.js
 */
export const evaluateComplaintAccess = ({ user, complaint, linkedMember }) => {
  if (!complaint) return { allowed: false, status: 404, message: "Complaint not found" };

  if (user.role === "admin") {
    return { allowed: true, status: 200 };
  }

  if (user.role === "citizen") {
    const isOwner = complaint.createdBy?._id?.toString() === user._id.toString()
      || complaint.createdBy?.toString() === user._id.toString();
    if (!isOwner) return { allowed: false, status: 403, message: "Forbidden" };
    return { allowed: true, status: 200 };
  }

  if (user.role === "department") {
    if (complaint.category !== user.department) {
      return { allowed: false, status: 403, message: "Forbidden: Cannot access complaints from another department" };
    }

    if (user.status && user.status !== "active") {
      return { allowed: false, status: 403, message: "Forbidden: Account is not active" };
    }

    // Explicit server-controlled authority permission
    if (user.departmentRole === "authority") {
      return { allowed: true, status: 200 };
    }

    // Officers and unmapped accounts can strictly ONLY access complaints assigned to their linked Member
    if (!linkedMember) {
      return { allowed: false, status: 403, message: "Forbidden: Officers can only access complaints assigned to them" };
    }

    const assignedId = complaint.assignedTo?._id?.toString() || complaint.assignedTo?.toString();
    const isAssignedToOfficer = assignedId && assignedId === linkedMember._id.toString();

    if (!isAssignedToOfficer) {
      return { allowed: false, status: 403, message: "Forbidden: Officers can only access complaints assigned to them" };
    }

    return { allowed: true, status: 200 };
  }

  return { allowed: false, status: 403, message: "Forbidden" };
};

export const evaluateStatusUpdate = ({ user, complaint, newStatus, linkedMember }) => {
  if (user.role === "admin") {
    return { allowed: true, status: 200 };
  }

  if (user.role === "department") {
    if (complaint.category !== user.department) {
      return { allowed: false, status: 403, message: "Cannot modify other departments" };
    }

    if (user.status && user.status !== "active") {
      return { allowed: false, status: 403, message: "Forbidden: Account is not active" };
    }

    if (user.departmentRole === "authority") {
      return { allowed: true, status: 200 };
    }

    if (!linkedMember) {
      return { allowed: false, status: 403, message: "Officers can only update complaints assigned to them" };
    }

    const assignedId = complaint.assignedTo?._id?.toString() || complaint.assignedTo?.toString();
    if (!assignedId || assignedId !== linkedMember._id.toString()) {
      return { allowed: false, status: 403, message: "Officers can only update complaints assigned to them" };
    }

    return { allowed: true, status: 200 };
  }

  return { allowed: false, status: 403, message: "Forbidden" };
};

export const evaluateAssignComplaint = ({ user, complaint, linkedMember }) => {
  if (user.role === "admin") {
    return { allowed: true, status: 200 };
  }

  if (user.role === "department") {
    if (user.departmentRole !== "authority") {
      return { allowed: false, status: 403, message: "Officers are not authorized to assign or reassign complaints" };
    }

    if (complaint.category !== user.department) {
      return { allowed: false, status: 403, message: "Cannot modify other departments" };
    }

    return { allowed: true, status: 200 };
  }

  return { allowed: false, status: 403, message: "Forbidden" };
};

export const evaluateMemberManagement = ({ user, targetDepartment }) => {
  if (user.role === "admin") {
    return { allowed: true, status: 200 };
  }

  if (user.role === "department") {
    if (user.departmentRole !== "authority") {
      return { allowed: false, status: 403, message: "Officers are not authorized to manage department members" };
    }

    if (targetDepartment && targetDepartment !== user.department) {
      return { allowed: false, status: 403, message: "Cannot modify members of another department" };
    }

    return { allowed: true, status: 200 };
  }

  return { allowed: false, status: 403, message: "Forbidden" };
};

export const evaluateDepartmentRolePromotion = ({ actingUser, targetUserId, newRole }) => {
  if (!actingUser || actingUser.role !== "admin") {
    return { allowed: false, status: 403, message: "Only admin can promote department accounts to authority" };
  }

  if (!["authority", "officer"].includes(newRole)) {
    return { allowed: false, status: 400, message: "Invalid departmentRole" };
  }

  return { allowed: true, status: 200 };
};

export const evaluateAssignedComplaintsQuery = ({ user, complaints, linkedMember }) => {
  if (user.role !== "department") return [];
  if (!linkedMember) return [];

  return complaints.filter((c) => {
    const assignedId = c.assignedTo?._id?.toString() || c.assignedTo?.toString();
    return assignedId === linkedMember._id.toString() && c.category === user.department;
  });
};

// ── Tests ──

test("Authority account with explicit authority permission sees all department complaints", () => {
  const authorityUser = { _id: sampleId(), role: "department", department: "Water Supply", departmentRole: "authority", status: "active" };
  const complaints = [
    { _id: sampleId(), title: "Case 1", category: "Water Supply", assignedTo: sampleId() },
    { _id: sampleId(), title: "Case 2", category: "Water Supply", assignedTo: sampleId() },
    { _id: sampleId(), title: "Case 3", category: "Water Supply", assignedTo: null }, // Unassigned
  ];

  // Authority (linkedMember is null)
  for (const c of complaints) {
    const access = evaluateComplaintAccess({ user: authorityUser, complaint: c, linkedMember: null });
    assert.equal(access.allowed, true);
    assert.equal(access.status, 200);
  }
});

test("New department account without authority permission receives NO elevated permissions", () => {
  // Freshly registered department account: departmentRole defaults to "officer", no linked member
  const newDeptUser = { _id: sampleId(), role: "department", department: "Water Supply", departmentRole: "officer", status: "active" };
  const complaint = { _id: sampleId(), title: "Pothole", category: "Water Supply", assignedTo: null };

  // 1. Cannot access unassigned complaint
  const access = evaluateComplaintAccess({ user: newDeptUser, complaint, linkedMember: null });
  assert.equal(access.allowed, false);
  assert.equal(access.status, 403);

  // 2. Cannot update complaint status
  const update = evaluateStatusUpdate({ user: newDeptUser, complaint, newStatus: "In Progress", linkedMember: null });
  assert.equal(update.allowed, false);
  assert.equal(update.status, 403);

  // 3. Cannot assign complaints
  const assign = evaluateAssignComplaint({ user: newDeptUser, complaint, linkedMember: null });
  assert.equal(assign.allowed, false);
  assert.equal(assign.status, 403);

  // 4. Cannot manage members
  const memberMgmt = evaluateMemberManagement({ user: newDeptUser, targetDepartment: "Water Supply" });
  assert.equal(memberMgmt.allowed, false);
  assert.equal(memberMgmt.status, 403);

  // 5. Assigned complaints list is empty
  const myAssigned = evaluateAssignedComplaintsQuery({ user: newDeptUser, complaints: [complaint], linkedMember: null });
  assert.deepEqual(myAssigned, []);
});

test("legacy department account missing departmentRole cannot inherit authority permissions", () => {
  const legacyAccount = {
    _id: sampleId(),
    role: "department",
    department: "Water Supply",
    status: "active",
  };
  const complaint = {
    _id: sampleId(),
    category: "Water Supply",
    assignedTo: sampleId(),
  };

  assert.equal(evaluateComplaintAccess({ user: legacyAccount, complaint, linkedMember: null }).allowed, false);
  assert.equal(evaluateAssignComplaint({ user: legacyAccount, complaint, linkedMember: null }).allowed, false);
  assert.equal(evaluateMemberManagement({ user: legacyAccount, targetDepartment: "Water Supply" }).allowed, false);
  assert.deepEqual(evaluateAssignedComplaintsQuery({
    user: legacyAccount,
    complaints: [complaint],
    linkedMember: null,
  }), []);
});

test("Officer whose mapping is removed remains an officer and does not escalate to authority", () => {
  const officerUser = { _id: sampleId(), role: "department", department: "Road & Infrastructure", departmentRole: "officer", status: "active" };
  const deptComplaint = { _id: sampleId(), title: "Road Work", category: "Road & Infrastructure", assignedTo: sampleId() };

  // Mapping was removed (linkedMember is null)
  const access = evaluateComplaintAccess({ user: officerUser, complaint: deptComplaint, linkedMember: null });
  assert.equal(access.allowed, false);
  assert.equal(access.status, 403);

  const update = evaluateStatusUpdate({ user: officerUser, complaint: deptComplaint, newStatus: "In Progress", linkedMember: null });
  assert.equal(update.allowed, false);
  assert.equal(update.status, 403);

  const assign = evaluateAssignComplaint({ user: officerUser, complaint: deptComplaint, linkedMember: null });
  assert.equal(assign.allowed, false);
  assert.equal(assign.status, 403);

  const memberMgmt = evaluateMemberManagement({ user: officerUser, targetDepartment: "Road & Infrastructure" });
  assert.equal(memberMgmt.allowed, false);
  assert.equal(memberMgmt.status, 403);
});

test("Authority can manage members and assign complaints in their department, but not other departments", () => {
  const authorityUser = { _id: sampleId(), role: "department", department: "Water Supply", departmentRole: "authority", status: "active" };
  const ownDeptComplaint = { _id: sampleId(), category: "Water Supply" };
  const otherDeptComplaint = { _id: sampleId(), category: "Electricity" };

  // Own department
  const assignOwn = evaluateAssignComplaint({ user: authorityUser, complaint: ownDeptComplaint, linkedMember: null });
  assert.equal(assignOwn.allowed, true);
  assert.equal(assignOwn.status, 200);

  const manageOwnMembers = evaluateMemberManagement({ user: authorityUser, targetDepartment: "Water Supply" });
  assert.equal(manageOwnMembers.allowed, true);
  assert.equal(manageOwnMembers.status, 200);

  // Cross-department rejection
  const assignOther = evaluateAssignComplaint({ user: authorityUser, complaint: otherDeptComplaint, linkedMember: null });
  assert.equal(assignOther.allowed, false);
  assert.equal(assignOther.status, 403);

  const manageOtherMembers = evaluateMemberManagement({ user: authorityUser, targetDepartment: "Electricity" });
  assert.equal(manageOtherMembers.allowed, false);
  assert.equal(manageOtherMembers.status, 403);
});

test("Attempted unauthorized authority promotion is rejected", () => {
  const nonAdminOfficer = { _id: sampleId(), role: "department", departmentRole: "officer" };
  const citizen = { _id: sampleId(), role: "citizen" };
  const admin = { _id: sampleId(), role: "admin" };
  const targetId = sampleId();

  // Officer attempting to promote someone
  const res1 = evaluateDepartmentRolePromotion({ actingUser: nonAdminOfficer, targetUserId: targetId, newRole: "authority" });
  assert.equal(res1.allowed, false);
  assert.equal(res1.status, 403);

  // Citizen attempting to promote someone
  const res2 = evaluateDepartmentRolePromotion({ actingUser: citizen, targetUserId: targetId, newRole: "authority" });
  assert.equal(res2.allowed, false);
  assert.equal(res2.status, 403);

  // Unauthenticated actor
  const res3 = evaluateDepartmentRolePromotion({ actingUser: null, targetUserId: targetId, newRole: "authority" });
  assert.equal(res3.allowed, false);
  assert.equal(res3.status, 403);

  // Admin promoting user with valid role
  const res4 = evaluateDepartmentRolePromotion({ actingUser: admin, targetUserId: targetId, newRole: "authority" });
  assert.equal(res4.allowed, true);
  assert.equal(res4.status, 200);

  // Admin passing invalid role
  const res5 = evaluateDepartmentRolePromotion({ actingUser: admin, targetUserId: targetId, newRole: "super-admin" });
  assert.equal(res5.allowed, false);
  assert.equal(res5.status, 400);
});

test("Rahul sees only Rahul's assigned complaints and Aman sees only Aman's", () => {
  const rahulUserId = sampleId();
  const rahulMemberId = sampleId();
  const amanUserId = sampleId();
  const amanMemberId = sampleId();

  const rahulUser = { _id: rahulUserId, role: "department", department: "Road & Infrastructure", departmentRole: "officer", status: "active" };
  const rahulMember = { _id: rahulMemberId, userId: rahulUserId, name: "Rahul", department: "Road & Infrastructure" };

  const amanUser = { _id: amanUserId, role: "department", department: "Road & Infrastructure", departmentRole: "officer", status: "active" };
  const amanMember = { _id: amanMemberId, userId: amanUserId, name: "Aman", department: "Road & Infrastructure" };

  const complaintPool = [
    { _id: sampleId(), title: "Rahul's Road Fix", category: "Road & Infrastructure", assignedTo: rahulMemberId },
    { _id: sampleId(), title: "Aman's Pothole", category: "Road & Infrastructure", assignedTo: amanMemberId },
    { _id: sampleId(), title: "Unassigned Road Issue", category: "Road & Infrastructure", assignedTo: null },
  ];

  const rahulComplaints = evaluateAssignedComplaintsQuery({
    user: rahulUser,
    complaints: complaintPool,
    linkedMember: rahulMember,
  });

  const amanComplaints = evaluateAssignedComplaintsQuery({
    user: amanUser,
    complaints: complaintPool,
    linkedMember: amanMember,
  });

  assert.equal(rahulComplaints.length, 1);
  assert.equal(rahulComplaints[0].title, "Rahul's Road Fix");

  assert.equal(amanComplaints.length, 1);
  assert.equal(amanComplaints[0].title, "Aman's Pothole");
});

test("Rahul cannot access Aman's complaint by direct URL", () => {
  const rahulUserId = sampleId();
  const rahulMemberId = sampleId();
  const amanMemberId = sampleId();

  const rahulUser = { _id: rahulUserId, role: "department", department: "Electricity", departmentRole: "officer", status: "active" };
  const rahulMember = { _id: rahulMemberId, userId: rahulUserId, name: "Rahul" };

  const amansComplaint = {
    _id: sampleId(),
    title: "Aman's Wire Issue",
    category: "Electricity",
    assignedTo: amanMemberId,
  };

  const result = evaluateComplaintAccess({
    user: rahulUser,
    complaint: amansComplaint,
    linkedMember: rahulMember,
  });

  assert.equal(result.allowed, false);
  assert.equal(result.status, 403);
  assert.ok(result.message.includes("Officers can only access complaints assigned to them"));
});

test("Rahul cannot update Aman's complaint", () => {
  const rahulUserId = sampleId();
  const rahulMemberId = sampleId();
  const amanMemberId = sampleId();

  const rahulUser = { _id: rahulUserId, role: "department", department: "Electricity", departmentRole: "officer", status: "active" };
  const rahulMember = { _id: rahulMemberId, userId: rahulUserId, name: "Rahul" };

  const amansComplaint = {
    _id: sampleId(),
    category: "Electricity",
    status: "Assigned",
    assignedTo: amanMemberId,
  };

  const result = evaluateStatusUpdate({
    user: rahulUser,
    complaint: amansComplaint,
    newStatus: "In Progress",
    linkedMember: rahulMember,
  });

  assert.equal(result.allowed, false);
  assert.equal(result.status, 403);
  assert.ok(result.message.includes("Officers can only update complaints assigned to them"));
});

test("Officer cannot access unassigned complaints", () => {
  const officerUser = { _id: sampleId(), role: "department", department: "Environment", departmentRole: "officer", status: "active" };
  const officerMember = { _id: sampleId(), userId: officerUser._id };

  const unassignedComplaint = {
    _id: sampleId(),
    category: "Environment",
    status: "Pending",
    assignedTo: null,
  };

  const result = evaluateComplaintAccess({
    user: officerUser,
    complaint: unassignedComplaint,
    linkedMember: officerMember,
  });

  assert.equal(result.allowed, false);
  assert.equal(result.status, 403);
});

test("Officer cannot reassign complaints", () => {
  const officerUser = { _id: sampleId(), role: "department", department: "Environment", departmentRole: "officer", status: "active" };
  const officerMember = { _id: sampleId(), userId: officerUser._id };

  const complaint = {
    _id: sampleId(),
    category: "Environment",
    assignedTo: officerMember._id,
  };

  const result = evaluateAssignComplaint({
    user: officerUser,
    complaint,
    linkedMember: officerMember,
  });

  assert.equal(result.allowed, false);
  assert.equal(result.status, 403);
  assert.ok(result.message.includes("Officers are not authorized to assign or reassign"));
});

test("Officer can update their own assigned complaint", () => {
  const officerUser = { _id: sampleId(), role: "department", department: "Water Supply", departmentRole: "officer", status: "active" };
  const officerMember = { _id: sampleId(), userId: officerUser._id };

  const myComplaint = {
    _id: sampleId(),
    category: "Water Supply",
    status: "Assigned",
    assignedTo: officerMember._id,
  };

  const result = evaluateStatusUpdate({
    user: officerUser,
    complaint: myComplaint,
    newStatus: "In Progress",
    linkedMember: officerMember,
  });

  assert.equal(result.allowed, true);
  assert.equal(result.status, 200);
});

test("Missing Member mapping is handled safely: returns empty list without error", () => {
  const unmappedUser = { _id: sampleId(), role: "department", department: "Water Supply", departmentRole: "officer", status: "active" };
  const complaints = [
    { _id: sampleId(), category: "Water Supply", assignedTo: sampleId() },
  ];

  const result = evaluateAssignedComplaintsQuery({
    user: unmappedUser,
    complaints,
    linkedMember: null, // No mapping exists
  });

  assert.deepEqual(result, []);
});

test("Existing citizen and admin permissions remain unchanged", () => {
  const citizenId = sampleId();
  const adminId = sampleId();
  const citizenUser = { _id: citizenId, role: "citizen" };
  const adminUser = { _id: adminId, role: "admin" };

  const complaint = {
    _id: sampleId(),
    category: "Road & Infrastructure",
    createdBy: citizenId,
    assignedTo: sampleId(),
  };

  // Citizen owner access
  const citizenAccess = evaluateComplaintAccess({ user: citizenUser, complaint, linkedMember: null });
  assert.equal(citizenAccess.allowed, true);

  // Admin access
  const adminAccess = evaluateComplaintAccess({ user: adminUser, complaint, linkedMember: null });
  assert.equal(adminAccess.allowed, true);

  // Non-owner citizen
  const otherCitizen = { _id: sampleId(), role: "citizen" };
  const otherAccess = evaluateComplaintAccess({ user: otherCitizen, complaint, linkedMember: null });
  assert.equal(otherAccess.allowed, false);
  assert.equal(otherAccess.status, 403);
});
