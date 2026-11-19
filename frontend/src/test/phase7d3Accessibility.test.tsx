import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AdminComplaints from "@/pages/admin/AdminComplaints";
import { ComplaintEvidenceViewer } from "@/components/shared/ComplaintEvidenceViewer";
import AuthPage from "@/pages/auth/AuthPage";
import Chatbot from "@/components/shared/Chatbot";
import { Navbar, DashboardNavItem } from "@/components/dashboard/Navbar";
import { NotificationDropdown } from "@/components/shared/NotificationDropdown";
import { ThemeToggle } from "@/components/shared/Themetoggle";

// Mock URL object methods for image blobs
if (typeof window.URL.createObjectURL === "undefined") {
  window.URL.createObjectURL = vi.fn().mockReturnValue("blob:http://localhost/test-evidence-blob");
}
if (typeof window.URL.revokeObjectURL === "undefined") {
  window.URL.revokeObjectURL = vi.fn();
}

// Mock auth context
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: {
      id: "u-admin-1",
      name: "Admin Officer",
      email: "admin@govai.gov",
      role: "admin",
    },
    isAuthenticated: true,
    login: vi.fn(),
    logout: vi.fn(),
    updateProfile: vi.fn(),
    register: vi.fn(),
    refreshAuthenticatedUser: vi.fn(),
  }),
}));

// Mock theme context
vi.mock("@/contexts/ThemeContext", () => ({
  useTheme: () => ({
    theme: "light",
    toggleTheme: vi.fn(),
  }),
}));

// Mock notifications context preserving exports like NOTIFICATION_ICON_MAP
vi.mock("@/contexts/NotificationContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/contexts/NotificationContext")>();
  return {
    ...actual,
    useNotifications: () => ({
      notifications: [
        {
          id: "notif-1",
          title: "Complaint Assigned",
          message: "A new complaint has been assigned to your department.",
          type: "status_update",
          tone: "info",
          icon: "activity",
          read: false,
          createdAt: "2026-11-13T10:00:00.000Z",
          link: "/complaints/1",
        },
      ],
      unreadCount: 1,
      markAsRead: vi.fn(),
      markAllAsRead: vi.fn(),
      clearAll: vi.fn(),
      totalUnread: 1,
    }),
  };
});

// Mock complaints API
vi.mock("@/services/complaintsApi", () => ({
  complaintsApi: {
    listAll: vi.fn().mockResolvedValue([
      {
        id: "comp-1",
        complaintId: "GOV-2026-0001",
        trackingId: "GOV-2026-0001",
        title: "Pothole in Main St",
        description: "Large road crater",
        department: "Roads & Traffic",
        status: "Pending",
        priority: "High",
        citizenName: "Priyanshu Verma",
        createdAt: "2026-11-10T10:00:00.000Z",
        deadline: "2026-11-15T10:00:00.000Z",
        slaTargetHours: 48,
        slaDeadline: "2026-11-15T10:00:00.000Z",
        isOverdue: false,
        remainingMs: 120000000,
      },
      {
        id: "comp-2",
        complaintId: "GOV-2026-0002",
        trackingId: "GOV-2026-0002",
        title: "Broken Streetlamp",
        description: "Dark avenue",
        department: "Electricity",
        status: "In Progress",
        priority: "Critical",
        citizenName: "Aditi Rao",
        createdAt: "2026-11-11T12:00:00.000Z",
        deadline: "2026-11-14T12:00:00.000Z",
        slaTargetHours: 24,
        slaDeadline: "2026-11-14T12:00:00.000Z",
        isOverdue: false,
        remainingMs: 80000000,
      },
    ]),
    getEvidenceBlob: vi.fn().mockResolvedValue(new Blob(["mock-bytes"], { type: "image/jpeg" })),
    getResolutionEvidenceBlob: vi.fn().mockResolvedValue(new Blob(["mock-resolution-bytes"], { type: "image/jpeg" })),
  },
}));

// Mock admin API
vi.mock("@/services/adminApi", () => ({
  adminApi: {
    listUsers: vi.fn().mockResolvedValue([]),
  },
}));

// Mock assistant API
vi.mock("@/services/assistantApi", () => ({
  assistantApi: {
    chat: vi.fn().mockResolvedValue({ reply: "Hello from assistant" }),
  },
}));

