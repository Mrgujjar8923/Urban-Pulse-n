import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ProfileSettings from "@/components/shared/ProfileSettings";
import HeatmapView from "@/pages/admin/HeatmapView";
import AuthPage from "@/pages/auth/AuthPage";
import { NotificationProvider, useNotifications } from "@/contexts/NotificationContext";
import type { User } from "@/contexts/AuthContext";
import { authApi } from "@/services/authApi";
import { complaintsApi, type ComplaintRecord } from "@/services/complaintsApi";
import * as notificationService from "@/services/notificationService";
import type { ApiNotification, PaginatedNotifications } from "@/services/notificationService";

// Mock hooks and services
const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

const mockUpdateProfileCtx = vi.fn();
let mockCurrentUser: User | null = null;

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: mockCurrentUser,
    updateProfile: mockUpdateProfileCtx,
    login: vi.fn(),
    refreshAuthenticatedUser: vi.fn(),
    logout: vi.fn(),
    register: vi.fn(),
  }),
}));

vi.mock("@/services/authApi", () => ({
  authApi: {
    updateProfile: vi.fn(),
    changePassword: vi.fn(),
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
  },
}));

vi.mock("@/services/complaintsApi", () => ({
  complaintsApi: {
    listAll: vi.fn(),
  },
}));

vi.mock("@/services/notificationService", () => ({
  getNotifications: vi.fn(),
  markAsRead: vi.fn(),
  markAllAsRead: vi.fn(),
  clearNotifications: vi.fn(),
}));

type SocketEventHandler = (...args: unknown[]) => void;
const mockSocketHandlers: Record<string, SocketEventHandler> = {};
const mockSocket = {
  on: vi.fn((event: string, handler: SocketEventHandler) => {
    mockSocketHandlers[event] = handler;
  }),
  off: vi.fn((event: string) => {
    delete mockSocketHandlers[event];
  }),
  disconnect: vi.fn(),
};

vi.mock("socket.io-client", () => ({
  io: vi.fn(() => mockSocket),
}));

describe("Phase 8.4: Profile Settings Reconcile & Phone Persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentUser = {
      id: "u123",
      name: "Ramesh Sharma",
      email: "ramesh@govai.gov",
      role: "citizen",
      phone: "+91 9876543210",
    };
  });

  it("renders name and phone inputs, but NOT address or organization inputs", () => {
    render(<ProfileSettings />);

    expect(screen.getByLabelText(/Full Name/i)).toHaveValue("Ramesh Sharma");
    expect(screen.getByLabelText(/Phone Number/i)).toHaveValue("+91 9876543210");
    expect(screen.queryByLabelText(/Address/i)).toBeNull();
    expect(screen.queryByLabelText(/Organization/i)).toBeNull();
  });

  it("submits updated name and phone to authApi and syncs context", async () => {
    vi.mocked(authApi.updateProfile).mockResolvedValueOnce({
      user: {
        id: "u123",
        name: "Ramesh Kumar Sharma",
        email: "ramesh@govai.gov",
        role: "citizen",
        phone: "+91 9999988888",
      },
    });

    render(<ProfileSettings />);

    const nameInput = screen.getByLabelText(/Full Name/i);
    const phoneInput = screen.getByLabelText(/Phone Number/i);
    const saveButton = screen.getByRole("button", { name: /Save Changes/i });

    fireEvent.change(nameInput, { target: { value: "Ramesh Kumar Sharma" } });
    fireEvent.change(phoneInput, { target: { value: "+91 9999988888" } });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(authApi.updateProfile).toHaveBeenCalledWith({
        name: "Ramesh Kumar Sharma",
        phone: "+91 9999988888",
      });
      expect(mockUpdateProfileCtx).toHaveBeenCalledWith({
        name: "Ramesh Kumar Sharma",
        phone: "+91 9999988888",
      });
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Profile Updated" })
      );
    });
  });

  it("displays department as read-only badge/input for authority users", () => {
    mockCurrentUser = {
      id: "auth-1",
      name: "Water Officer",
      email: "water@govai.gov",
      role: "authority",
      department: "Water Supply",
      phone: "",
    };

    render(<ProfileSettings />);

    const deptInput = screen.getByLabelText(/Assigned Department/i);
    expect(deptInput).toHaveValue("Water Supply");
    expect(deptInput).toBeDisabled();
    expect(screen.getByText(/Department assignments are managed by system administrators/i)).toBeInTheDocument();
  });
});

