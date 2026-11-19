import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDepartmentComplaintFilter,
  buildOfficerComplaintFilter,
  canAccessDepartmentComplaint,
} from "../src/services/complaintAccess.service.js";

const departments = ["Road & Infrastructure", "Water Supply", "Electricity", "Environment"];

test("authorities receive a category-only filter for every department and all statuses", () => {
  for (const department of departments) {
    assert.deepEqual(buildDepartmentComplaintFilter(department), { category: department });
    for (const status of ["Pending", "Assigned", "In Progress", "Resolved"]) {
      assert.equal(canAccessDepartmentComplaint({
        user: { role: "department", departmentRole: "authority", department },
        complaint: { category: department, status, assignedTo: null, historical: true },
      }), true, `${department} authority must access ${status} and unassigned/historical records`);
    }
  }
});

test("officers are restricted to their own assigned Member within their department", () => {
  for (const department of departments) {
    const memberId = `member-${department}`;
    const officer = { role: "department", departmentRole: "officer", department };
    assert.deepEqual(buildOfficerComplaintFilter(department, memberId), { category: department, assignedTo: memberId });
    assert.equal(canAccessDepartmentComplaint({ user: officer, memberId, complaint: { category: department, assignedTo: memberId } }), true);
    assert.equal(canAccessDepartmentComplaint({ user: officer, memberId, complaint: { category: department, assignedTo: "another-member" } }), false);
    assert.equal(canAccessDepartmentComplaint({ user: officer, memberId, complaint: { category: departments.find((item) => item !== department), assignedTo: memberId } }), false);
  }
});

test("unlinked officers and department users without an explicit role fail closed", () => {
  const complaint = { category: "Water Supply", assignedTo: "rajesh-member" };
  assert.equal(canAccessDepartmentComplaint({ user: { role: "department", departmentRole: "officer", department: "Water Supply" }, complaint }), false);
  assert.equal(canAccessDepartmentComplaint({ user: { role: "department", department: "Water Supply" }, memberId: "rajesh-member", complaint }), false);
});

test("admin retains cross-department complaint access", () => {
  assert.equal(canAccessDepartmentComplaint({ user: { role: "admin" }, complaint: { category: "Environment" } }), true);
});
