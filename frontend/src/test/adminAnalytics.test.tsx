import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import AnalyticsDashboard from "../pages/admin/AnalyticsDashboard";
import { adminApi, type AdminAnalyticsResponse } from "../services/adminApi";

// Mock adminApi
vi.mock("../services/adminApi", () => ({
  adminApi: {
    getAnalytics: vi.fn(),
  },
}));

// Mock recharts ResponsiveContainer so it renders children in jsdom
vi.mock("recharts", async () => {
  const original = await vi.importActual<Record<string, unknown>>("recharts");
  return {
    ...original,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="responsive-container" style={{ width: "800px", height: "400px" }}>
        {children}
      </div>
    ),
  };
});

const mockAnalyticsData: AdminAnalyticsResponse = {
  summary: {
    totalComplaints: 17,
    resolvedCount: 1,
    pendingCount: 13,
    assignedCount: 2,
    inProgressCount: 1,
    activeBacklog: 16,
    overdueCount: 5,
    resolutionRate: 5.9,
    slaComplianceRate: 0,
    avgResolutionHours: 0.03,
    avgResolutionDays: 0,
    medianResolutionHours: 0.03,
    medianResolutionDays: 0,
    criticalCount: 3,
    totalEscalations: 9,
    avgUrgencyScore: 8.3,
  },
  trends: {
    interval: "monthly",
    points: [
      { period: "2026-04", submitted: 6, resolved: 0, pending: 6, inProgress: 0, assigned: 0 },
      { period: "2026-09", submitted: 4, resolved: 0, pending: 3, inProgress: 1, assigned: 0 },
      { period: "2026-10", submitted: 7, resolved: 1, pending: 4, inProgress: 0, assigned: 2 },
    ],
    comparison: {
      currentPeriodSubmitted: 17,
      previousPeriodSubmitted: 12,
      percentChange: 41.7,
      trendDirection: "up",
    },
  },
  departments: [
    {
      department: "Road & Infrastructure",
      total: 3,
      pending: 3,
      assigned: 0,
      inProgress: 0,
      resolved: 0,
      overdue: 1,
      resolutionRate: 0,
      slaComplianceRate: 0,
      avgResolutionHours: 0,
      workloadShare: 17.6,
    },
    {
      department: "Water Supply",
      total: 10,
      pending: 6,
      assigned: 2,
      inProgress: 1,
      resolved: 1,
      overdue: 4,
      resolutionRate: 10,
      slaComplianceRate: 0,
      avgResolutionHours: 0.03,
      workloadShare: 58.8,
    },
    {
      department: "Electricity",
      total: 4,
      pending: 4,
      assigned: 0,
      inProgress: 0,
      resolved: 0,
      overdue: 0,
      resolutionRate: 0,
      slaComplianceRate: 100,
      avgResolutionHours: 0,
      workloadShare: 23.5,
    },
    {
      department: "Environment",
      total: 0,
      pending: 0,
      assigned: 0,
      inProgress: 0,
      resolved: 0,
      overdue: 0,
      resolutionRate: 0,
      slaComplianceRate: 100,
      avgResolutionHours: 0,
      workloadShare: 0,
    },
  ],
  resolution: {
    avgResolutionHours: 0.03,
    medianResolutionHours: 0.03,
    fastestDepartment: { department: "Water Supply", avgHours: 0.03 },
    slowestDepartment: { department: "Water Supply", avgHours: 0.03 },
    unresolvedCount: 16,
    ageingBuckets: [
      { range: "< 24 Hours", count: 0, percentage: 0 },
      { range: "1 - 3 Days", count: 1, percentage: 6.3 },
      { range: "3 - 7 Days", count: 5, percentage: 31.3 },
      { range: "> 7 Days", count: 10, percentage: 62.5 },
    ],
  },
  sla: {
    totalTracked: 5,
    compliantWithSla: 0,
    breached: 5,
    complianceRate: 0,
    totalEscalations: 9,
  },
  priority: {
    breakdown: [
      { priority: "Critical", count: 3, percentage: 17.6, resolved: 1, overdue: 1, resolutionRate: 33.3, avgResolutionHours: 0.03 },
      { priority: "High", count: 7, percentage: 41.2, resolved: 0, overdue: 4, resolutionRate: 0, avgResolutionHours: 0 },
      { priority: "Medium", count: 0, percentage: 0, resolved: 0, overdue: 0, resolutionRate: 0, avgResolutionHours: 0 },
      { priority: "Low", count: 0, percentage: 0, resolved: 0, overdue: 0, resolutionRate: 0, avgResolutionHours: 0 },
      { priority: "Unknown", count: 7, percentage: 41.2, resolved: 0, overdue: 0, resolutionRate: 0, avgResolutionHours: 0 },
    ],
  },
  appliedFilters: {
    dateRange: "allTime",
    department: "All Departments",
    interval: "monthly",
  },
};

