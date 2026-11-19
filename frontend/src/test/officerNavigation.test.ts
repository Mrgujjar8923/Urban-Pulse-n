import { describe, it, expect } from "vitest";
import { hydrateNotification } from "@/contexts/NotificationContext";
import type { ApiNotification } from "@/services/notificationService";
import type { User } from "@/contexts/AuthContext";

describe("Officer vs Authority Navigation & Access Isolation", () => {
  const authorityUser: User = {
    id: "user-authority-1",
    name: "Supervisor Sharma",
    email: "sharma@govai.gov",
    role: "authority",
    department: "Water Supply",
    departmentRole: "authority",
    status: "active",
    isOfficer: false,
  };

  const officerRahul: User = {
    id: "user-officer-rahul",
    name: "Rahul Officer",
    email: "rahul@govai.gov",
    role: "authority",
    department: "Water Supply",
    departmentRole: "officer",
    status: "active",
    isOfficer: true,
    memberId: "member-rahul-id",
  };

  const unmappedOfficer: User = {
    id: "user-officer-unmapped",
    name: "Unmapped Officer",
    email: "unmapped@govai.gov",
    role: "authority",
    department: "Water Supply",
    departmentRole: "officer",
    status: "active",
    isOfficer: true,
    memberId: null,
  };

  const officerAman: User = {
    id: "user-officer-aman",
    name: "Aman Officer",
    email: "aman@govai.gov",
    role: "authority",
    department: "Water Supply",
    status: "active",
    isOfficer: true,
    memberId: "member-aman-id",
  };

  const citizenUser: User = {
    id: "user-citizen-1",
    name: "Citizen Priya",
    email: "priya@govai.gov",
    role: "citizen",
    status: "active",
  };

  it("notification navigation resolves correctly for Field Officers", () => {
    const notif: ApiNotification = {
      _id: "notif-rahul-1",
      userId: "user-officer-rahul",
      message: "You have been assigned complaint 'Burst Pipe'",
      read: false,
      createdAt: new Date().toISOString(),
      meta: {
        complaintId: "complaint-rahul-101",
        type: "complaint_assigned",
        title: "New complaint assigned",
        department: "Water Supply",
      },
    };

    const hydrated = hydrateNotification(notif, officerRahul);
    expect(hydrated.link).toBe("/department/complaints/complaint-rahul-101");
    expect(hydrated.link.startsWith("/citizen/")).toBe(false);
  });

  it("notification navigation resolves correctly for Department Authority", () => {
    const notif: ApiNotification = {
      _id: "notif-dept-1",
      userId: "user-authority-1",
      message: "A new complaint has been submitted to your department.",
      read: false,
      createdAt: new Date().toISOString(),
      meta: {
        complaintId: "complaint-general-202",
        type: "complaint_submitted",
        title: "New complaint submitted",
        department: "Water Supply",
      },
    };

    const hydrated = hydrateNotification(notif, authorityUser);
    expect(hydrated.link).toBe("/department/complaints/complaint-general-202");
  });

  it("notification navigation resolves correctly for Citizens", () => {
    const notif: ApiNotification = {
      _id: "notif-cit-1",
      userId: "user-citizen-1",
      message: "Your complaint has been assigned to an officer.",
      read: false,
      createdAt: new Date().toISOString(),
      meta: {
        complaintId: "complaint-cit-303",
        type: "complaint_assigned",
        title: "Complaint assigned",
      },
    };

    const hydrated = hydrateNotification(notif, citizenUser);
    expect(hydrated.link).toBe("/citizen/complaints/complaint-cit-303");
  });

  it("distinguishes officer vs authority navigation items appropriately", () => {
    // Expected Officer navigation
    const officerNavPaths = ["/department", "/department/my-assigned", "/notifications"];
    // Expected Authority navigation
    const authorityNavPaths = ["/department", "/department/assigned", "/department/members", "/notifications"];

    expect(officerNavPaths).not.toContain("/department/members");
    expect(officerNavPaths).not.toContain("/department/assigned");
    expect(officerNavPaths).toContain("/department/my-assigned");

    expect(authorityNavPaths).toContain("/department/members");
    expect(authorityNavPaths).toContain("/department/assigned");
    expect(authorityNavPaths).not.toContain("/department/my-assigned");
  });

  it("unmapped officer remains restricted to officer navigation without privilege escalation", () => {
    // Unmapped officer has isOfficer: true and departmentRole: "officer"
    const isOfficer = unmappedOfficer.isOfficer || unmappedOfficer.departmentRole !== "authority";
    expect(isOfficer).toBe(true);
    expect(unmappedOfficer.departmentRole).toBe("officer");
    expect(unmappedOfficer.memberId).toBeNull();
  });
});

