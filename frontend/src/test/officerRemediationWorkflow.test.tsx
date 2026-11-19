import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserRouter, Route, Routes } from "react-router-dom";

const { authApiMock, apiClientMock, membersApiMock, complaintsApiMock } = vi.hoisted(() => ({
  authApiMock: {
    login: vi.fn(),
    getMe: vi.fn(),
    register: vi.fn(),
    getOfficerOptions: vi.fn(),
  },
  apiClientMock: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  membersApiMock: {
    list: vi.fn(),
    listEligibleUsers: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  complaintsApiMock: {
    listDepartment: vi.fn(),
    listMyAssigned: vi.fn(),
    assign: vi.fn(),
  },
}));

vi.mock("@/services/authApi", () => ({ authApi: authApiMock }));
vi.mock("@/services/apiClient", async () => {
  const actual = await vi.importActual<typeof import("@/services/apiClient")>("@/services/apiClient");
  return {
    ...actual,
    apiClient: apiClientMock,
  };
});
vi.mock("@/services/complaintsApi", async () => {
  const actual = await vi.importActual<typeof import("@/services/complaintsApi")>("@/services/complaintsApi");
  return {
    ...actual,
    membersApi: membersApiMock,
    complaintsApi: {
      ...actual.complaintsApi,
      listDepartment: complaintsApiMock.listDepartment,
      listMyAssigned: complaintsApiMock.listMyAssigned,
      assign: complaintsApiMock.assign,
    },
  };
});

import { AuthProvider } from "@/contexts/AuthContext";
import AuthPage from "@/pages/auth/AuthPage";
import DepartmentDashboard from "@/pages/authority/AuthorityDashboard";
import ComplaintDetail from "@/pages/authority/ComplaintDetail";
import { isEligibleOfficerMember, MemberRecord } from "@/services/complaintsApi";

describe("Phase 8.10 Officer Remediation Workflow", () => {
  beforeEach(() => {
    localStorage.clear();
    authApiMock.login.mockReset();
    authApiMock.getMe.mockReset();
    authApiMock.getOfficerOptions.mockReset();
    apiClientMock.get.mockReset();
    membersApiMock.list.mockReset();
    complaintsApiMock.listDepartment.mockReset();
    complaintsApiMock.assign.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  describe("Helper: isEligibleOfficerMember", () => {
    it("accepts an active linked officer in the matching department", () => {
      const member: MemberRecord = {
        id: "m1",
        name: "Officer Priya",
        department: "Road & Infrastructure",
        userId: {
          id: "u1",
          name: "Officer Priya",
          email: "road.demo@govai.gov",
          department: "Road & Infrastructure",
          departmentRole: "officer",
          status: "active",
        },
      };
      expect(isEligibleOfficerMember(member, "Road & Infrastructure")).toBe(true);
    });

    it("rejects an unlinked officer member (userId is null)", () => {
      const member: MemberRecord = {
        id: "m2",
        name: "Unlinked Officer",
        department: "Road & Infrastructure",
        userId: null,
      };
      expect(isEligibleOfficerMember(member, "Road & Infrastructure")).toBe(false);
    });

    it("rejects an officer with an inactive user account", () => {
      const member: MemberRecord = {
        id: "m3",
        name: "Inactive Officer",
        department: "Road & Infrastructure",
        userId: {
          id: "u3",
          name: "Inactive Officer",
          email: "inactive@govai.gov",
          status: "inactive",
          departmentRole: "officer",
        },
      };
      expect(isEligibleOfficerMember(member, "Road & Infrastructure")).toBe(false);
    });

    it("rejects an account that is an authority rather than an officer", () => {
      const member: MemberRecord = {
        id: "m4",
        name: "Authority Member",
        department: "Road & Infrastructure",
        userId: {
          id: "u4",
          name: "Authority User",
          email: "authority@demo.com",
          status: "active",
          departmentRole: "authority",
        },
      };
      expect(isEligibleOfficerMember(member, "Road & Infrastructure")).toBe(false);
    });

    it("rejects an officer belonging to a different department", () => {
      const member: MemberRecord = {
        id: "m5",
        name: "Water Officer",
        department: "Water Supply",
        userId: {
          id: "u5",
          name: "Water User",
          email: "water@demo.com",
          status: "active",
          departmentRole: "officer",
          department: "Water Supply",
        },
      };
      expect(isEligibleOfficerMember(member, "Road & Infrastructure")).toBe(false);
    });
  });

  describe("Authority Complaint Detail Dropdown", () => {
    it("filters out unlinked officers and displays only eligible active linked officers", async () => {
      const mockAuthority = {
        id: "auth-1",
        name: "Road Authority",
        email: "road.auth@govai.gov",
        role: "authority",
        department: "Road & Infrastructure",
        departmentRole: "authority",
        status: "active",
      };
      localStorage.setItem("govai_token", "test-token");
      localStorage.setItem("govai_user", JSON.stringify(mockAuthority));
      authApiMock.getMe.mockResolvedValue({ user: mockAuthority });

      apiClientMock.get.mockImplementation(async (url: string) => {
        if (url === "/api/auth/me") return { user: mockAuthority };
        if (url.includes("/api/complaints/c100")) {
          return {
            id: "c100",
            _id: "c100",
            reference: "GOV-2026-TEST",
            title: "Road Repair",
            description: "Deep crater in lane 2",
            category: "Road & Infrastructure",
            status: "Pending",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            assignedTo: null,
            timeline: [],
            sla: { slaStatus: "On Track", remainingMs: 3600000 },
          };
        }
        return {};
      });

      membersApiMock.list.mockResolvedValue([
        {
          id: "m-linked",
          name: "Officer Priya (Linked)",
          department: "Road & Infrastructure",
          userId: {
            id: "u-priya",
            name: "Officer Priya",
            email: "road.demo@govai.gov",
            status: "active",
            departmentRole: "officer",
            department: "Road & Infrastructure",
          },
        },
        {
          id: "m-unlinked",
          name: "Officer Ghost (Unlinked)",
          department: "Road & Infrastructure",
          userId: null,
        },
        {
          id: "m-wrong-dept",
          name: "Officer Rajesh (Water)",
          department: "Water Supply",
          userId: {
            id: "u-rajesh",
            name: "Officer Rajesh",
            email: "water.demo@govai.gov",
            status: "active",
            departmentRole: "officer",
            department: "Water Supply",
          },
        },
      ]);

      render(
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/department/complaints/:id" element={<ComplaintDetail />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      );

      window.history.pushState({}, "", "/department/complaints/c100");

      cleanup();
      render(
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/department/complaints/:id" element={<ComplaintDetail />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText("Road Repair")).toBeInTheDocument();
      });

      // The select dropdown should contain Officer Priya
      expect(screen.getByText("Officer Priya (Linked)")).toBeInTheDocument();
      // The select dropdown must NOT contain the unlinked officer
      expect(screen.queryByText("Officer Ghost (Unlinked)")).not.toBeInTheDocument();
      // The select dropdown must NOT contain the other department officer
      expect(screen.queryByText("Officer Rajesh (Water)")).not.toBeInTheDocument();
    });

    it("displays friendly message when no eligible officers exist for assignment", async () => {
      const mockAuthority = {
        id: "auth-1",
        name: "Road Authority",
        email: "road.auth@govai.gov",
        role: "authority",
        department: "Road & Infrastructure",
        departmentRole: "authority",
        status: "active",
      };
      localStorage.setItem("govai_token", "test-token");
      localStorage.setItem("govai_user", JSON.stringify(mockAuthority));
      authApiMock.getMe.mockResolvedValue({ user: mockAuthority });

      apiClientMock.get.mockImplementation(async (url: string) => {
        if (url === "/api/auth/me") return { user: mockAuthority };
        if (url.includes("/api/complaints/c200")) {
          return {
            id: "c200",
            _id: "c200",
            reference: "GOV-2026-TEST2",
            title: "Road Blocked",
            description: "Fallen tree",
            category: "Road & Infrastructure",
            status: "Pending",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            assignedTo: null,
            timeline: [],
            sla: { slaStatus: "On Track", remainingMs: 3600000 },
          };
        }
        return {};
      });

      // Only unlinked members in department
      membersApiMock.list.mockResolvedValue([
        {
          id: "m-unlinked-only",
          name: "Unlinked Roster Slot",
          department: "Road & Infrastructure",
          userId: null,
        },
      ]);

      render(
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/department/complaints/:id" element={<ComplaintDetail />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      );

      window.history.pushState({}, "", "/department/complaints/c200");

      cleanup();
      render(
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/department/complaints/:id" element={<ComplaintDetail />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText("Road Blocked")).toBeInTheDocument();
      });

      // Renders friendly message instead of empty/broken select
      expect(screen.getByText("No linked officers available in this department")).toBeInTheDocument();
      expect(screen.queryByLabelText("Assign officer")).not.toBeInTheDocument();
    });
  });

  describe("Dynamic Officer Login Selector in AuthPage", () => {
    it("fetches and renders active linked officers dynamically when department is picked", async () => {
      authApiMock.getOfficerOptions.mockImplementation(async (department?: string) => {
        if (department === "Road & Infrastructure") {
          return [
            {
              id: "priya-1",
              name: "Officer Priya",
              email: "road.demo@govai.gov",
              department: "Road & Infrastructure",
              status: "active",
              isLinked: true,
              statusBadge: "Active • Linked",
            },
          ];
        }
        if (department === "Water Supply") {
          return [
            {
              id: "rajesh-1",
              name: "Officer Rajesh",
              email: "water.demo@govai.gov",
              department: "Water Supply",
              status: "active",
              isLinked: true,
              statusBadge: "Active • Linked",
            },
          ];
        }
        return [];
      });

      render(
        <BrowserRouter>
          <AuthProvider>
            <AuthPage initialMode="login" />
          </AuthProvider>
        </BrowserRouter>
      );

      // Select Officer role
      const officerRadio = screen.queryByRole("radio", { name: "Officer" }) || screen.getByRole("button", { name: "Officer" });
      fireEvent.click(officerRadio);

      // Initially shows Step 1: Select Department
      expect(screen.getByText(/Step 1: Select Department/i)).toBeInTheDocument();

      // Click Road & Infrastructure
      fireEvent.click(screen.getByRole("button", { name: "Road & Infrastructure" }));

      // Officer options API is queried for Road & Infrastructure
      await waitFor(() => {
        expect(authApiMock.getOfficerOptions).toHaveBeenCalledWith("Road & Infrastructure");
      });

      // Officer Priya appears
      const priyaBtn = await screen.findByRole("button", { name: /Road Officer/i });
      expect(priyaBtn).toBeInTheDocument();
      expect(screen.getByText("Officer Priya")).toBeInTheDocument();
      expect(screen.getByText("road.demo@govai.gov")).toBeInTheDocument();

      // Switch department to Water Supply
      fireEvent.click(screen.getByRole("button", { name: "Water Supply" }));

      // Officer options API refreshes with Water Supply
      await waitFor(() => {
        expect(authApiMock.getOfficerOptions).toHaveBeenCalledWith("Water Supply");
      });

      // Officer Rajesh appears, Priya is no longer shown
      const rajeshBtn = await screen.findByRole("button", { name: /Water Officer/i });
      expect(rajeshBtn).toBeInTheDocument();
      expect(screen.getByText("Officer Rajesh")).toBeInTheDocument();
      expect(screen.queryByText("Officer Priya")).not.toBeInTheDocument();
    });

    it("displays clean notice when department has no active linked officers", async () => {
      authApiMock.getOfficerOptions.mockResolvedValue([]);

      render(
        <BrowserRouter>
          <AuthProvider>
            <AuthPage initialMode="login" />
          </AuthProvider>
        </BrowserRouter>
      );

      const officerRadio = screen.queryByRole("radio", { name: "Officer" }) || screen.getByRole("button", { name: "Officer" });
      fireEvent.click(officerRadio);

      // Pick Environment (which in live DB has unlinked Neha)
      fireEvent.click(screen.getByRole("button", { name: "Environment" }));

      await waitFor(() => {
        expect(authApiMock.getOfficerOptions).toHaveBeenCalledWith("Environment");
      });

      const emptyBanner = await screen.findByTestId("no-linked-officers-banner");
      expect(emptyBanner).toHaveTextContent("No active linked officers available for Environment.");
    });

    it("renders newly linked officers dynamically without hardcoded data", async () => {
      // Simulate an administrator just linked a brand-new officer "Officer Vikram"
      authApiMock.getOfficerOptions.mockImplementation(async (dept?: string) => {
        if (dept === "Electricity") {
          return [
            {
              id: "vikram-uuid",
              name: "Officer Vikram",
              email: "vikram.power@govai.gov",
              department: "Electricity",
              status: "active",
              isLinked: true,
              statusBadge: "Active • Linked",
            },
          ];
        }
        return [];
      });

      render(
        <BrowserRouter>
          <AuthProvider>
            <AuthPage initialMode="login" />
          </AuthProvider>
        </BrowserRouter>
      );

      fireEvent.click(screen.queryByRole("radio", { name: "Officer" }) || screen.getByRole("button", { name: "Officer" }));
      fireEvent.click(screen.getByRole("button", { name: "Electricity" }));

      // Brand-new officer appears dynamically in the UI
      const vikramBtn = await screen.findByRole("button", { name: /Officer Vikram/i });
      expect(vikramBtn).toBeInTheDocument();
      expect(screen.getByText("Officer Vikram")).toBeInTheDocument();
      expect(screen.getByText("vikram.power@govai.gov")).toBeInTheDocument();

      // Clicking the newly linked officer populates the login form
      fireEvent.click(vikramBtn);
      await waitFor(() => {
        expect(screen.getByLabelText("Email Address")).toHaveValue("vikram.power@govai.gov");
      });
    });

    it("preserves standard Citizen and Authority authentication submissions", async () => {
      authApiMock.login.mockResolvedValueOnce({
        token: "citizen-test-jwt",
        user: {
          id: "citizen-1",
          name: "Citizen Jane",
          email: "citizen.jane@govai.gov",
          role: "citizen",
          status: "active",
        },
      });

      render(
        <BrowserRouter>
          <AuthProvider>
            <AuthPage initialMode="login" />
          </AuthProvider>
        </BrowserRouter>
      );

      // Default citizen mode
      fireEvent.change(screen.getByLabelText("Email Address"), { target: { value: "citizen.jane@govai.gov" } });
      fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
      fireEvent.click(screen.getByRole("button", { name: /Initialize Dashboard/i }));

      await waitFor(() => {
        expect(authApiMock.login).toHaveBeenCalledWith(
          expect.objectContaining({
            email: "citizen.jane@govai.gov",
            role: "citizen",
          })
        );
      });
    });
  });
});
