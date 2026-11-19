import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "@/App";
import type { User } from "@/contexts/AuthContext";

let mockUser: User | null = null;
let mockIsAuthenticated = false;

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: mockUser,
    isAuthenticated: mockIsAuthenticated,
    logout: vi.fn(),
  }),
}));

const TestRouter: React.FC<{ initialPath: string }> = ({ initialPath }) => (
  <MemoryRouter initialEntries={[initialPath]}>
    <Routes>
      <Route path="/" element={<div>Landing Page</div>} />
      <Route path="/login" element={<div>Login Page</div>} />
      <Route path="/citizen" element={<div>Citizen Dashboard</div>} />
      <Route path="/department" element={<div>Department Dashboard</div>} />
      <Route
        path="/admin"
        element={
          <ProtectedRoute roles={["admin"]}>
            <div>Admin Dashboard Protected</div>
          </ProtectedRoute>
        }
      />
      <Route
        path="/citizen/complaints/:id"
        element={
          <ProtectedRoute roles={["citizen", "admin"]}>
            <div>Citizen Complaint Detail Protected</div>
          </ProtectedRoute>
        }
      />
      <Route
        path="/department/complaints/:id"
        element={
          <ProtectedRoute roles={["authority"]}>
            <div>Department Complaint Detail Protected</div>
          </ProtectedRoute>
        }
      />
    </Routes>
  </MemoryRouter>
);

describe("Route Protection & Role-Based Navigation (Phase 6C)", () => {
  beforeEach(() => {
    mockUser = null;
    mockIsAuthenticated = false;
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("Unauthenticated direct navigation to Admin route redirects to /login", () => {
    mockUser = null;
    mockIsAuthenticated = false;

    render(<TestRouter initialPath="/admin" />);

    expect(screen.queryByText("Admin Dashboard Protected")).not.toBeInTheDocument();
    expect(screen.getByText("Login Page")).toBeInTheDocument();
  });

  it("Citizen attempting to open Admin route is redirected to /citizen", () => {
    mockUser = {
      id: "cit-1",
      name: "Citizen Priya",
      email: "citizen@govai.gov",
      role: "citizen",
      status: "active",
    };
    mockIsAuthenticated = true;

    render(<TestRouter initialPath="/admin" />);

    expect(screen.queryByText("Admin Dashboard Protected")).not.toBeInTheDocument();
    expect(screen.getByText("Citizen Dashboard")).toBeInTheDocument();
  });

  it("Officer attempting to open citizen-specific complaint detail is redirected to /department", () => {
    mockUser = {
      id: "off-1",
      name: "Officer Priya",
      email: "road.officer@govai.gov",
      role: "authority",
      department: "Road & Infrastructure",
      departmentRole: "officer",
      status: "active",
      isOfficer: true,
    };
    mockIsAuthenticated = true;

    render(<TestRouter initialPath="/citizen/complaints/123" />);

    expect(screen.queryByText("Citizen Complaint Detail Protected")).not.toBeInTheDocument();
    expect(screen.getByText("Department Dashboard")).toBeInTheDocument();
  });

  it("Department Authority attempting to open citizen-specific complaint detail is redirected to /department", () => {
    mockUser = {
      id: "auth-1",
      name: "Supervisor Sharma",
      email: "water.auth@govai.gov",
      role: "authority",
      department: "Water Supply",
      departmentRole: "authority",
      status: "active",
      isOfficer: false,
    };
    mockIsAuthenticated = true;

    render(<TestRouter initialPath="/citizen/complaints/456" />);

    expect(screen.queryByText("Citizen Complaint Detail Protected")).not.toBeInTheDocument();
    expect(screen.getByText("Department Dashboard")).toBeInTheDocument();
  });

  it("Valid Admin retains access to Admin route", () => {
    mockUser = {
      id: "adm-1",
      name: "Admin User",
      email: "admin@govai.gov",
      role: "admin",
      status: "active",
    };
    mockIsAuthenticated = true;

    render(<TestRouter initialPath="/admin" />);

    expect(screen.getByText("Admin Dashboard Protected")).toBeInTheDocument();
  });

  it("Valid Citizen retains access to citizen-specific complaint detail route", () => {
    mockUser = {
      id: "cit-1",
      name: "Citizen John",
      email: "john@govai.gov",
      role: "citizen",
      status: "active",
    };
    mockIsAuthenticated = true;

    render(<TestRouter initialPath="/citizen/complaints/789" />);

    expect(screen.getByText("Citizen Complaint Detail Protected")).toBeInTheDocument();
  });

  it("Valid Admin retains access to citizen complaint detail route for inspection", () => {
    mockUser = {
      id: "adm-1",
      name: "Admin User",
      email: "admin@govai.gov",
      role: "admin",
      status: "active",
    };
    mockIsAuthenticated = true;

    render(<TestRouter initialPath="/citizen/complaints/789" />);

    expect(screen.getByText("Citizen Complaint Detail Protected")).toBeInTheDocument();
  });
});