describe("Phase 8.4: Forgot Password & Reset Password in AuthPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens forgot password dialog and invokes authApi.forgotPassword", async () => {
    vi.mocked(authApi.forgotPassword).mockResolvedValueOnce({
      message: "If an account with that email exists, reset instructions have been sent.",
    });

    render(
      <MemoryRouter initialEntries={["/auth?mode=login"]}>
        <AuthPage initialMode="login" />
      </MemoryRouter>
    );

    const forgotTrigger = screen.getByRole("button", { name: /Forgot password\?/i });
    fireEvent.click(forgotTrigger);

    expect(screen.getByText("Reset Your Password")).toBeInTheDocument();

    const emailInput = screen.getByLabelText(/Registered Email Address/i);
    fireEvent.change(emailInput, { target: { value: "test@example.com" } });

    const submitBtn = screen.getByRole("button", { name: /Send Reset Instructions/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(authApi.forgotPassword).toHaveBeenCalledWith({ email: "test@example.com" });
      expect(screen.getByText("Check your inbox")).toBeInTheDocument();
    });
  });

  it("opens reset password dialog when token param is present and submits new password", async () => {
    vi.mocked(authApi.resetPassword).mockResolvedValueOnce({
      message: "Password reset successful.",
    });

    render(
      <MemoryRouter initialEntries={["/auth?token=abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"]}>
        <AuthPage initialMode="login" />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Set New Password")).toBeInTheDocument();
    });

    const newPwInput = screen.getByLabelText(/^New Password/i);
    const confirmPwInput = screen.getByLabelText(/Confirm New Password/i);

    fireEvent.change(newPwInput, { target: { value: "newSecurePass123" } });
    fireEvent.change(confirmPwInput, { target: { value: "newSecurePass123" } });

    const updateBtn = screen.getByRole("button", { name: /Update Password/i });
    fireEvent.click(updateBtn);

    await waitFor(() => {
      expect(authApi.resetPassword).toHaveBeenCalledWith({
        token: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
        password: "newSecurePass123",
      });
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Password Reset Successful" })
      );
    });
  });
});

describe("Phase 8.4: Geographic Admin Heatmap & Privacy Masking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders coordinate-mapped complaints into clusters and supports popover detail inspection", async () => {
    const mockComplaints: ComplaintRecord[] = [
      {
        _id: "c-101",
        title: "Major Pothole on MG Road",
        category: "Road & Infrastructure",
        status: "Pending",
        priority: "High",
        location: "MG Road, Bengaluru",
        latitude: 12.9716,
        longitude: 77.5946,
        createdAt: new Date().toISOString(),
      },
      {
        _id: "c-102",
        title: "Streetlight malfunction",
        category: "Electricity",
        status: "In Progress",
        priority: "Medium",
        location: "MG Road, Bengaluru",
        latitude: 12.9717,
        longitude: 77.5947,
        createdAt: new Date().toISOString(),
      },
      {
        _id: "c-103",
        title: "Unmapped water leakage",
        category: "Water Supply",
        status: "Resolved",
        location: "Whitefield Inner Circle",
        latitude: null,
        longitude: null,
        createdAt: new Date().toISOString(),
      },
    ];

    vi.mocked(complaintsApi.listAll).mockResolvedValueOnce(mockComplaints);

    render(<HeatmapView />);

    await waitFor(() => {
      expect(screen.getByText("Complaint Geographic Heatmap")).toBeInTheDocument();
      expect(screen.getAllByText("2").length).toBeGreaterThan(0);
    });

    // Verify metric cards
    expect(screen.getByText(/GPS Mapped Complaints/i)).toBeInTheDocument();
    expect(screen.getByText(/Unmapped \/ Missing GPS/i)).toBeInTheDocument();

    // Verify text ranking contains the unmapped complaint location
    expect(screen.getByText("Whitefield Inner Circle")).toBeInTheDocument();

    // Verify SVG projection rendered with cluster label "2"
    const clusterLabel = screen.getByText("2", { selector: "text" });
    expect(clusterLabel).toBeInTheDocument();

    // Click cluster to open detail drawer
    fireEvent.click(clusterLabel);

    await waitFor(() => {
      expect(screen.getByText(/Cluster: 2 Incidents/i)).toBeInTheDocument();
      expect(screen.getByText("Major Pothole on MG Road")).toBeInTheDocument();
      expect(screen.getByText("Streetlight malfunction")).toBeInTheDocument();
      // Ensure citizen privacy protection alert is shown
      expect(screen.getByText(/Citizen personal identity details are protected/i)).toBeInTheDocument();
    });
  });

  it("gracefully displays empty coordinate state when no complaints have coordinates", async () => {
    const mockComplaints: ComplaintRecord[] = [
      {
        _id: "c-201",
        title: "Garbage pile",
        category: "Environment",
        status: "Pending",
        location: "Sector 4 Park",
        latitude: null,
        longitude: null,
        createdAt: new Date().toISOString(),
      },
    ];

    vi.mocked(complaintsApi.listAll).mockResolvedValueOnce(mockComplaints);

    render(<HeatmapView />);

    await waitFor(() => {
      expect(screen.getByText("No GPS Coordinates Plotted")).toBeInTheDocument();
      expect(screen.getByText("Sector 4 Park")).toBeInTheDocument();
    });
  });
});

