import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ApiError } from "@/services/apiClient";

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
  },
  complaintsApiMock: {
    listMyAssigned: vi.fn(),
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
      listMyAssigned: complaintsApiMock.listMyAssigned,
    },
  };
});

import { AuthProvider } from "@/contexts/AuthContext";
import AuthPage from "@/pages/auth/AuthPage";
import ComplaintDetail from "@/pages/authority/ComplaintDetail";
import OfficerDashboard from "@/pages/authority/OfficerDashboard";

describe("Officer Manual Login and Complaint Detail Integration", () => {
  beforeEach(() => {
    localStorage.clear();
    authApiMock.login.mockReset();
    authApiMock.getMe.mockReset();
    authApiMock.getOfficerOptions.mockReset();
    authApiMock.getOfficerOptions.mockResolvedValue([
      {
        id: "officer-road-id",
        name: "Officer Priya",
        email: "road.demo@govai.gov",
        department: "Road & Infrastructure",
        status: "active",
        isLinked: true,
        statusBadge: "Active • Linked",
      },
    ]);
    apiClientMock.get.mockReset();
    membersApiMock.list.mockReset();
    complaintsApiMock.listMyAssigned.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("permits manual officer login with email and password without selecting department beforehand", async () => {
    authApiMock.login.mockResolvedValueOnce({
      token: "mock-officer-token",
      user: {
        id: "officer-road-id",
        name: "Officer Priya",
        email: "officer.road@govai.gov",
        role: "department",
        department: "Road & Infrastructure",
        departmentRole: "officer",
        status: "active",
        isOfficer: true,
        memberId: "member-priya-id",
        memberName: "Officer Priya",
      },
    });

    render(
      <BrowserRouter>
        <AuthProvider>
          <AuthPage initialMode="login" />
        </AuthProvider>
      </BrowserRouter>
    );

    // Switch to Officer tab
    fireEvent.click(screen.queryByRole("radio", { name: "Officer" }) || screen.getByRole("button", { name: "Officer" }));

    // Type email and password
    fireEvent.change(screen.getByLabelText("Email Address"), {
      target: { value: "officer.road@govai.gov" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "SecurePass123" },
    });

    // Click submit button directly without clicking department demo buttons
    fireEvent.click(screen.getByRole("button", { name: /initialize dashboard/i }));

    await waitFor(() => expect(authApiMock.login).toHaveBeenCalledOnce());
    expect(authApiMock.login).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "officer.road@govai.gov",
        password: "SecurePass123",
        role: "department",
        departmentRole: "officer",
      })
    );
  });

  it("does not overwrite manually entered credentials when department and officer buttons are clicked", async () => {
    render(
      <BrowserRouter>
        <AuthProvider>
          <AuthPage initialMode="login" />
        </AuthProvider>
      </BrowserRouter>
    );

    fireEvent.click(screen.queryByRole("radio", { name: "Officer" }) || screen.getByRole("button", { name: "Officer" }));

    // User enters custom credentials
    fireEvent.change(screen.getByLabelText("Email Address"), {
      target: { value: "custom.officer@govai.gov" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "CustomPassword" },
    });

    // User selects department in Step 1
    fireEvent.click(screen.getByRole("button", { name: "Road & Infrastructure" }));
    // User clicks officer button in Step 2
    const officerBtn = await screen.findByRole("button", { name: /road officer/i });
    fireEvent.click(officerBtn);

    // Credentials MUST NOT be overwritten
    expect(screen.getByLabelText("Email Address")).toHaveValue("custom.officer@govai.gov");
    expect(screen.getByLabelText("Password")).toHaveValue("CustomPassword");
    expect(authApiMock.login).not.toHaveBeenCalled();
  });

  it("loads complaint detail for officer without calling membersApi.list()", async () => {
    const mockOfficerUser = {
      id: "officer-road-id",
      name: "Officer Priya",
      email: "officer.road@govai.gov",
      role: "authority",
      department: "Road & Infrastructure",
      departmentRole: "officer",
      status: "active",
      isOfficer: true,
      memberId: "member-priya-id",
      memberName: "Officer Priya",
    };
    localStorage.setItem("govai_user", JSON.stringify(mockOfficerUser));
    localStorage.setItem("govai_token", "mock-officer-token");
    authApiMock.getMe.mockResolvedValue({ user: mockOfficerUser });

    apiClientMock.get.mockImplementation(async (path: string) => {
      if (path === "/api/complaints/c123") {
        return {
          _id: "c123",
          title: "Massive pothole on Main Street",
          description: "Dangerous pothole damaging vehicles",
          status: "In Progress",
          priority: "High",
          category: "Road & Infrastructure",
          location: "Main Street Junction",
          createdAt: new Date().toISOString(),
          assignedTo: { _id: "member-priya-id", name: "Officer Priya" },
          timeline: [],
        };
      }
      return null;
    });

    render(
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/department/complaints/:id" element={<ComplaintDetail />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    );

    window.history.pushState({}, "", "/department/complaints/c123");

    // Re-render with route matching
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
      expect(screen.getByText("Massive pothole on Main Street")).toBeInTheDocument();
    });

    // membersApi.list() should NOT be called for officers
    expect(membersApiMock.list).not.toHaveBeenCalled();
  });

  it("shows unlinked officer restriction screen when officer has no linked member profile", async () => {
    const mockUnlinkedOfficer = {
      id: "officer-water-id",
      name: "Officer Rajesh",
      email: "water.demo@govai.gov",
      role: "authority",
      department: "Water Supply",
      departmentRole: "officer",
      status: "active",
      isOfficer: true,
      memberId: null,
      memberName: null,
    };
    localStorage.setItem("govai_user", JSON.stringify(mockUnlinkedOfficer));
    localStorage.setItem("govai_token", "mock-officer-token");
    authApiMock.getMe.mockResolvedValue({ user: mockUnlinkedOfficer });

    // Mock 403 ApiError from complaintsApi.listMyAssigned
    complaintsApiMock.listMyAssigned.mockRejectedValueOnce(
      new ApiError(403, "No officer Member profile is linked to this account")
    );

    render(
      <BrowserRouter>
        <AuthProvider>
          <OfficerDashboard />
        </AuthProvider>
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Officer Profile Not Linked")).toBeInTheDocument();
    });

    expect(
      screen.getByText(
        "Your account is authenticated, but no verified Officer Member profile is linked to this account. Please contact your Department Authority or administrator."
      )
    ).toBeInTheDocument();

    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /logout/i })).toBeInTheDocument();
  });
});
