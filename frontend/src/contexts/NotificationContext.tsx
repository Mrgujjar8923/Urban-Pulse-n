import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { io, type Socket } from "socket.io-client";
import { UserRole, useAuth } from "@/contexts/AuthContext";
import {
  AlertTriangle,
  Brain,
  BellRing,
  Star,
  Activity,
  MessageCircle,
  UserCheck,
  Shield,
  Repeat,
  TrendingUp,
  FileText,
  CheckCircle2,
  Clock3,
} from "lucide-react";
import {
  type ApiNotification,
  getNotifications as fetchNotifications,
  markAsRead as requestMarkAsRead,
  markAllAsRead as requestMarkAllAsRead,
  clearNotifications as requestClearNotifications,
} from "@/services/notificationService";

export const NOTIFICATION_ICON_MAP = {
  alert: AlertTriangle,
  brain: Brain,
  bell: BellRing,
  star: Star,
  activity: Activity,
  message: MessageCircle,
  user: UserCheck,
  shield: Shield,
  repeat: Repeat,
  chart: TrendingUp,
  file: FileText,
  check: CheckCircle2,
  clock: Clock3,
};

export type NotificationIconKey = keyof typeof NOTIFICATION_ICON_MAP;
export type NotificationCategory = "ai" | "complaint" | "feedback" | "system";
export type NotificationTone = "info" | "success" | "warning" | "critical";

const CATEGORY_UI_META: Record<NotificationCategory, {
  tone: NotificationTone;
  icon: NotificationIconKey;
  badge: string;
  fallbackLinks: Partial<Record<UserRole, string>>;
}> = {
  ai: {
    tone: "warning",
    icon: "brain",
    badge: "AI Alert",
    fallbackLinks: {
      citizen: "/citizen/complaints",
      authority: "/department",
      admin: "/admin/ai-insights",
    },
  },
  complaint: {
    tone: "info",
    icon: "file",
    badge: "Complaint",
    fallbackLinks: {
      citizen: "/citizen/complaints",
      authority: "/department/assigned",
      admin: "/admin",
    },
  },
  feedback: {
    tone: "success",
    icon: "star",
    badge: "Feedback",
    fallbackLinks: {
      citizen: "/citizen/complaints",
      authority: "/department/feedback",
      admin: "/admin",
    },
  },
  system: {
    tone: "info",
    icon: "shield",
    badge: "System",
    fallbackLinks: {
      citizen: "/citizen/profile",
      authority: "/department/profile",
      admin: "/admin",
    },
  },
};

export interface NotificationItem {
  id: string;
  userId?: string;
  complaintId?: string;
  role: UserRole;
  title: string;
  message: string;
  type: NotificationCategory;
  tone: NotificationTone;
  icon: NotificationIconKey;
  read: boolean;
  createdAt: string;
  link: string;
  meta?: string;
}

interface NotificationContextValue {
  notifications: NotificationItem[];
  unreadCount: number;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  loadMoreNotifications: () => Promise<void>;
  markAsRead: (id: string) => void;
  markAsUnread: (id: string) => void;
  markAllAsRead: () => void;
  clearAll: () => void;
  addNotification: (notification: NotificationItem) => void;
  getByCategory: (category: NotificationCategory | "all") => NotificationItem[];
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

const resolveSocketBaseUrl = () => {
  const raw = (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || "").trim();
  const clean = raw.replace(/\/+$/, "").replace(/\/api$/, "");
  if (clean) return clean;
  if (typeof window !== "undefined" && window.location.origin) {
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
      return "http://localhost:5000";
    }
    return window.location.origin;
  }
  return "http://localhost:5000";
};

const API_BASE_URL = resolveSocketBaseUrl();

const getNotificationMeta = (item: ApiNotification) => (
  item.meta && typeof item.meta === "object" ? item.meta : {}
);

