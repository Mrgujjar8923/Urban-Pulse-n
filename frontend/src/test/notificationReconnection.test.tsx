import React, { type PropsWithChildren } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { socketMock, ioMock, fetchNotificationsMock } = vi.hoisted(() => {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};

  const socket = {
    on: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
      listeners[event] = listeners[event] || [];
      listeners[event].push(callback);
      return socket;
    }),
    off: vi.fn((event: string, callback?: (...args: unknown[]) => void) => {
      if (!listeners[event]) return socket;
      if (callback) {
        listeners[event] = listeners[event].filter((cb) => cb !== callback);
      } else {
        delete listeners[event];
      }
      return socket;
    }),
    emitEvent: (event: string, ...args: unknown[]) => {
      const cbs = listeners[event] || [];
      for (const cb of cbs) {
        cb(...args);
      }
    },
    disconnect: vi.fn(),
  };

  return {
    socketMock: socket,
    ioMock: vi.fn(() => socket),
    fetchNotificationsMock: vi.fn(),
  };
});

vi.mock("socket.io-client", () => ({
  io: ioMock,
}));

vi.mock("@/services/notificationService", () => ({
  getNotifications: fetchNotificationsMock,
  markAsRead: vi.fn(),
  markAllAsRead: vi.fn(),
  clearNotifications: vi.fn(),
}));

const mockUser = {
  id: "test-user-id",
  name: "Test User",
  email: "test@demo.com",
  role: "citizen" as const,
  status: "active" as const,
};

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: mockUser,
  }),
}));

import { NotificationProvider, useNotifications } from "@/contexts/NotificationContext";

const wrapper = ({ children }: PropsWithChildren) => (
  <NotificationProvider>{children}</NotificationProvider>
);

describe("Notification Socket Reconnection & Recovery (Phase 6E)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchNotificationsMock.mockResolvedValue([
      {
        _id: "notif-1",
        userId: "test-user-id",
        message: "Initial notification",
        read: false,
        createdAt: new Date().toISOString(),
      },
    ]);
  });

  it("prevents duplicate fetch on initial socket connection, and recovers missed notifications on reconnect", async () => {
    const { result } = renderHook(() => useNotifications(), { wrapper });

    await waitFor(() => {
      expect(result.current.notifications.length).toBe(1);
    });

    // Mount has triggered fetchNotifications once
    expect(fetchNotificationsMock).toHaveBeenCalledTimes(1);

    // Initial socket connect event fires
    act(() => {
      socketMock.emitEvent("connect");
    });

    // Must NOT call fetchNotifications a second time on initial connect
    expect(fetchNotificationsMock).toHaveBeenCalledTimes(1);

    // Prepare updated notifications that arrived while disconnected
    fetchNotificationsMock.mockResolvedValueOnce([
      {
        _id: "notif-2",
        userId: "test-user-id",
        message: "Missed notification received while offline",
        read: false,
        createdAt: new Date().toISOString(),
      },
      {
        _id: "notif-1",
        userId: "test-user-id",
        message: "Initial notification",
        read: false,
        createdAt: new Date().toISOString(),
      },
    ]);

    // Simulate socket disconnect followed by reconnect
    act(() => {
      socketMock.emitEvent("disconnect", "transport close");
    });

    act(() => {
      socketMock.emitEvent("connect");
    });

    // Reconnection must fetch and synchronize missed notifications
    await waitFor(() => {
      expect(fetchNotificationsMock).toHaveBeenCalledTimes(2);
      expect(result.current.notifications.length).toBe(2);
      expect(result.current.notifications[0].id).toBe("notif-2");
    });
  });
});

