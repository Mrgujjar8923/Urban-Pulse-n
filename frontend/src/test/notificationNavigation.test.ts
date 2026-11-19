import { describe, it, expect } from "vitest";
import { hydrateNotification, resolveNotificationLink } from "@/contexts/NotificationContext";
import type { ApiNotification } from "@/services/notificationService";
import type { User } from "@/contexts/AuthContext";

describe("Notification Navigation and Role-Based Link Resolution (Phase 4A)", () => {
  const authorityUser: User = {
    id: "user-authority-1",
    name: "Authority Verma",
    email: "authority@demo.com",
    role: "authority",
    departmentRole: "authority",
    department: "Road & Infrastructure",
    status: "active",
  };

  const officerUser: User = {
    id: "user-officer-1",
    name: "Officer Priya",
    email: "road.demo@govai.gov",
    role: "authority",
    departmentRole: "officer",
    isOfficer: true,
    department: "Road & Infrastructure",
    status: "active",
  };

  const citizenUser: User = {
    id: "user-citizen-1",
    name: "Citizen Pooja",
    email: "pooja@govai.gov",
    role: "citizen",
    status: "active",
  };

  const adminUser: User = {
    id: "user-admin-1",
    name: "Admin User",
    email: "admin@govai.gov",
    role: "admin",
    status: "active",
  };

  const complaintNotification: ApiNotification = {
    _id: "notif-1",
    userId: "user-authority-1",
    message: "You have been assigned complaint \"Burst water main\".",
    read: false,
    createdAt: new Date().toISOString(),
    meta: {
      complaintId: "650123456789abcdef012345",
      type: "complaint_assigned",
      title: "New complaint assigned",
      department: "Road & Infrastructure",
    },
  };

  it("navigates authority and officer directly to department complaint-detail experience", () => {
    const hydratedAuth = hydrateNotification(complaintNotification, authorityUser);
    expect(hydratedAuth.link).toBe("/department/complaints/650123456789abcdef012345");
    expect(hydratedAuth.link).not.toContain("/citizen/");
    expect(hydratedAuth.role).toBe("authority");
    expect(hydratedAuth.complaintId).toBe("650123456789abcdef012345");

    const hydratedOfficer = hydrateNotification(complaintNotification, officerUser);
    expect(hydratedOfficer.link).toBe("/department/complaints/650123456789abcdef012345");
  });

  it("never navigates officers to citizen complaint-detail pages", () => {
    const reassignedNotification: ApiNotification = {
      _id: "notif-2",
      userId: "user-officer-1",
      message: "You have been reassigned \"Pothole on Main St\".",
      read: false,
      createdAt: new Date().toISOString(),
      meta: {
        complaintId: "650999999999abcdef999999",
        type: "complaint_reassigned",
        title: "Complaint reassigned to you",
        department: "Road & Infrastructure",
      },
    };

    const hydrated = hydrateNotification(reassignedNotification, officerUser);
    expect(hydrated.link).toBe("/department/complaints/650999999999abcdef999999");
    expect(hydrated.link.startsWith("/department/complaints/")).toBe(true);
    expect(hydrated.link.startsWith("/citizen/")).toBe(false);
  });

  it("preserves citizen navigation to citizen complaint-detail pages", () => {
    const citizenNotification: ApiNotification = {
      _id: "notif-3",
      userId: "user-citizen-1",
      message: "Your complaint has been assigned to an officer.",
      read: false,
      createdAt: new Date().toISOString(),
      meta: {
        complaintId: "650123456789abcdef012345",
        type: "complaint_assigned",
        title: "Complaint assigned",
      },
    };

    const hydrated = hydrateNotification(citizenNotification, citizenUser);
    expect(hydrated.link).toBe("/citizen/complaints/650123456789abcdef012345");
    expect(hydrated.link.startsWith("/citizen/complaints/")).toBe(true);
  });

  it("routes admin with complaintId to /citizen/complaints/:id (authorized admin view)", () => {
    const adminNotif: ApiNotification = {
      _id: "notif-admin-c",
      userId: "user-admin-1",
      message: "Escalated complaint requires review.",
      read: false,
      createdAt: new Date().toISOString(),
      meta: {
        complaintId: "650123456789abcdef012345",
        type: "sla_overdue",
        title: "SLA Overdue Escalated",
      },
    };

    const hydrated = hydrateNotification(adminNotif, adminUser);
    expect(hydrated.link).toBe("/citizen/complaints/650123456789abcdef012345");
  });

  // ────────────────────────────────────────────────────────────────────────────
  // AUDIT DEFECT REPAIRS (THE 4 INVALID ROUTES)
  // ────────────────────────────────────────────────────────────────────────────

  describe("Repaired Fallback Routes (Missing complaintId)", () => {
    it("fixes invalid route 1: /department/ai-insights -> /department", () => {
      const aiNotif: ApiNotification = {
        _id: "notif-ai",
        userId: "user-authority-1",
        message: "AI triage completed for your department.",
        read: false,
        createdAt: new Date().toISOString(),
        meta: { type: "ai" },
      };

      const linkAuth = resolveNotificationLink(aiNotif, authorityUser);
      expect(linkAuth).toBe("/department");
      expect(linkAuth).not.toBe("/department/ai-insights");

      const linkOfficer = resolveNotificationLink(aiNotif, officerUser);
      expect(linkOfficer).toBe("/department");
      expect(linkOfficer).not.toBe("/department/ai-insights");
    });

    it("fixes invalid route 2: /department/complaints -> /department/assigned (Authority) or /department/my-assigned (Officer)", () => {
      const complaintFallbackNotif: ApiNotification = {
        _id: "notif-comp-fallback",
        userId: "user-authority-1",
        message: "New complaints pending department action.",
        read: false,
        createdAt: new Date().toISOString(),
        meta: { type: "complaint" },
      };

      const linkAuth = resolveNotificationLink(complaintFallbackNotif, authorityUser);
      expect(linkAuth).toBe("/department/assigned");
      expect(linkAuth).not.toBe("/department/complaints");

      const linkOfficer = resolveNotificationLink(complaintFallbackNotif, officerUser);
      expect(linkOfficer).toBe("/department/my-assigned");
      expect(linkOfficer).not.toBe("/department/complaints");
    });

    it("fixes invalid route 3: /admin/complaints -> /admin", () => {
      const adminCompNotif: ApiNotification = {
        _id: "notif-admin-comp",
        userId: "user-admin-1",
        message: "Weekly complaint audit summary ready.",
        read: false,
        createdAt: new Date().toISOString(),
        meta: { type: "complaint" },
      };

      const linkAdmin = resolveNotificationLink(adminCompNotif, adminUser);
      expect(linkAdmin).toBe("/admin");
      expect(linkAdmin).not.toBe("/admin/complaints");
    });

    it("fixes invalid route 4: /admin/feedback -> /admin", () => {
      const adminFeedbackNotif: ApiNotification = {
        _id: "notif-admin-fb",
        userId: "user-admin-1",
        message: "Citizen satisfaction trends updated.",
        read: false,
        createdAt: new Date().toISOString(),
        meta: { type: "feedback" },
      };

      const linkAdmin = resolveNotificationLink(adminFeedbackNotif, adminUser);
      expect(linkAdmin).toBe("/admin");
      expect(linkAdmin).not.toBe("/admin/feedback");
    });

    it("routes authority feedback fallback to /department/feedback and officer to /department", () => {
      const fbNotif: ApiNotification = {
        _id: "notif-fb-dept",
        userId: "user-authority-1",
        message: "New citizen feedback received.",
        read: false,
        createdAt: new Date().toISOString(),
        meta: { type: "feedback" },
      };

      const linkAuth = resolveNotificationLink(fbNotif, authorityUser);
      expect(linkAuth).toBe("/department/feedback");

      // Officers have no feedback management view; fallback safely to /department
      const linkOfficer = resolveNotificationLink(fbNotif, officerUser);
      expect(linkOfficer).toBe("/department");
      expect(linkOfficer).not.toBe("/department/feedback");
    });

    it("routes admin AI fallback to /admin/ai-insights", () => {
      const adminAiNotif: ApiNotification = {
        _id: "notif-admin-ai",
        userId: "user-admin-1",
        message: "AI pattern detection alert.",
        read: false,
        createdAt: new Date().toISOString(),
        meta: { type: "ai" },
      };

      const linkAdmin = resolveNotificationLink(adminAiNotif, adminUser);
      expect(linkAdmin).toBe("/admin/ai-insights");
    });

    it("routes system notifications to appropriate profile or dashboard", () => {
      const sysNotif: ApiNotification = {
        _id: "notif-sys",
        userId: "user-citizen-1",
        message: "Password changed.",
        read: false,
        createdAt: new Date().toISOString(),
        meta: { type: "system" },
      };

      expect(resolveNotificationLink(sysNotif, citizenUser)).toBe("/citizen/profile");
      expect(resolveNotificationLink(sysNotif, authorityUser)).toBe("/department/profile");
      expect(resolveNotificationLink(sysNotif, officerUser)).toBe("/department");
      expect(resolveNotificationLink(sysNotif, adminUser)).toBe("/admin");
    });

    it("handles whitespace-only or empty complaintId gracefully as fallback", () => {
      const whitespaceNotif: ApiNotification = {
        _id: "notif-white",
        userId: "user-citizen-1",
        message: "Blank complaint ID test.",
        read: false,
        createdAt: new Date().toISOString(),
        meta: { complaintId: "   ", type: "complaint" },
      };

      expect(resolveNotificationLink(whitespaceNotif, citizenUser)).toBe("/citizen/complaints");
      expect(resolveNotificationLink(whitespaceNotif, authorityUser)).toBe("/department/assigned");
      expect(resolveNotificationLink(whitespaceNotif, officerUser)).toBe("/department/my-assigned");
      expect(resolveNotificationLink(whitespaceNotif, adminUser)).toBe("/admin");
    });
  });
});
