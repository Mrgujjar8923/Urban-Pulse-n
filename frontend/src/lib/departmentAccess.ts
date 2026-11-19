export type DepartmentDashboardRole = "authority" | "officer";

export const isDepartmentRoleAllowed = (
  actualRole: string | null | undefined,
  allowedRoles: readonly DepartmentDashboardRole[],
) => Boolean(actualRole && allowedRoles.includes(actualRole as DepartmentDashboardRole));

export const departmentDashboardForRole = (role: string | null | undefined) => {
  if (role === "authority") return "authority" as const;
  if (role === "officer") return "officer" as const;
  return null;
};

export const homePathForRole = (role: string | null | undefined) => {
  if (role === "authority") return "/department";
  if (role === "admin" || role === "citizen") return `/${role}`;
  return "/";
};
