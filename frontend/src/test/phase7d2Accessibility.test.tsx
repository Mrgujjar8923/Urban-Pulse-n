import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import AuthPage from "@/pages/auth/AuthPage";
import FeedbackForm from "@/pages/citizen/FeedbackForm";
import Chatbot from "@/components/shared/Chatbot";
import { NotificationDropdown } from "@/components/shared/NotificationDropdown";
import { ToastProvider, Toast, ToastClose, ToastViewport } from "@/components/ui/toast";
import { ResolveComplaintDialog } from "@/components/shared/ResolveComplaintDialog";
import RaiseComplaint from "@/pages/citizen/RaiseComplaint";
import UserManagement from "@/pages/admin/UserManagement";
import AdminComplaints from "@/pages/admin/AdminComplaints";

// Mock ResizeObserver for Radix Slider
if (typeof global.ResizeObserver === "undefined") {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// Mock auth context
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

// Mock notifications context
vi.mock("@/contexts/NotificationContext", () => ({
  useNotifications: () => ({
    notifications: [
      {
        id: "n1",
        title: "Test Notification",
        message: "Details",
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
    totalUnread: 1,
  }),
  NOTIFICATION_ICON_MAP: {
    activity: () => <span data-testid="activity-icon" />,
  },
}));

// Mock feedback API
vi.mock("@/services/feedbackApi", () => ({
  feedbackApi: {
    getByComplaintId: vi.fn().mockResolvedValue({ feedback: null }),
    submit: vi.fn().mockResolvedValue({ success: true }),
  },
}));

// Mock complaints API
vi.mock("@/services/complaintsApi", () => ({
  complaintsApi: {
    getById: vi.fn().mockResolvedValue({
      id: "comp-123",
      reference: "GOV-2026-0001",
      title: "Broken Streetlight",
      category: "Electricity",
      status: "Resolved",
      createdAt: new Date().toISOString(),
      sla: { remainingMs: 3600000, isOverdue: false, slaStatus: "Resolved" },
    }),
    create: vi.fn().mockResolvedValue({
      id: "comp-new",
      reference: "GOV-2026-0002",
    }),
    listAll: vi.fn().mockResolvedValue([
      {
        id: "comp-1",
        reference: "GOV-2026-0001",
        title: "Pothole in Main St",
        category: "Roads",
        status: "Pending",
        priority: "High",
        createdAt: new Date().toISOString(),
        sla: { remainingMs: 3600000, isOverdue: false, slaStatus: "On Track" },
      },
    ]),
  },
}));

// Mock admin API
vi.mock("@/services/adminApi", () => ({
  adminApi: {
    listUsers: vi.fn().mockResolvedValue([
      {
        id: "usr-1",
        name: "Test Officer",
        email: "officer@govai.gov",
        role: "department",
        departmentRole: "officer",
        status: "active",
        department: "Water Supply",
        memberLinked: true,
        memberName: "Rajesh Kumar",
        complaintsCount: 5,
        createdAt: new Date().toISOString(),
      },
    ]),
  },
}));

// Mock runtimeData
vi.mock("@/services/runtimeData", () => ({
  getNotifications: vi.fn().mockReturnValue([]),
}));

// Mock assistant API
vi.mock("@/services/assistantApi", () => ({
  assistantApi: {
    chat: vi.fn().mockResolvedValue({ reply: "Mock response" }),
  },
}));

describe("Phase 7D.2 Accessibility Implementation Verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. File Upload Keyboard Accessibility", () => {
    it("RaiseComplaint has keyboard-accessible dropzone with button role and focus ring", () => {
      render(
        <MemoryRouter>
          <RaiseComplaint />
        </MemoryRouter>
      );

      const dropzone = screen.getByRole("button", { name: /upload photo evidence/i });
      expect(dropzone).toBeDefined();
      expect(dropzone.getAttribute("tabindex")).toBe("0");

      const fileInput = document.getElementById("evidence-file-input") as HTMLInputElement;
      expect(fileInput).toBeDefined();

      const clickSpy = vi.spyOn(fileInput, "click");
      fireEvent.keyDown(dropzone, { key: "Enter" });
      expect(clickSpy).toHaveBeenCalled();

      fireEvent.keyDown(dropzone, { key: " " });
      expect(clickSpy).toHaveBeenCalledTimes(2);
    });

    it("ResolveComplaintDialog has accessible dropzone and associated label", () => {
      render(
        <ResolveComplaintDialog
          open={true}
          onOpenChange={vi.fn()}
          complaintId="comp-1"
          complaintReference="GOV-2026-0001"
          onResolved={vi.fn()}
        />
      );

      const label = screen.getByText(/work resolution proof/i);
      expect(label.getAttribute("for")).toBe("resolution-evidence-file");

      const dropzone = screen.getByRole("button", { name: /attach resolution photo proof/i });
      expect(dropzone).toBeDefined();
      expect(dropzone.getAttribute("tabindex")).toBe("0");

      const fileInput = document.getElementById("resolution-evidence-file") as HTMLInputElement;
      expect(fileInput).toBeDefined();

      const clickSpy = vi.spyOn(fileInput, "click");
      fireEvent.keyDown(dropzone, { key: "Enter" });
      expect(clickSpy).toHaveBeenCalled();
    });
  });

  describe("2. Password Visibility Accessibility", () => {
    it("AuthPage renders semantic toggle buttons with aria-label and aria-pressed", () => {
      render(
        <MemoryRouter>
          <AuthPage />
        </MemoryRouter>
      );

      const toggleButton = screen.getByRole("button", { name: /show password/i });
      expect(toggleButton).toBeDefined();
      expect(toggleButton.getAttribute("type")).toBe("button");
      expect(toggleButton.getAttribute("aria-pressed")).toBe("false");

      fireEvent.click(toggleButton);

      const hideButton = screen.getByRole("button", { name: /hide password/i });
      expect(hideButton).toBeDefined();
      expect(hideButton.getAttribute("aria-pressed")).toBe("true");
    });
  });

  describe("3. Feedback Controls Accessibility", () => {
    it("FeedbackForm renders star rating in radiogroup with radio items and Yes/No with aria-pressed", async () => {
      render(
        <MemoryRouter initialEntries={["/citizen/feedback/comp-123"]}>
          <Routes>
            <Route path="/citizen/feedback/:id" element={<FeedbackForm />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText("Was the work completed?")).toBeDefined();
      });

      // Radiogroup for stars
      const radiogroup = screen.getByRole("radiogroup");
      expect(radiogroup).toBeDefined();

      const stars = screen.getAllByRole("radio");
      expect(stars).toHaveLength(5);
      expect(stars[0].getAttribute("aria-label")).toBe("1 of 5 stars");
      expect(stars[4].getAttribute("aria-label")).toBe("5 of 5 stars");

      // Click 4th star
      fireEvent.click(stars[3]);
      expect(stars[3].getAttribute("aria-checked")).toBe("true");

      // Yes / No toggle buttons
      const yesButton = screen.getByRole("button", { name: /^Yes$/i });
      const noButton = screen.getByRole("button", { name: /^No$/i });
      expect(yesButton.getAttribute("aria-pressed")).toBe("false");
      expect(noButton.getAttribute("aria-pressed")).toBe("false");

      fireEvent.click(yesButton);
      expect(yesButton.getAttribute("aria-pressed")).toBe("true");
      expect(noButton.getAttribute("aria-pressed")).toBe("false");

      // Slider has accessible label
      const slider = screen.getByRole("slider");
      expect(slider.getAttribute("aria-label")).toBe("Percentage of work completed");
    });
  });

  describe("4. Notification and Toast Accessibility", () => {
    it("NotificationDropdown bell button has accessible label indicating unread count", () => {
      render(
        <MemoryRouter>
          <NotificationDropdown />
        </MemoryRouter>
      );

      const bellButton = screen.getByRole("button", { name: /notifications, 1 unread/i });
      expect(bellButton).toBeDefined();
    });

    it("ToastClose component renders sr-only Close text for screen readers", () => {
      render(
        <ToastProvider>
          <Toast open={true}>
            <span>Notification Message</span>
            <ToastClose />
          </Toast>
          <ToastViewport />
        </ToastProvider>
      );

      const closeButton = screen.getByRole("button", { name: /close/i });
      expect(closeButton).toBeDefined();
    });
  });

  describe("5. Chatbot Accessibility", () => {
    it("Chatbot provides accessible labels for message input and send button", () => {
      render(<Chatbot />);

      // Open chatbot
      const openBtn = screen.getByRole("button", { name: /open ai assistant/i });
      fireEvent.click(openBtn);

      const input = screen.getByRole("textbox", { name: /chatbot message input/i });
      expect(input).toBeDefined();

      const sendBtn = screen.getByRole("button", { name: /send message/i });
      expect(sendBtn).toBeDefined();
    });
  });

  describe("6. Admin Table and Dialog Accessibility", () => {
    it("UserManagement table provides accessible Action button and accessible details Dialog", async () => {
      render(
        <MemoryRouter>
          <UserManagement />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText("Test Officer")).toBeDefined();
      });

      // Both the table row and the inner action button have accessible name
      const actionButtons = screen.getAllByRole("button", { name: /view details for test officer/i });
      expect(actionButtons.length).toBeGreaterThanOrEqual(1);

      // Open dialog via action button
      fireEvent.click(actionButtons[actionButtons.length - 1]);

      await waitFor(() => {
        const dialog = screen.getByRole("dialog");
        expect(dialog).toBeDefined();
        expect(dialog.getAttribute("data-state")).toBe("open");
      });
    });

    it("AdminComplaints table provides accessible Inspect button and accessible dossier Dialog", async () => {
      render(
        <MemoryRouter>
          <AdminComplaints />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText("Pothole in Main St")).toBeDefined();
      });

      // Both the table row and the inner inspect button have accessible name
      const inspectButtons = screen.getAllByRole("button", { name: /inspect complaint gov-2026-0001/i });
      expect(inspectButtons.length).toBeGreaterThanOrEqual(1);

      // Open dialog via inspect button
      fireEvent.click(inspectButtons[inspectButtons.length - 1]);

      await waitFor(() => {
        const dialog = screen.getByRole("dialog");
        expect(dialog).toBeDefined();
        expect(dialog.getAttribute("data-state")).toBe("open");
      });
    });
  });
});