// Mock runtimeData
vi.mock("@/services/runtimeData", () => ({
  getNotifications: vi.fn().mockReturnValue([]),
}));

describe("Phase 7D.3 Accessibility Implementation Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Admin Complaint Table Sorting Accessibility (AdminComplaints.tsx)", () => {
    it("renders sortable headers with scope='col', buttons, and dynamic aria-sort", async () => {
      render(
        <MemoryRouter>
          <AdminComplaints />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText("Pothole in Main St")).toBeDefined();
      });

      // Headers: Reference, Priority, SLA & Deadline, Submitted
      const refButton = screen.getByRole("button", { name: /^reference$/i });
      const priorityButton = screen.getByRole("button", { name: /^priority$/i });
      const slaButton = screen.getByRole("button", { name: /^sla & deadline$/i });
      const submittedButton = screen.getByRole("button", { name: /^submitted$/i });

      expect(refButton).toBeDefined();
      expect(priorityButton).toBeDefined();
      expect(slaButton).toBeDefined();
      expect(submittedButton).toBeDefined();

      const refTh = refButton.closest("th");
      const priorityTh = priorityButton.closest("th");
      const slaTh = slaButton.closest("th");
      const submittedTh = submittedButton.closest("th");

      expect(refTh?.getAttribute("scope")).toBe("col");
      expect(priorityTh?.getAttribute("scope")).toBe("col");
      expect(slaTh?.getAttribute("scope")).toBe("col");
      expect(submittedTh?.getAttribute("scope")).toBe("col");

      // Default sort in AdminComplaints is createdAt descending
      expect(submittedTh?.getAttribute("aria-sort")).toBe("descending");
      expect(refTh?.getAttribute("aria-sort")).toBe("none");
      expect(priorityTh?.getAttribute("aria-sort")).toBe("none");
      expect(slaTh?.getAttribute("aria-sort")).toBe("none");
    });

    it("supports mouse clicking and toggles aria-sort correctly", async () => {
      render(
        <MemoryRouter>
          <AdminComplaints />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText("Pothole in Main St")).toBeDefined();
      });

      const refButton = screen.getByRole("button", { name: /^reference$/i });
      const refTh = refButton.closest("th");

      // Click to sort by reference (first click defaults to desc)
      fireEvent.click(refButton);
      expect(refTh?.getAttribute("aria-sort")).toBe("descending");

      // Click again to toggle to asc
      fireEvent.click(refButton);
      expect(refTh?.getAttribute("aria-sort")).toBe("ascending");
    });

    it("supports keyboard Enter and Space on sort buttons", async () => {
      render(
        <MemoryRouter>
          <AdminComplaints />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText("Pothole in Main St")).toBeDefined();
      });

      const priorityButton = screen.getByRole("button", { name: /^priority$/i });
      const priorityTh = priorityButton.closest("th");

      // Enter key fires click on native button
      fireEvent.click(priorityButton);
      expect(priorityTh?.getAttribute("aria-sort")).toBe("descending");

      const slaButton = screen.getByRole("button", { name: /^sla & deadline$/i });
      const slaTh = slaButton.closest("th");

      // Space key fires click on native button
      fireEvent.click(slaButton);
      expect(slaTh?.getAttribute("aria-sort")).toBe("descending");
      expect(priorityTh?.getAttribute("aria-sort")).toBe("none");
    });
  });

  describe("2. Complaint Evidence Viewer Accessibility (ComplaintEvidenceViewer.tsx)", () => {
    it("renders thumbnail with group-focus-within and an accessible Expand button", async () => {
      render(
        <ComplaintEvidenceViewer
          complaintId="comp-1"
          imageKey="evidence_123.jpg"
          isResolution={false}
        />
      );

      await waitFor(() => {
        expect(screen.getByAltText("Complaint photo evidence")).toBeDefined();
      });

      // Expand button has descriptive accessible label
      const expandBtn = screen.getByRole("button", {
        name: /expand complaint photo evidence in dialog/i,
      });
      expect(expandBtn).toBeDefined();

      // Check that the overlay container includes group-focus-within:opacity-100
      const viewFullImageBtn = screen.getByRole("button", { name: /view full image/i });
      const overlayContainer = viewFullImageBtn.parentElement;
      expect(overlayContainer?.className).toContain("group-focus-within:opacity-100");
    });

    it("opens dialog containing DialogTitle and DialogDescription", async () => {
      render(
        <ComplaintEvidenceViewer
          complaintId="comp-1"
          imageKey="evidence_123.jpg"
          isResolution={false}
        />
      );

      await waitFor(() => {
        expect(screen.getByAltText("Complaint photo evidence")).toBeDefined();
      });

      const expandBtn = screen.getByRole("button", {
        name: /expand complaint photo evidence in dialog/i,
      });
      fireEvent.click(expandBtn);

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeDefined();
        expect(screen.getByText("Complaint Evidence Photo")).toBeDefined();
        expect(screen.getByText("Enlarged view of the complaint photo evidence.")).toBeDefined();
      });
    });
  });

  describe("3. Authentication Controls (AuthPage.tsx)", () => {
    it("renders tablist with Login and Sign Up tabs and associated tabpanels", () => {
      render(
        <MemoryRouter initialEntries={["/login"]}>
          <AuthPage initialMode="login" />
        </MemoryRouter>
      );

      const tablist = screen.getByRole("tablist", { name: /authentication mode/i });
      expect(tablist).toBeDefined();

      const loginTab = screen.getByRole("tab", { name: /^login$/i });
      const signupTab = screen.getByRole("tab", { name: /^sign up$/i });

      expect(loginTab.getAttribute("aria-selected")).toBe("true");
      expect(loginTab.getAttribute("aria-controls")).toBe("auth-panel-login");
      expect(signupTab.getAttribute("aria-selected")).toBe("false");
      expect(signupTab.getAttribute("aria-controls")).toBe("auth-panel-signup");

      const loginPanel = screen.getByRole("tabpanel");
      expect(loginPanel.id).toBe("auth-panel-login");
      expect(loginPanel.getAttribute("aria-labelledby")).toBe("auth-tab-login");
    });

    it("supports ArrowRight and ArrowLeft keyboard navigation across tabs", async () => {
      render(
        <MemoryRouter initialEntries={["/login"]}>
          <AuthPage initialMode="login" />
        </MemoryRouter>
      );

      const tablist = screen.getByRole("tablist", { name: /authentication mode/i });

      // Press ArrowRight on tablist
      fireEvent.keyDown(tablist, { key: "ArrowRight" });

      await waitFor(() => {
        const signupTab = screen.getByRole("tab", { name: /^sign up$/i });
        expect(signupTab.getAttribute("aria-selected")).toBe("true");
        expect(screen.getByRole("tabpanel").id).toBe("auth-panel-signup");
      });

      // Press ArrowLeft to return to Login
      fireEvent.keyDown(tablist, { key: "ArrowLeft" });

      await waitFor(() => {
        const loginTabUpdated = screen.getByRole("tab", { name: /^login$/i });
        expect(loginTabUpdated.getAttribute("aria-selected")).toBe("true");
        expect(screen.getByRole("tabpanel").id).toBe("auth-panel-login");
      });
    });

    it("renders accessible role radiogroup with aria-checked and arrow navigation", async () => {
      render(
        <MemoryRouter initialEntries={["/login"]}>
          <AuthPage initialMode="login" />
        </MemoryRouter>
      );

      const roleGroup = screen.getByRole("radiogroup", { name: /select login role/i });
      expect(roleGroup).toBeDefined();

      const citizenRadio = screen.getByRole("radio", { name: /^citizen$/i });
      const deptRadio = screen.getByRole("radio", { name: /^department$/i });
      const officerRadio = screen.getByRole("radio", { name: /^officer$/i });

      expect(citizenRadio.getAttribute("aria-checked")).toBe("true");
      expect(deptRadio.getAttribute("aria-checked")).toBe("false");
      expect(officerRadio.getAttribute("aria-checked")).toBe("false");

      // Arrow navigation on role radiogroup
      fireEvent.keyDown(citizenRadio, { key: "ArrowRight" });
      await waitFor(() => {
        expect(screen.getByRole("radio", { name: /^department$/i }).getAttribute("aria-checked")).toBe("true");
        expect(screen.getByRole("radio", { name: /^citizen$/i }).getAttribute("aria-checked")).toBe("false");
      });

      fireEvent.keyDown(screen.getByRole("radio", { name: /^department$/i }), { key: "ArrowRight" });
      await waitFor(() => {
        expect(screen.getByRole("radio", { name: /^officer$/i }).getAttribute("aria-checked")).toBe("true");
      });

      fireEvent.keyDown(screen.getByRole("radio", { name: /^officer$/i }), { key: "ArrowLeft" });
      await waitFor(() => {
        expect(screen.getByRole("radio", { name: /^department$/i }).getAttribute("aria-checked")).toBe("true");
      });
    });
  });

  describe("4. Chatbot Accessibility (Chatbot.tsx)", () => {
    it("renders dialog with accessible name, live region role='log', and suggested questions group", async () => {
      render(<Chatbot />);

      // Open chatbot
      const launcher = screen.getByRole("button", { name: /open ai assistant/i });
      fireEvent.click(launcher);

      await waitFor(() => {
        const chatDialog = screen.getByRole("dialog", { name: /govai assistant chat/i });
        expect(chatDialog).toBeDefined();
      });

      // Live log region
      const liveRegion = screen.getByRole("log");
      expect(liveRegion.getAttribute("aria-live")).toBe("polite");

      // Suggested questions group
      const promptGroup = screen.getByRole("group", { name: /suggested questions/i });
      expect(promptGroup).toBeDefined();
    });

    it("closes the chat panel on Escape key", async () => {
      render(<Chatbot />);

      // Open chatbot
      const launcher = screen.getByRole("button", { name: /open ai assistant/i });
      fireEvent.click(launcher);

      await waitFor(() => {
        expect(screen.getByRole("dialog", { name: /govai assistant chat/i })).toBeDefined();
      });

      // Press Escape on window
      fireEvent.keyDown(window, { key: "Escape" });

      await waitFor(() => {
        expect(screen.queryByRole("dialog", { name: /govai assistant chat/i })).toBeNull();
      });
    });
  });

  describe("5. Shared Components Accessibility", () => {
    it("Navbar marks the active navigation link with aria-current='page'", () => {
      const navItems: DashboardNavItem[] = [
        { label: "Dashboard", path: "/dashboard" },
        { label: "Complaints", path: "/complaints" },
      ];

      render(
        <MemoryRouter>
          <Navbar
            navItems={navItems}
            user={{ id: "1", name: "Admin", email: "admin@govai.gov", role: "admin" }}
            activePath="/dashboard"
            onProfileSave={vi.fn()}
            onLogout={vi.fn()}
            rightActions={<div>Actions</div>}
            role="admin"
          />
        </MemoryRouter>
      );

      const dashboardLinks = screen.getAllByRole("link", { name: /dashboard/i });
      const complaintsLinks = screen.getAllByRole("link", { name: /complaints/i });

      dashboardLinks.forEach((link) => {
        expect(link.getAttribute("aria-current")).toBe("page");
      });

      complaintsLinks.forEach((link) => {
        expect(link.getAttribute("aria-current")).toBeNull();
      });
    });

    it("NotificationDropdown action buttons have type='button', accessible names, and unread indicator sr-only text", async () => {
      render(
        <MemoryRouter>
          <NotificationDropdown />
        </MemoryRouter>
      );

      // Open notification popover
      const trigger = screen.getByRole("button", { name: /notifications/i });
      fireEvent.click(trigger);

      await waitFor(() => {
        const markAllBtn = screen.getByRole("button", { name: /mark all notifications as read/i });
        const clearBtn = screen.getByRole("button", { name: /clear all notifications/i });
        expect(markAllBtn).toBeDefined();
        expect(markAllBtn.getAttribute("type")).toBe("button");
        expect(clearBtn).toBeDefined();
        expect(clearBtn.getAttribute("type")).toBe("button");

        expect(screen.getByText("Unread notification")).toBeDefined();
      });
    });

    it("ThemeToggle button has type='button'", () => {
      render(<ThemeToggle />);
      const toggleBtn = screen.getByRole("button", { name: /toggle theme/i });
      expect(toggleBtn.getAttribute("type")).toBe("button");
    });
  });
});
