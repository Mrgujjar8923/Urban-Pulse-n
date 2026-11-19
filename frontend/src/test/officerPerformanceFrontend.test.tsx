import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { OfficerPerformance } from "@/pages/authority/OfficerPerformance";
import DepartmentDashboard from "@/pages/authority/AuthorityDashboard";
import { membersApi, complaintsApi, DepartmentOfficerPerformanceResponse } from "@/services/complaintsApi";

// Mock AuthContext
const mockAuthorityUser = {
  id: "auth-1",
  name: "Water Authority",
  email: "water_authority@govai.in",
  role: "authority",
  departmentRole: "authority",
  department: "Water Supply",
};

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: mockAuthorityUser,
    logout: vi.fn(),
    login: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

vi.mock("@/services/complaintsApi", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@/services/complaintsApi");
  return {
    ...actual,
    membersApi: {
      list: vi.fn(),
      getPerformance: vi.fn(),
      listEligibleUsers: vi.fn(),
    },
    complaintsApi: {
      listDepartment: vi.fn(),
      assign: vi.fn(),
    },
  };
});

describe("Phase 8.15: Department Authority Officer Performance Dashboard", () => {
  const mockPerformanceData: DepartmentOfficerPerformanceResponse = {
    department: "Water Supply",
    summary: {
      totalOfficers: 2,
      activeOfficers: 1,
      totalAssignedComplaints: 6,
      resolvedComplaints: 4,
      pendingComplaints: 2,
      authorityResolvedComplaints: 1,
      feedbackSummary: {
        totalFeedbacks: 2,
        avgRating: 4.5,
        percentSatisfied: 100,
      },
    },
    officers: [
      {
        id: "m-1",
        name: "Officer Priya",
        department: "Water Supply",
        status: "active",
        isLinked: true,
        linkedUser: {
          id: "u-1",
          name: "Officer Priya",
          email: "priya@water.govai.in",
          status: "active",
        },
        assignedComplaints: 4,
        resolvedComplaints: 3,
        pendingComplaints: 1,
        resolutionRate: 75,
        avgRating: 4.5,
        feedbackCount: 2,
      },
      {
        id: "m-2",
        name: "Officer Ghost",
        department: "Water Supply",
        status: "inactive",
        isLinked: false,
        linkedUser: null,
        assignedComplaints: 2,
        resolvedComplaints: 0,
        pendingComplaints: 2,
        resolutionRate: 0,
        avgRating: null, // Critical: "Not Rated"
        feedbackCount: 0,
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. Dedicated OfficerPerformance page renders department header, 6 KPI cards, and officer cards", async () => {
    vi.mocked(membersApi.getPerformance).mockResolvedValueOnce(mockPerformanceData);

    render(
      <MemoryRouter>
        <OfficerPerformance />
      </MemoryRouter>
    );

    // Verify loading and header
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Officer Performance/i })).toBeDefined();
    });

    // Check Department badge and text
    expect(screen.getAllByText(/Water Supply/i).length).toBeGreaterThan(0);

    // Verify Department Summary metrics
    expect(screen.getByText("Rostered staff")).toBeDefined();
    expect(screen.getAllByText("2").length).toBeGreaterThan(0); // Total Officers / pending
    expect(screen.getAllByText("1").length).toBeGreaterThan(0); // Active Officers / pending
    expect(screen.getByText("6")).toBeDefined(); // Assigned
    expect(screen.getAllByText("4").length).toBeGreaterThan(0); // Resolved / assigned

    // Verify Officer Priya card
    expect(screen.getByRole("heading", { name: "Officer Priya" })).toBeDefined();
    expect(screen.getByText("priya@water.govai.in")).toBeDefined();
    expect(screen.getByText("75%")).toBeDefined(); // Resolution rate
    expect(screen.getAllByText("4.5").length).toBeGreaterThan(0); // Rating
    expect(screen.getAllByText("2 reviews").length).toBeGreaterThan(0);

    // Verify Officer Ghost card with "Not Rated" and Unlinked status
    expect(screen.getByRole("heading", { name: "Officer Ghost" })).toBeDefined();
    expect(screen.getAllByText("Not Rated").length).toBeGreaterThan(0);
    expect(screen.getAllByText("0 reviews").length).toBeGreaterThan(0);
    expect(screen.getByText("Unlinked")).toBeDefined();
  });

  it("2. Displays 'Not Rated' for department summary when no citizen feedback exists", async () => {
    const unratedData: DepartmentOfficerPerformanceResponse = {
      ...mockPerformanceData,
      summary: {
        ...mockPerformanceData.summary,
        feedbackSummary: {
          totalFeedbacks: 0,
          avgRating: null,
          percentSatisfied: null,
        },
      },
      officers: [
        {
          ...mockPerformanceData.officers[0],
          avgRating: null,
          feedbackCount: 0,
        },
      ],
    };

    vi.mocked(membersApi.getPerformance).mockResolvedValueOnce(unratedData);

    render(
      <MemoryRouter>
        <OfficerPerformance />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Officer Performance/i })).toBeDefined();
    });

    // Should display "Not Rated" in both Summary and Officer Card
    const notRatedElements = screen.getAllByText(/Not Rated/i);
    expect(notRatedElements.length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("0 reviews").length).toBeGreaterThan(0);
  });

  it("3. Authority Dashboard embeds the dedicated Officer Performance section", async () => {
    vi.mocked(complaintsApi.listDepartment).mockResolvedValueOnce([]);
    vi.mocked(membersApi.list).mockResolvedValueOnce([]);
    vi.mocked(membersApi.getPerformance).mockResolvedValueOnce(mockPerformanceData);

    render(
      <MemoryRouter>
        <DepartmentDashboard />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole("region", { name: /Officer Performance/i })).toBeDefined();
    });

    // Check link to full view
    expect(screen.getByRole("link", { name: /Full Performance View/i })).toBeDefined();

    // Check Officer Priya scorecard embedded
    expect(screen.getByText("Officer Priya")).toBeDefined();
    expect(screen.getByText("75%")).toBeDefined();
    expect(screen.getByText("Officer Ghost")).toBeDefined();
  });

  it("4. Displays friendly empty state when department has 0 officers", async () => {
    const emptyData: DepartmentOfficerPerformanceResponse = {
      department: "Water Supply",
      summary: {
        totalOfficers: 0,
        activeOfficers: 0,
        totalAssignedComplaints: 0,
        resolvedComplaints: 0,
        pendingComplaints: 0,
        authorityResolvedComplaints: 0,
        feedbackSummary: {
          totalFeedbacks: 0,
          avgRating: null,
          percentSatisfied: null,
        },
      },
      officers: [],
    };

    vi.mocked(membersApi.getPerformance).mockResolvedValueOnce(emptyData);

    render(
      <MemoryRouter>
        <OfficerPerformance />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/No Officers Rostered/i)).toBeDefined();
    });

    expect(screen.getByRole("link", { name: /Go to Team Management/i })).toBeDefined();
  });
});