export const resolveNotificationLink = (
  item: ApiNotification,
  user: NonNullable<ReturnType<typeof useAuth>["user"]>
): string => {
  const meta = getNotificationMeta(item);
  const complaintId = typeof meta.complaintId === "string" && meta.complaintId.trim()
    ? meta.complaintId.trim()
    : null;

  if (complaintId) {
    if (user.role === "authority") {
      return `/department/complaints/${complaintId}`;
    }
    return `/citizen/complaints/${complaintId}`;
  }

  if (typeof meta.redirectUrl === "string" && meta.redirectUrl.startsWith("/")) {
    return meta.redirectUrl;
  }

  const rawType = meta.type;
  const type: NotificationCategory = rawType === "sla_overdue"
    || (typeof rawType === "string" && rawType.startsWith("complaint_"))
    ? "complaint"
    : rawType === "ai" || rawType === "complaint" || rawType === "feedback" || rawType === "system"
      ? rawType
      : "system";

  const isOfficer = user.role === "authority" && Boolean(user.isOfficer || user.departmentRole === "officer");

  switch (user.role) {
    case "citizen":
      switch (type) {
        case "ai":
        case "complaint":
        case "feedback":
          return "/citizen/complaints";
        case "system":
        default:
          return "/citizen/profile";
      }

    case "authority":
      if (isOfficer) {
        switch (type) {
          case "complaint":
            return "/department/my-assigned";
          case "ai":
          case "feedback":
          case "system":
          default:
            return "/department";
        }
      } else {
        // Department Authority
        switch (type) {
          case "complaint":
            return "/department/assigned";
          case "feedback":
            return "/department/feedback";
          case "ai":
            return "/department";
          case "system":
          default:
            return "/department/profile";
        }
      }

    case "admin":
      switch (type) {
        case "ai":
          return "/admin/ai-insights";
        case "complaint":
        case "feedback":
        case "system":
        default:
          return "/admin";
      }

    default:
      return "/";
  }
};

