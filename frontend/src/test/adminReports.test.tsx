import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AdminReports, { sanitizeCsvCell } from "@/pages/admin/AdminReports";
import { adminApi } from "@/services/adminApi";
import { complaintsApi, ComplaintRecord } from "@/services/complaintsApi";

vi.mock("@/services/adminApi", () => ({
  adminApi: {
    getOverviewStats: vi.fn(),
    getDepartmentPerformance: vi.fn(),
  },
}));

vi.mock("@/services/complaintsApi", () => ({
  complaintsApi: {
    listAll: vi.fn(),
  },
}));

const mockComplaints: ComplaintRecord[] = [
  {
    id: "c-1",
    trackingId: "CMP-001",
    reference: "CMP-001",
    title: "=SUM(1,2)", // Test formula in title
    description: "Major water leak",
    category: "Water Supply",
    status: "Pending",
    priority: "High",
    aiUrgencyScore: 85,
    location: "Sector 4, Main Pipeline",
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
    sla: { deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), slaStatus: "On Track" },
    createdBy: { id: "u-1", name: "Citizen John", email: "john@example.com" },
  },
  {
    id: "c-2",
    trackingId: "CMP-002",
    reference: "CMP-002",
    title: "Pothole on Main St",
    description: "Deep pothole",
    category: "Road & Infrastructure",
    status: "Resolved",
    priority: "Medium",
    aiUrgencyScore: 45,
    location: "Main Road, Cross 5",
    createdAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(), // 20 days ago
    sla: {
      startedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
      resolvedAt: new Date(Date.now() - 18 * 24 * 60 * 60 * 1000).toISOString(),
      deadline: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
      slaStatus: "Resolved",
    },
    feedback: {
      rating: 5,
      comment: "Excellent repair, done on time!",
    },
    createdBy: { id: "u-2", name: "Citizen Alice", email: "alice@example.com" },
    assignedTo: { id: "m-1", name: "Officer Bob", department: "Road & Infrastructure" },
  },
  {
    id: "c-3",
    trackingId: "CMP-003",
    reference: "CMP-003",
    title: "Power transformer sparking",
    description: "Dangerous spark",
    category: "Electricity",
    status: "In Progress",
    priority: "Critical",
    aiUrgencyScore: 92,
    location: "Substation Block B",
    createdAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(), // 100 days ago
    sla: { deadline: new Date(Date.now() - 50 * 24 * 60 * 60 * 1000).toISOString(), slaStatus: "Overdue" },
    createdBy: { id: "u-3", name: "Citizen Mark", email: "mark@example.com" },
  },
];

const mockDeptPerformance = [
  { department: "Road & Infrastructure", total: 1, pending: 0, assigned: 0, inProgress: 0, resolved: 1, overdue: 0, resolutionRate: 100, avgResolutionHours: 48, membersCount: 1, feedbackCount: 1, avgRating: 5.0 },
  { department: "Water Supply", total: 1, pending: 1, assigned: 0, inProgress: 0, resolved: 0, overdue: 0, resolutionRate: 0, avgResolutionHours: 0, membersCount: 2, feedbackCount: 0, avgRating: 0 },
  { department: "Electricity", total: 1, pending: 0, assigned: 0, inProgress: 1, resolved: 0, overdue: 1, resolutionRate: 0, avgResolutionHours: 0, membersCount: 1, feedbackCount: 0, avgRating: 0 },
  { department: "Environment", total: 0, pending: 0, assigned: 0, inProgress: 0, resolved: 0, overdue: 0, resolutionRate: 0, avgResolutionHours: 0, membersCount: 1, feedbackCount: 0, avgRating: 0 },
];

describe("CSV Sanitization Unit Tests (CWE-1236 Formula Injection Defense)", () => {
  it("prefixes formulas starting with =, +, -, @ with single quote", () => {
    expect(sanitizeCsvCell("=SUM(A1:B1)")).toBe("'=SUM(A1:B1)");
    expect(sanitizeCsvCell("+cmd|' /C calc'!A0")).toBe("'+cmd|' /C calc'!A0");
    expect(sanitizeCsvCell("-2+3+cmd|' /C calc'!A0")).toBe("'-2+3+cmd|' /C calc'!A0");
    expect(sanitizeCsvCell("@admin_script")).toBe("'@admin_script");
    expect(sanitizeCsvCell("\t=cmd")).toBe("'\t=cmd");
    // When cell contains carriage return or quotes/commas, it gets wrapped in double quotes per RFC 4180
    expect(sanitizeCsvCell("\r=cmd")).toBe('"\'\r=cmd"');
  });

  it("does not escape standard numeric values (positive or negative)", () => {
    expect(sanitizeCsvCell(-5)).toBe("-5");
    expect(sanitizeCsvCell("-5")).toBe("-5");
    expect(sanitizeCsvCell("+42")).toBe("+42");
    expect(sanitizeCsvCell(42)).toBe("42");
    expect(sanitizeCsvCell("-12.50")).toBe("-12.50");
    expect(sanitizeCsvCell(0)).toBe("0");
  });

  it("correctly escapes quotes, commas, and newlines per RFC 4180", () => {
    expect(sanitizeCsvCell('Hello, "World"')).toBe('"Hello, ""World"""');
    expect(sanitizeCsvCell("Line 1\nLine 2")).toBe('"Line 1\nLine 2"');
    expect(sanitizeCsvCell("Just Normal Text")).toBe("Just Normal Text");
  });

  it("handles null and undefined safely", () => {
    expect(sanitizeCsvCell(null)).toBe("");
    expect(sanitizeCsvCell(undefined)).toBe("");
  });
});

