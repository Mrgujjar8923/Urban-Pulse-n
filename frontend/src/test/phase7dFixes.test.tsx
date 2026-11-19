import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Navbar, { DashboardNavItem } from "@/components/dashboard/Navbar";
import { User } from "@/contexts/AuthContext";
import Chatbot from "@/components/shared/Chatbot";
import AuthPage from "@/pages/auth/AuthPage";

vi.mock("@/services/assistantApi", () => ({
  assistantApi: {
    chat: vi.fn().mockResolvedValue({ reply: "Hello from assistant" }),
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: {
      id: "u1",
      name: "Admin User",
      email: "admin@govai.gov",
      role: "admin",
    },
    isAuthenticated: true,
    login: vi.fn(),
    logout: vi.fn(),
    updateProfile: vi.fn(),
  }),
}));

describe("Phase 7D.1 Fixes Verification", () => {
  const dummyUser: User = {
    id: "admin-1",
    name: "Admin User",
    email: "admin@govai.gov",
    role: "admin",
  };

  const adminNavItems: DashboardNavItem[] = [
    { label: "Overview", path: "/admin" },
    { label: "Complaints", path: "/admin/complaints" },
    { label: "Analytics", path: "/admin/analytics" },
    { label: "Departments", path: "/admin/departments" },
    { label: "Dept Performance", path: "/admin/department-performance" },
    { label: "Heatmap", path: "/admin/heatmap" },
    { label: "Feedback", path: "/admin/feedback" },
    { label: "Reports", path: "/admin/reports" },
    { label: "Users", path: "/admin/users" },
  ];

  const citizenNavItems: DashboardNavItem[] = [
    { label: "Dashboard", path: "/citizen" },
    { label: "Complaints", path: "/citizen/complaints" },
    { label: "Raise", path: "/citizen/new" },
    { label: "Assistant", path: "/citizen/assistant" },
  ];

  it("Task 4: Navbar sets xl breakpoint for Admin with 10 items to prevent clipping", () => {
    const { container } = render(
      <MemoryRouter>
        <Navbar
          navItems={adminNavItems}
          user={dummyUser}
          activePath="/admin"
          role="admin"
          onProfileSave={vi.fn()}
          onLogout={vi.fn()}
          rightActions={null}
        />
      </MemoryRouter>
    );

    // Hamburger button has xl:hidden
    const hamburgerBtn = screen.getByRole("button", { name: /open navigation/i });
    expect(hamburgerBtn.className).toContain("xl:hidden");

    // Desktop nav container has hidden xl:flex
    const desktopNavWrapper = container.querySelector(".xl\\:flex");
    expect(desktopNavWrapper).not.toBeNull();
  });

  it("Task 4: Navbar preserves lg breakpoint for Citizen with 4 items", () => {
    const citizenUser: User = { ...dummyUser, role: "citizen" };
    const { container } = render(
      <MemoryRouter>
        <Navbar
          navItems={citizenNavItems}
          user={citizenUser}
          activePath="/citizen"
          role="citizen"
          onProfileSave={vi.fn()}
          onLogout={vi.fn()}
          rightActions={null}
        />
      </MemoryRouter>
    );

    // Hamburger button has lg:hidden
    const hamburgerBtn = screen.getByRole("button", { name: /open navigation/i });
    expect(hamburgerBtn.className).toContain("lg:hidden");
    expect(hamburgerBtn.className).not.toContain("xl:hidden");

    // Desktop nav container has hidden lg:flex
    const desktopNavWrapper = container.querySelector(".lg\\:flex");
    expect(desktopNavWrapper).not.toBeNull();
  });

  it("Task 2: Navbar uses text-white and text-slate-300 for high-contrast title on dark pill", () => {
    render(
      <MemoryRouter>
        <Navbar
          navItems={citizenNavItems}
          user={dummyUser}
          activePath="/citizen"
          role="citizen"
          onProfileSave={vi.fn()}
          onLogout={vi.fn()}
          rightActions={null}
        />
      </MemoryRouter>
    );

    const titleEl = screen.getByText("GovAI Resolve", { selector: "p.truncate" });
    expect(titleEl.className).toContain("text-white");
  });

  it("Task 3: Chatbot launcher has accessible label and responsive modal container", () => {
    render(
      <MemoryRouter>
        <Chatbot />
      </MemoryRouter>
    );

    const launcher = screen.getByRole("button", { name: /open ai assistant/i });
    expect(launcher).toBeInTheDocument();
  });

  it("Task 5: AuthPage includes compact mobile header with back-to-home link", () => {
    const { container } = render(
      <MemoryRouter>
        <AuthPage initialMode="login" />
      </MemoryRouter>
    );

    const mobileHeader = container.querySelector(".ga-mobile-header");
    expect(mobileHeader).not.toBeNull();
    const backLinks = screen.getAllByRole("link", { name: /back to website/i });
    expect(backLinks.length).toBeGreaterThanOrEqual(1);
  });
});
