import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserRouter, useLocation } from "react-router-dom";

const { authApiMock } = vi.hoisted(() => ({
  authApiMock: {
    login: vi.fn(),
    getMe: vi.fn(),
    register: vi.fn(),
    getOfficerOptions: vi.fn(),
  },
}));

vi.mock("@/services/authApi", () => ({ authApi: authApiMock }));

import { AuthProvider } from "@/contexts/AuthContext";
import AuthPage from "@/pages/auth/AuthPage";

const Location = () => <output data-testid="location">{useLocation().pathname}</output>;
const renderLogin = () => render(
  <BrowserRouter>
    <AuthProvider>
      <AuthPage initialMode="login" />
      <Location />
    </AuthProvider>
  </BrowserRouter>,
);

const demoCases = [
  { label: "Citizen Demo", email: "citizen.demo@govai.gov", role: "citizen", route: "/citizen", key: "VITE_DEMO_CITIZEN_PASSWORD" },
  { label: "Admin Demo Access", email: "admin@govai.gov", role: "admin", route: "/admin", key: "VITE_DEMO_ADMIN_PASSWORD" },
  { label: "Road & Infrastructure Authority", email: "authority@demo.com", department: "Road & Infrastructure", role: "department", departmentRole: "authority", route: "/department", key: "VITE_DEMO_ROAD_AUTHORITY_PASSWORD" },
  { label: "Water Supply Authority", email: "water@demo.com", department: "Water Supply", role: "department", departmentRole: "authority", route: "/department", key: "VITE_DEMO_WATER_AUTHORITY_PASSWORD" },
  { label: "Electricity Authority", email: "electricity@demo.com", department: "Electricity", role: "department", departmentRole: "authority", route: "/department", key: "VITE_DEMO_ELECTRICITY_AUTHORITY_PASSWORD" },
  { label: "Environment Authority", email: "environment@demo.com", department: "Environment", role: "department", departmentRole: "authority", route: "/department", key: "VITE_DEMO_ENVIRONMENT_AUTHORITY_PASSWORD" },
  { label: "Road Officer", email: "road.demo@govai.gov", department: "Road & Infrastructure", role: "department", departmentRole: "officer", route: "/department", key: "VITE_DEMO_ROAD_OFFICER_PASSWORD" },
  { label: "Water Officer", email: "water.demo@govai.gov", department: "Water Supply", role: "department", departmentRole: "officer", route: "/department", key: "VITE_DEMO_WATER_OFFICER_PASSWORD" },
  { label: "Electricity Officer", email: "electricity.demo@govai.gov", department: "Electricity", role: "department", departmentRole: "officer", route: "/department", key: "VITE_DEMO_ELECTRICITY_OFFICER_PASSWORD" },
  { label: "Environment Officer", email: "environment.demo@govai.gov", department: "Environment", role: "department", departmentRole: "officer", route: "/department", key: "VITE_DEMO_ENVIRONMENT_OFFICER_PASSWORD" },
] as const;

const testCaseName = (email: string) => email.split("@")[0] ?? "Demo User";
const getRoleBtn = (name: string) => screen.queryByRole("radio", { name }) || screen.getByRole("button", { name });