describe("AdminReports Interactive Filtering & Export Suite (Phase 5F)", () => {
  let createdBlobs: Blob[] = [];
  let originalClick: typeof HTMLAnchorElement.prototype.click;

  beforeEach(() => {
    vi.clearAllMocks();
    createdBlobs = [];

    // Prevent jsdom "Not implemented: navigation to another Document"
    originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = vi.fn();

    vi.mocked(adminApi.getOverviewStats).mockResolvedValue({
      metrics: {
        totalComplaints: 3,
        pendingComplaints: 1,
        assignedComplaints: 0,
        inProgressComplaints: 1,
        resolvedComplaints: 1,
        overdueComplaints: 1,
        resolutionRate: 33.3,
        totalCitizens: 3,
        totalAuthorities: 4,
        totalOfficers: 4,
        totalUsers: 11,
      },
      departmentBreakdown: [],
      statusDistribution: [],
      monthlyTrend: [],
      appliedFilters: { dateRange: "allTime", department: "All Departments" },
    });
    vi.mocked(adminApi.getDepartmentPerformance).mockResolvedValue(mockDeptPerformance);
    vi.mocked(complaintsApi.listAll).mockResolvedValue(mockComplaints);

    // Mock window.URL
    window.URL.createObjectURL = vi.fn().mockImplementation((blob: Blob) => {
      createdBlobs.push(blob);
      return `blob:mock-url-${createdBlobs.length}`;
    });
    window.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    HTMLAnchorElement.prototype.click = originalClick;
  });

  it("renders report with default all-records view and displays department citizen rating", async () => {
    render(
      <MemoryRouter>
        <AdminReports />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Governance & Audit Reports")).toBeDefined();
    });

    expect(screen.getByText("3 records matching")).toBeDefined();
    expect(screen.getAllByText("Road & Infrastructure").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Water Supply").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Electricity").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Environment").length).toBeGreaterThanOrEqual(1);

    // Road & Infrastructure has 1 resolved complaint with rating 5
    expect(screen.getByText("5.0 / 5")).toBeDefined();
  });

  it("filters by priority correctly", async () => {
    render(
      <MemoryRouter>
        <AdminReports />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("3 records matching")).toBeDefined();
    });

    const prioritySelect = screen.getByLabelText("Priority Filter");
    fireEvent.change(prioritySelect, { target: { value: "Critical" } });

    expect(screen.getByText("1 records matching")).toBeDefined();
    expect(screen.getByText(/Priority: Critical/)).toBeDefined();
  });

  it("filters by department correctly", async () => {
    render(
      <MemoryRouter>
        <AdminReports />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("3 records matching")).toBeDefined();
    });

    const deptSelect = screen.getByLabelText("Department Filter");
    fireEvent.change(deptSelect, { target: { value: "Water Supply" } });

    expect(screen.getByText("1 records matching")).toBeDefined();
    expect(screen.getByText(/Dept: Water Supply/)).toBeDefined();
  });

  it("filters by complaint status correctly", async () => {
    render(
      <MemoryRouter>
        <AdminReports />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("3 records matching")).toBeDefined();
    });

    const statusSelect = screen.getByLabelText("Status Filter");
    fireEvent.change(statusSelect, { target: { value: "Resolved" } });

    expect(screen.getByText("1 records matching")).toBeDefined();
    expect(screen.getByText(/Status: Resolved/)).toBeDefined();
  });

  it("filters by custom date range correctly and validates dates", async () => {
    render(
      <MemoryRouter>
        <AdminReports />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("3 records matching")).toBeDefined();
    });

    const dateSelect = screen.getByLabelText("Date Range Filter");
    fireEvent.change(dateSelect, { target: { value: "Custom Range" } });

    const startDateInput = screen.getByLabelText("Start Date");
    const endDateInput = screen.getByLabelText("End Date");
    expect(startDateInput).toBeDefined();
    expect(endDateInput).toBeDefined();

    // Invalid range: End Date < Start Date
    fireEvent.change(startDateInput, { target: { value: "2026-11-10" } });
    fireEvent.change(endDateInput, { target: { value: "2026-11-05" } });

    expect(screen.getByText("End Date cannot be earlier than Start Date")).toBeDefined();

    // Valid range encompassing complaint c-1 (2 days ago)
    const today = new Date();
    const fourDaysAgo = new Date(today.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const tomorrow = new Date(today.getTime() + 1 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    fireEvent.change(startDateInput, { target: { value: fourDaysAgo } });
    fireEvent.change(endDateInput, { target: { value: tomorrow } });

    expect(screen.queryByText("End Date cannot be earlier than Start Date")).toBeNull();
    // Only c-1 falls in this 4-day window
    expect(screen.getByText("1 records matching")).toBeDefined();
  });

  it("applies combined department, status, priority, and date filters", async () => {
    render(
      <MemoryRouter>
        <AdminReports />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("3 records matching")).toBeDefined();
    });

    fireEvent.change(screen.getByLabelText("Department Filter"), { target: { value: "Road & Infrastructure" } });
    fireEvent.change(screen.getByLabelText("Status Filter"), { target: { value: "Resolved" } });
    fireEvent.change(screen.getByLabelText("Priority Filter"), { target: { value: "Medium" } });
    fireEvent.change(screen.getByLabelText("Date Range Filter"), { target: { value: "Last 30 Days" } });

    expect(screen.getByText("1 records matching")).toBeDefined();
    expect(screen.getByText(/Dept: Road & Infrastructure/)).toBeDefined();
    expect(screen.getByText(/Status: Resolved/)).toBeDefined();
    expect(screen.getByText(/Priority: Medium/)).toBeDefined();
    expect(screen.getByText(/Date: Last 30 Days/)).toBeDefined();
  });

  it("clears filters when clear filters button is clicked", async () => {
    render(
      <MemoryRouter>
        <AdminReports />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("3 records matching")).toBeDefined();
    });

    fireEvent.change(screen.getByLabelText("Priority Filter"), { target: { value: "Critical" } });
    expect(screen.getByText("1 records matching")).toBeDefined();

    const clearBtn = screen.getByText("Clear filters");
    fireEvent.click(clearBtn);

    expect(screen.getByText("3 records matching")).toBeDefined();
    expect(screen.queryByText("Clear filters")).toBeNull();
  });

  it("exports enriched & sanitized Complaints Master CSV", async () => {
    render(
      <MemoryRouter>
        <AdminReports />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("3 records matching")).toBeDefined();
    });

    const csvBtn = screen.getByText("Export CSV");
    fireEvent.click(csvBtn);

    expect(window.URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(createdBlobs.length).toBe(1);

    // Read blob text to verify enriched headers and sanitized content
    const blob = createdBlobs[0];
    const text = await blob.text();

    // Verify all 17 headers
    expect(text).toContain("ID,Reference,Title,Department,Status,Priority,Created By,Assigned To,Created At,SLA Deadline,SLA Status,Location,AI Urgency Score,Resolved At,Actual Resolution Duration (Hours),Citizen Rating,Feedback Comments");

    // Verify formula sanitization in CSV row (c-1 title "=SUM(1,2)")
    expect(text).toContain("'=SUM(1,2)");

    // Verify enriched values for c-2
    expect(text).toContain("Main Road, Cross 5");
    expect(text).toContain("45");
    expect(text).toContain("5 / 5");
    expect(text).toContain("Excellent repair, done on time!");
  });

  it("exports Department Summary CSV with 7 matrix columns", async () => {
    render(
      <MemoryRouter>
        <AdminReports />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("3 records matching")).toBeDefined();
    });

    const summaryBtn = screen.getByTestId("export-dept-summary-csv-btn");
    expect(summaryBtn).toBeDefined();
    fireEvent.click(summaryBtn);

    expect(window.URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(createdBlobs.length).toBe(1);

    const blob = createdBlobs[0];
    const text = await blob.text();

    // Verify 7 summary headers
    expect(text).toContain("Department,Total Cases,Resolved,Overdue,Resolution Rate,Average Resolution Hours,Average Citizen Rating");
    expect(text).toContain("Road & Infrastructure,1,1,0,100%,48h,5.0 / 5");
    expect(text).toContain("Water Supply,1,0,0,0%,0h,—");
  });

  it("exports department JSON bundle with active filters metadata", async () => {
    render(
      <MemoryRouter>
        <AdminReports />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("3 records matching")).toBeDefined();
    });

    const jsonBtn = screen.getByText("Export JSON");
    fireEvent.click(jsonBtn);

    expect(window.URL.createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createdBlobs[0];
    const text = await blob.text();
    const json = JSON.parse(text);

    expect(json.activeFilters.priority).toBe("All Priorities");
    expect(json.totalRecords).toBe(3);
    expect(json.complaints).toHaveLength(3);
    expect(json.departments).toHaveLength(4);
  });
});
