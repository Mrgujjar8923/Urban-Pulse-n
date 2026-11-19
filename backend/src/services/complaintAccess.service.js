export const buildDepartmentComplaintFilter = (department) => ({ category: department });

export const buildOfficerComplaintFilter = (department, memberId) => ({
  category: department,
  assignedTo: memberId,
});

export const isDepartmentAuthority = (user) => (
  user?.role === "department" && user.departmentRole === "authority"
);

export const isDepartmentOfficer = (user) => (
  user?.role === "department" && user.departmentRole === "officer"
);

export const canAccessDepartmentComplaint = ({ user, complaint, memberId = null }) => {
  if (!user || !complaint) return false;
  if (user.role === "admin") return true;
  if (user.role !== "department" || complaint.category !== user.department) return false;
  if (isDepartmentAuthority(user)) return true;
  if (!isDepartmentOfficer(user) || !memberId) return false;

  const assignedMemberId = complaint.assignedTo?._id?.toString()
    || complaint.assignedTo?.toString()
    || null;
  return assignedMemberId === memberId.toString();
};
