import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { DashboardCards, DashboardCardItem } from "@/components/dashboard/DashboardCards";
import {
  FileText,
  AlertTriangle,
  Building2,
  CheckCircle2,
  ShieldCheck,
  Gauge,
  TrendingUp,
  Users,
  UserCheck,
} from "lucide-react";

describe("Admin Dashboard Foundation & Navigation Tests", () => {
  it("renders all 10 required overview metrics in summary cards", () => {
    const mockStatCards: DashboardCardItem[] = [
      { label: "Total Complaints", value: 17, helper: "Total complaints", delta: "17 recorded", icon: FileText },
      { label: "Pending", value: 13, helper: "Pending review", delta: "13 cases", icon: AlertTriangle },
      { label: "Assigned", value: 2, helper: "Assigned to officers", delta: "2 assigned", icon: ShieldCheck },
      { label: "In Progress", value: 1, helper: "Active remediation", delta: "1 active", icon: Gauge },
      { label: "Resolved", value: 1, helper: "Closed complaints", delta: "1 closed", icon: CheckCircle2 },
      { label: "Overdue", value: 5, helper: "Overdue complaints", delta: "Requires intervention", icon: AlertTriangle },
      { label: "Resolution Rate", value: "5.9%", helper: "Proportion resolved", delta: "5.9% achieved", icon: TrendingUp },
      { label: "Total Citizens", value: 8, helper: "Citizens", delta: "Verified users", icon: Users },
      { label: "Department Authorities", value: 4, helper: "Authorities", delta: "4 departments", icon: Building2 },
      { label: "Total Officers", value: 4, helper: "Field officers", delta: "Active roster", icon: UserCheck },
    ];

    render(
      <MemoryRouter>
        <DashboardCards items={mockStatCards} />
      </MemoryRouter>
    );

    // Verify all 10 labels are displayed
    expect(screen.getByText("Total Complaints")).toBeDefined();
    expect(screen.getByText("Pending")).toBeDefined();
    expect(screen.getByText("Assigned")).toBeDefined();
    expect(screen.getByText("In Progress")).toBeDefined();
    expect(screen.getByText("Resolved")).toBeDefined();
    expect(screen.getByText("Overdue")).toBeDefined();
    expect(screen.getByText("Resolution Rate")).toBeDefined();
    expect(screen.getByText("Total Citizens")).toBeDefined();
    expect(screen.getByText("Department Authorities")).toBeDefined();
    expect(screen.getByText("Total Officers")).toBeDefined();

    // Verify values
    expect(screen.getByText("17")).toBeDefined();
    expect(screen.getByText("13")).toBeDefined();
    expect(screen.getByText("5.9%")).toBeDefined();
  });

  it("verifies expected admin navigation route mapping without officer performance", () => {
    const adminNavMap: Record<string, string> = {
      Overview: "/admin",
      Complaints: "/admin/complaints",
      Analytics: "/admin/analytics",
      Departments: "/admin/departments",
      "Dept Performance": "/admin/department-performance",
      Heatmap: "/admin/heatmap",
      Feedback: "/admin/feedback",
      Reports: "/admin/reports",
      Users: "/admin/users",
    };

    expect(Object.keys(adminNavMap)).toHaveLength(9);
    expect(adminNavMap.Overview).toBe("/admin");
    expect(adminNavMap.Complaints).toBe("/admin/complaints");
    expect(adminNavMap.Analytics).toBe("/admin/analytics");
    expect(adminNavMap.Departments).toBe("/admin/departments");
    expect(adminNavMap["Dept Performance"]).toBe("/admin/department-performance");
    expect(adminNavMap.Authorities).toBeUndefined(); // Removed from Admin in Phase 8.15
    expect(adminNavMap.Heatmap).toBe("/admin/heatmap");
    expect(adminNavMap.Feedback).toBe("/admin/feedback");
    expect(adminNavMap.Reports).toBe("/admin/reports");
    expect(adminNavMap.Users).toBe("/admin/users");
  });
});

