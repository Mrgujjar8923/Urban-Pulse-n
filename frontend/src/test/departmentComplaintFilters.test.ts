import { describe, expect, it } from "vitest";
import {
  countDepartmentComplaints,
  filterDepartmentComplaints,
  isComplaintOverdue,
} from "@/pages/authority/departmentComplaintFilters";
import { ComplaintRecord } from "@/services/complaintsApi";

const complaint = (overrides: Partial<ComplaintRecord> = {}): ComplaintRecord => ({
  id: "complaint-1",
  reference: "CMP-000001",
  title: "Test complaint",
  description: "Description",
  category: "Water Supply",
  status: "Pending",
  createdAt: "2026-10-29T10:00:00.000Z",
  sla: {
    slaStatus: "On Track",
    remainingMs: 60_000,
    isOverdue: false,
  },
  timeline: [],
  ...overrides,
});

describe("department complaint filters", () => {
  const complaints = [
    complaint({ id: "pending" }),
    complaint({ id: "assigned", status: "Assigned" }),
    complaint({ id: "progress", status: "In Progress", sla: { slaStatus: "Overdue", remainingMs: -1, isOverdue: true } }),
    complaint({ id: "resolved", status: "Resolved", sla: { slaStatus: "Resolved", remainingMs: null, isOverdue: true } }),
  ];

  it("filters by status and resets with All", () => {
    expect(filterDepartmentComplaints(complaints, "Assigned").map(({ id }) => id)).toEqual(["assigned"]);
    expect(filterDepartmentComplaints(complaints, "All")).toHaveLength(4);
    expect(countDepartmentComplaints(complaints, "Resolved")).toBe(1);
  });

  it("uses SLA overdue data and excludes resolved complaints", () => {
    expect(filterDepartmentComplaints(complaints, "Overdue").map(({ id }) => id)).toEqual(["progress"]);
    expect(isComplaintOverdue(complaints[3])).toBe(false);
    expect(isComplaintOverdue(complaint({ sla: { slaStatus: "Unavailable", remainingMs: null, isOverdue: false } }))).toBe(false);
  });
});