describe("demo login buttons", () => {
  beforeEach(() => {
    localStorage.clear();
    authApiMock.login.mockReset();
    authApiMock.getMe.mockReset();
    authApiMock.register.mockReset();
    authApiMock.getOfficerOptions.mockReset();
    authApiMock.getOfficerOptions.mockImplementation(async (dept?: string) => {
      const allOfficers = [
        { id: "1", name: "Officer Priya", email: "road.demo@govai.gov", department: "Road & Infrastructure", status: "active", isLinked: true, statusBadge: "Active • Linked" },
        { id: "2", name: "Officer Rajesh", email: "water.demo@govai.gov", department: "Water Supply", status: "active", isLinked: true, statusBadge: "Active • Linked" },
        { id: "3", name: "Officer Amit", email: "electricity.demo@govai.gov", department: "Electricity", status: "active", isLinked: true, statusBadge: "Active • Linked" },
        { id: "4", name: "Officer Neha", email: "environment.demo@govai.gov", department: "Environment", status: "active", isLinked: true, statusBadge: "Active • Linked" },
      ];
      return dept ? allOfficers.filter((o) => o.department === dept) : allOfficers;
    });
    for (const testCase of demoCases) vi.stubEnv(testCase.key, "test-only-password");
    authApiMock.login.mockImplementation(async (payload) => ({
      token: "mock-demo-token",
      user: {
        id: `id-${payload.email}`,
        name: testCaseName(payload.email),
        email: payload.email,
        role: payload.role,
        department: payload.department,
        departmentRole: payload.departmentRole,
        status: "active",
      },
    }));
    authApiMock.getMe.mockImplementation(async () => {
      const payload = authApiMock.login.mock.calls.at(-1)?.[0];
      return { user: {
        id: `id-${payload.email}`,
        name: testCaseName(payload.email),
        email: payload.email,
        role: payload.role,
        department: payload.department,
        departmentRole: payload.departmentRole,
        status: "active",
      } };
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  it.each(demoCases)("$label fills fields, does not auto-submit, authenticates on submit, and routes by server identity", async (testCase) => {
    renderLogin();
    if ("departmentRole" in testCase && testCase.departmentRole === "officer") {
      fireEvent.click(getRoleBtn("Officer"));
      fireEvent.click(screen.getByRole("button", { name: testCase.department }));
      const officerBtn = await screen.findByRole("button", { name: new RegExp(testCase.label) });
      fireEvent.click(officerBtn);
    } else if ("departmentRole" in testCase && testCase.departmentRole === "authority") {
      fireEvent.click(getRoleBtn("Department"));
      fireEvent.click(screen.getByRole("button", { name: new RegExp(testCase.label) }));
    } else {
      fireEvent.click(screen.getByRole("button", { name: new RegExp(testCase.label) }));
    }

    // Verify fields are populated without auto-submitting
    await waitFor(() => {
      expect(screen.getByLabelText("Email Address")).toHaveValue(testCase.email);
      expect(screen.getByLabelText("Password")).toHaveValue("test-only-password");
    });
    expect(authApiMock.login).not.toHaveBeenCalled();

    // Explicit submission via "Initialize Dashboard"
    fireEvent.click(screen.getByRole("button", { name: /initialize dashboard/i }));

    await waitFor(() => expect(authApiMock.login).toHaveBeenCalledOnce());
    expect(authApiMock.login).toHaveBeenCalledWith(expect.objectContaining({
      email: testCase.email,
      password: "test-only-password",
    }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent(testCase.route));
    expect(authApiMock.getMe).toHaveBeenCalledOnce();
    expect(localStorage.getItem("govai_token")).toBe("mock-demo-token");
  });

  it("strictly isolates role-based options across Citizen, Department, and Officer tabs", async () => {
    renderLogin();

    // 1. Citizen Tab (active by default)
    expect(screen.getByRole("button", { name: "Citizen Demo" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Road & Infrastructure Authority/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Water Supply Authority/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Road Officer/i })).not.toBeInTheDocument();

    // 2. Department Authority Tab
    fireEvent.click(getRoleBtn("Department"));
    expect(screen.queryByRole("button", { name: "Citizen Demo" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Road & Infrastructure Authority/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Water Supply Authority/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Electricity Authority/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Environment Authority/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Road Officer/i })).not.toBeInTheDocument();

    // 3. Officer Tab
    fireEvent.click(getRoleBtn("Officer"));
    expect(screen.queryByRole("button", { name: "Citizen Demo" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Road & Infrastructure Authority/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Step 1: Select Department/i)).toBeInTheDocument();
    // Initially no officer profile button until a department is picked
    expect(screen.queryByRole("button", { name: /Road Officer/i })).not.toBeInTheDocument();

    // Pick Road & Infrastructure in Step 1
    fireEvent.click(screen.getByRole("button", { name: "Road & Infrastructure" }));
    expect(screen.getByText(/Step 2: Select Officer Profile/i)).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Road Officer/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Water Officer/i })).not.toBeInTheDocument();

    // Pick Water Supply in Step 1
    fireEvent.click(screen.getByRole("button", { name: "Water Supply" }));
    expect(await screen.findByRole("button", { name: /Water Officer/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Road Officer/i })).not.toBeInTheDocument();
  });

  it("resets credentials and selections when switching between role tabs", async () => {
    renderLogin();

    // Select Citizen Demo
    fireEvent.click(screen.getByRole("button", { name: "Citizen Demo" }));
    await waitFor(() => expect(screen.getByLabelText("Email Address")).toHaveValue("citizen.demo@govai.gov"));

    // Switch to Department tab -> credentials reset
    fireEvent.click(getRoleBtn("Department"));
    expect(screen.getByLabelText("Email Address")).toHaveValue("");
    expect(screen.getByLabelText("Password")).toHaveValue("");

    // Select Road Authority
    fireEvent.click(screen.getByRole("button", { name: /Road & Infrastructure Authority/i }));
    await waitFor(() => expect(screen.getByLabelText("Email Address")).toHaveValue("authority@demo.com"));

    // Switch to Officer tab -> credentials reset
    fireEvent.click(getRoleBtn("Officer"));
    expect(screen.getByLabelText("Email Address")).toHaveValue("");
    expect(screen.getByLabelText("Password")).toHaveValue("");
  });

  it("prevents duplicate login submissions while authentication is pending", async () => {
    let releaseLogin: ((response: unknown) => void) | undefined;
    authApiMock.login.mockReturnValue(new Promise((resolve) => { releaseLogin = resolve; }));
    renderLogin();

    const citizenButton = screen.getByRole("button", { name: "Citizen Demo" });
    fireEvent.click(citizenButton);

    const submitButton = screen.getByRole("button", { name: /initialize dashboard/i });
    await waitFor(() => expect(screen.getByLabelText("Password")).toHaveValue("test-only-password"));
    fireEvent.click(submitButton);

    await waitFor(() => expect(authApiMock.login).toHaveBeenCalledOnce());
    fireEvent.click(submitButton);
    expect(authApiMock.login).toHaveBeenCalledOnce();

    releaseLogin?.({
      token: "mock-demo-token",
      user: { id: "citizen-id", name: "Demo Citizen", email: "citizen.demo@govai.gov", role: "citizen", status: "active" },
    });
    await waitFor(() => expect(authApiMock.getMe).toHaveBeenCalledOnce());
  });
});