describe("Phase 8.4: Notification Pagination & Cross-Tab Socket Synchronization", () => {
  const NotificationTestHarness: React.FC = () => {
    const { notifications, unreadCount, hasMore, loadMoreNotifications } = useNotifications();

    return (
      <div>
        <span data-testid="total-count">{notifications.length}</span>
        <span data-testid="unread-count">{unreadCount}</span>
        <span data-testid="has-more">{hasMore ? "yes" : "no"}</span>
        <button onClick={() => { void loadMoreNotifications(); }} data-testid="load-more-btn">
          Load More
        </button>
        <ul>
          {notifications.map((n) => (
            <li key={n.id} data-testid={`notif-${n.id}`}>
              {n.title}: {n.read ? "read" : "unread"}
            </li>
          ))}
        </ul>
      </div>
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentUser = {
      id: "u-citizen-1",
      name: "Pooja Mehta",
      email: "pooja@govai.gov",
      role: "citizen",
    };
  });

  it("loads initial page with paginated metadata and appends older notifications on loadMore", async () => {
    const page1Response: PaginatedNotifications = {
      data: [
        {
          _id: "n-1",
          userId: "u-citizen-1",
          message: "Complaint #123 assigned to Road Dept",
          read: false,
          createdAt: new Date().toISOString(),
        },
      ],
      pagination: {
        page: 1,
        limit: 20,
        total: 2,
        totalPages: 2,
        hasNextPage: true,
        hasPrevPage: false,
      },
    };
    vi.mocked(notificationService.getNotifications).mockResolvedValueOnce(page1Response);

    render(
      <NotificationProvider>
        <NotificationTestHarness />
      </NotificationProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("total-count")).toHaveTextContent("1");
      expect(screen.getByTestId("unread-count")).toHaveTextContent("1");
      expect(screen.getByTestId("has-more")).toHaveTextContent("yes");
    });

    const page2Response: PaginatedNotifications = {
      data: [
        {
          _id: "n-2",
          userId: "u-citizen-1",
          message: "Complaint #120 resolved",
          read: true,
          createdAt: new Date(Date.now() - 86400000).toISOString(),
        },
      ],
      pagination: {
        page: 2,
        limit: 20,
        total: 2,
        totalPages: 2,
        hasNextPage: false,
        hasPrevPage: true,
      },
    };
    vi.mocked(notificationService.getNotifications).mockResolvedValueOnce(page2Response);

    const loadMoreBtn = screen.getByTestId("load-more-btn");
    fireEvent.click(loadMoreBtn);

    await waitFor(() => {
      expect(screen.getByTestId("total-count")).toHaveTextContent("2");
      expect(screen.getByTestId("has-more")).toHaveTextContent("no");
      expect(screen.getByTestId("notif-n-2")).toBeInTheDocument();
    });
  });

  it("synchronizes read, read-all, and clear events from other tabs via socket", async () => {
    const syncNotifications: ApiNotification[] = [
      {
        _id: "n-10",
        userId: "u-citizen-1",
        message: "Status changed to In Progress",
        read: false,
        createdAt: new Date().toISOString(),
      },
      {
        _id: "n-20",
        userId: "u-citizen-1",
        message: "Officer assigned",
        read: false,
        createdAt: new Date().toISOString(),
      },
    ];
    vi.mocked(notificationService.getNotifications).mockResolvedValueOnce(syncNotifications);

    render(
      <NotificationProvider>
        <NotificationTestHarness />
      </NotificationProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("total-count")).toHaveTextContent("2");
      expect(screen.getByTestId("unread-count")).toHaveTextContent("2");
    });

    // 1. Cross-tab mark single notification as read
    act(() => {
      mockSocketHandlers["notification-read"]?.({ id: "n-10", read: true });
    });

    await waitFor(() => {
      expect(screen.getByTestId("notif-n-10")).toHaveTextContent("read");
      expect(screen.getByTestId("unread-count")).toHaveTextContent("1");
    });

    // 2. Cross-tab mark all notifications as read
    act(() => {
      mockSocketHandlers["notifications-read-all"]?.();
    });

    await waitFor(() => {
      expect(screen.getByTestId("unread-count")).toHaveTextContent("0");
      expect(screen.getByTestId("notif-n-20")).toHaveTextContent("read");
    });

    // 3. Cross-tab clear all notifications
    act(() => {
      mockSocketHandlers["notifications-cleared"]?.();
    });

    await waitFor(() => {
      expect(screen.getByTestId("total-count")).toHaveTextContent("0");
    });
  });
});