describe("Advanced Admin Analytics Dashboard Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the analytics dashboard with all 6 KPI cards accurately", async () => {
    vi.mocked(adminApi.getAnalytics).mockResolvedValueOnce(mockAnalyticsData);

    render(
      <MemoryRouter>
        <AnalyticsDashboard />
      </MemoryRouter>
    );

    expect(screen.getByText("Advanced Analytics & Governance Intelligence")).toBeInTheDocument();

    await waitFor(() => {
      // Total Complaints
      expect(screen.getByText("17")).toBeInTheDocument();
      // Resolution Rate
      expect(screen.getByText("5.9%")).toBeInTheDocument();
      // Active Backlog
      expect(screen.getByText("16")).toBeInTheDocument();
      // Critical count
      expect(screen.getAllByText("3").length).toBeGreaterThanOrEqual(1);
      // Overdue count
      expect(screen.getAllByText("5").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("renders departmental efficiency scorecard and workload share", async () => {
    vi.mocked(adminApi.getAnalytics).mockResolvedValueOnce(mockAnalyticsData);

    render(
      <MemoryRouter>
        <AnalyticsDashboard />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Departmental Efficiency & SLA Scorecard")).toBeInTheDocument();
      expect(screen.getAllByText("Road & Infrastructure").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Water Supply").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Electricity").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Environment").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("58.8%")).toBeInTheDocument(); // Water workload share
    });
  });

  it("renders resolution velocity, median times, and ageing distribution", async () => {
    vi.mocked(adminApi.getAnalytics).mockResolvedValueOnce(mockAnalyticsData);

    render(
      <MemoryRouter>
        <AnalyticsDashboard />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Resolution Velocity & Department Benchmark")).toBeInTheDocument();
      expect(screen.getByText("Open Complaints Ageing Breakdown")).toBeInTheDocument();
      expect(screen.getByText("> 7 Days")).toBeInTheDocument();
      expect(screen.getByText("10 items (62.5%)")).toBeInTheDocument();
      expect(screen.getByText("5 items (31.3%)")).toBeInTheDocument();
    });
  });

  it("renders SLA compliance health and escalation counts", async () => {
    vi.mocked(adminApi.getAnalytics).mockResolvedValueOnce(mockAnalyticsData);

    render(
      <MemoryRouter>
        <AnalyticsDashboard />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("SLA Compliance & Escalation Analysis")).toBeInTheDocument();
      expect(screen.getByText("9")).toBeInTheDocument(); // 9 escalations
      expect(screen.getByText("Triggered events")).toBeInTheDocument();
      expect(screen.getByText(/exceeded their allotted resolution window/i)).toBeInTheDocument();
    });
  });

  it("renders priority distribution and urgency score", async () => {
    vi.mocked(adminApi.getAnalytics).mockResolvedValueOnce(mockAnalyticsData);

    render(
      <MemoryRouter>
        <AnalyticsDashboard />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("AI Priority & Urgency Distribution")).toBeInTheDocument();
      expect(screen.getByText("Avg Urgency: 8.3 / 10")).toBeInTheDocument();
      expect(screen.getAllByText("Critical").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("High")).toBeInTheDocument();
      expect(screen.getByText("Unknown")).toBeInTheDocument();
    });
  });

  it("interactively updates filters when department and interval are changed", async () => {
    vi.mocked(adminApi.getAnalytics).mockResolvedValue(mockAnalyticsData);

    render(
      <MemoryRouter>
        <AnalyticsDashboard />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(adminApi.getAnalytics).toHaveBeenCalledWith({
        department: undefined,
        dateRange: "allTime",
        interval: "monthly",
      });
    });

    // Change Department
    const deptSelect = screen.getByLabelText("Filter by Department");
    fireEvent.change(deptSelect, { target: { value: "Water Supply" } });

    await waitFor(() => {
      expect(adminApi.getAnalytics).toHaveBeenCalledWith({
        department: "Water Supply",
        dateRange: "allTime",
        interval: "monthly",
      });
    });

    // Change Interval
    const intervalSelect = screen.getByLabelText("Trend Time Interval");
    fireEvent.change(intervalSelect, { target: { value: "daily" } });

    await waitFor(() => {
      expect(adminApi.getAnalytics).toHaveBeenCalledWith({
        department: "Water Supply",
        dateRange: "allTime",
        interval: "daily",
      });
    });

    // Active badges should show
    expect(screen.getByText("Department: Water Supply")).toBeInTheDocument();
    expect(screen.getByText("Interval: Daily")).toBeInTheDocument();

    // Clear filters button resets
    const clearBtn = screen.getByTitle("Reset all filters to default");
    fireEvent.click(clearBtn);

    await waitFor(() => {
      expect(adminApi.getAnalytics).toHaveBeenCalledWith({
        department: undefined,
        dateRange: "allTime",
        interval: "monthly",
      });
    });
  });

  it("renders empty state cleanly when zero complaints match filter", async () => {
    const emptyData: AdminAnalyticsResponse = {
      ...mockAnalyticsData,
      summary: {
        ...mockAnalyticsData.summary,
        totalComplaints: 0,
      },
    };
    vi.mocked(adminApi.getAnalytics).mockResolvedValueOnce(emptyData);

    render(
      <MemoryRouter>
        <AnalyticsDashboard />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("No complaints match the selected filters")).toBeInTheDocument();
      expect(screen.getByText("Reset Filters")).toBeInTheDocument();
    });
  });

  it("renders error panel with retry button when API fails", async () => {
    vi.mocked(adminApi.getAnalytics).mockRejectedValueOnce(new Error("Network failure"));

    render(
      <MemoryRouter>
        <AnalyticsDashboard />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Retry")).toBeInTheDocument();
    });
  });
});
