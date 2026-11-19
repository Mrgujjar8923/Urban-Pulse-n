import { describe, expect, it } from "vitest";
import { departmentDashboardForRole, homePathForRole, isDepartmentRoleAllowed } from "@/lib/departmentAccess";

describe("department dashboard access", () => {
  it("selects the root dashboard from the authenticated subrole", () => {
    expect(departmentDashboardForRole("authority")).toBe("authority");
    expect(departmentDashboardForRole("officer")).toBe("officer");
    expect(departmentDashboardForRole(undefined)).toBeNull();
  });

  it("allows direct routes only for their declared department subroles", () => {
    expect(isDepartmentRoleAllowed("authority", ["authority"])).toBe(true);
    expect(isDepartmentRoleAllowed("officer", ["authority"])).toBe(false);
    expect(isDepartmentRoleAllowed("officer", ["officer"])).toBe(true);
    expect(isDepartmentRoleAllowed(undefined, ["officer"])).toBe(false);
  });

  it("routes signed-in department users to their shared role dashboard", () => {
    expect(homePathForRole("authority")).toBe("/department");
    expect(homePathForRole("admin")).toBe("/admin");
    expect(homePathForRole("citizen")).toBe("/citizen");
    expect(homePathForRole("unknown")).toBe("/");
  });
});