export const hydrateNotification = (item: ApiNotification, user: NonNullable<ReturnType<typeof useAuth>["user"]>): NotificationItem => {
  const meta = getNotificationMeta(item);
  const rawType = meta.type;
  const type: NotificationCategory = rawType === "sla_overdue"
    || (typeof rawType === "string" && rawType.startsWith("complaint_"))
    ? "complaint"
    : rawType === "ai" || rawType === "complaint" || rawType === "feedback" || rawType === "system"
      ? rawType
      : "system";
  const uiMeta = CATEGORY_UI_META[type];
  const complaintId = typeof meta.complaintId === "string" && meta.complaintId.trim()
    ? meta.complaintId.trim()
    : undefined;
  const link = resolveNotificationLink(item, user);

  return {
    id: item._id,
    userId: item.userId,
    complaintId,
    role: user.role,
    title: rawType === "sla_overdue"
      ? "SLA Overdue"
      : typeof meta.title === "string" ? meta.title : "Notification",
    message: item.message,
    type,
    tone: uiMeta.tone,
    icon: uiMeta.icon,
    read: item.read,
    createdAt: item.createdAt,
    link,
    meta: typeof meta.department === "string" ? meta.department : uiMeta.badge,
  };
};

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const socketRef = useRef<Socket | null>(null);
  const isInitialConnectRef = useRef(true);

  const fetchAndHydrate = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      setHasMore(false);
      setPage(1);
      return;
    }
    setLoading(true);
    try {
      const res = await fetchNotifications(user, { page: 1, limit: 20 });
      if (res && "data" in res && Array.isArray(res.data)) {
        setNotifications(res.data.map((item) => hydrateNotification(item, user)));
        setHasMore(res.pagination.hasNextPage);
        setPage(1);
      } else if (Array.isArray(res)) {
        setNotifications(res.map((item) => hydrateNotification(item, user)));
        setHasMore(false);
        setPage(1);
      }
    } catch (error) {
      console.error("Failed to load notifications", error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const loadMoreNotifications = useCallback(async () => {
    if (!user || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const res = await fetchNotifications(user, { page: nextPage, limit: 20 });
      if (res && "data" in res && Array.isArray(res.data)) {
        const newItems = res.data.map((item) => hydrateNotification(item, user));
        setNotifications((prev) => {
          const existingIds = new Set(prev.map((n) => n.id));
          const deduped = newItems.filter((n) => !existingIds.has(n.id));
          return [...prev, ...deduped];
        });
        setPage(nextPage);
        setHasMore(res.pagination.hasNextPage);
      } else {
        setHasMore(false);
      }
    } catch (err) {
      console.error("Failed to load older notifications", err);
    } finally {
      setLoadingMore(false);
    }
  }, [user, loadingMore, hasMore, page]);

  useEffect(() => {
    fetchAndHydrate();
  }, [fetchAndHydrate]);

  useEffect(() => {
    if (!user) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      isInitialConnectRef.current = true;
      return;
    }

    if (!socketRef.current) {
      socketRef.current = io(API_BASE_URL, {
        transports: ["websocket", "polling"],
        auth: { token: localStorage.getItem("govai_token") },
        autoConnect: true,
      });
    }

    const socket = socketRef.current;

    const handleConnect = () => {
      if (isInitialConnectRef.current) {
        isInitialConnectRef.current = false;
        return;
      }
      // Reconnected after disruption: fetch and synchronize missed notifications
      fetchAndHydrate();
    };

    socket.on("connect", handleConnect);
    socket.on("connect_error", (error) => {
      console.warn("Real-time notifications unavailable", error.message);
    });
    socket.on("disconnect", (reason) => {
      if (reason !== "io client disconnect") {
        console.warn("Real-time notifications disconnected", reason);
      }
    });

    const handleIncoming = (payload: ApiNotification) => {
      if (payload.userId && payload.userId !== user.id) return;
      setNotifications((prev) => {
        if (prev.some((item) => item.id === payload._id)) return prev;
        return [hydrateNotification(payload, user), ...prev];
      });
    };

    const handleNotificationRead = (payload: { id: string; read?: boolean }) => {
      if (!payload?.id) return;
      setNotifications((prev) =>
        prev.map((item) => (item.id === payload.id ? { ...item, read: payload.read !== false } : item))
      );
    };

    const handleNotificationsReadAll = () => {
      setNotifications((prev) => prev.map((item) => ({ ...item, read: true })));
    };

    const handleNotificationsCleared = () => {
      setNotifications([]);
    };

    socket.on("new-notification", handleIncoming);
    socket.on("notification-read", handleNotificationRead);
    socket.on("notifications-read-all", handleNotificationsReadAll);
    socket.on("notifications-cleared", handleNotificationsCleared);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("new-notification", handleIncoming);
      socket.off("notification-read", handleNotificationRead);
      socket.off("notifications-read-all", handleNotificationsReadAll);
      socket.off("notifications-cleared", handleNotificationsCleared);
      socket.off("connect_error");
      socket.off("disconnect");
    };
  }, [user, fetchAndHydrate]);

  useEffect(() => () => {
    socketRef.current?.disconnect();
    socketRef.current = null;
  }, []);

  const updateReadState = useCallback((id: string, read: boolean) => {
    setNotifications((prev) => prev.map((item) => (item.id === id ? { ...item, read } : item)));
  }, []);

  const markAsRead = useCallback((id: string) => {
    if (!user) return;
    updateReadState(id, true);
    requestMarkAsRead(user, id, true).catch((error) => {
      console.error("Failed to mark as read", error);
      updateReadState(id, false);
    });
  }, [updateReadState, user]);

  const markAsUnread = useCallback((id: string) => {
    if (!user) return;
    updateReadState(id, false);
    requestMarkAsRead(user, id, false).catch((error) => {
      console.error("Failed to mark as unread", error);
      updateReadState(id, true);
    });
  }, [updateReadState, user]);

  const markAllAsRead = useCallback(() => {
    if (!user) return;
    setNotifications((prev) => prev.map((item) => ({ ...item, read: true })));
    requestMarkAllAsRead(user).catch((error) => {
      console.error("Failed to mark all as read", error);
      fetchAndHydrate();
    });
  }, [fetchAndHydrate, user]);

  const clearAll = useCallback(() => {
    if (!user) return;
    const previous = notifications;
    setNotifications([]);
    requestClearNotifications(user).catch((error) => {
      console.error("Failed to clear notifications", error);
      setNotifications(previous);
    });
  }, [notifications, user]);

  const addNotification = useCallback((notification: NotificationItem) => {
    setNotifications((prev) => [notification, ...prev]);
  }, []);

  const getByCategory = useCallback((category: NotificationCategory | "all") => {
    if (category === "all") return notifications;
    return notifications.filter((item) => item.type === category);
  }, [notifications]);

  const unreadCount = useMemo(() => notifications.filter((item) => !item.read).length, [notifications]);

  const value = useMemo<NotificationContextValue>(() => ({
    notifications,
    unreadCount,
    loading,
    loadingMore,
    hasMore,
    loadMoreNotifications,
    markAsRead,
    markAsUnread,
    markAllAsRead,
    clearAll,
    addNotification,
    getByCategory,
  }), [notifications, unreadCount, loading, loadingMore, hasMore, loadMoreNotifications, markAsRead, markAsUnread, markAllAsRead, clearAll, addNotification, getByCategory]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationProvider");
  return ctx;
};
