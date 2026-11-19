import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import HeatmapView from "@/pages/admin/HeatmapView";
import AdminDepartments from "@/pages/admin/AdminDepartments";
import { complaintsApi, ComplaintRecord, membersApi } from "@/services/complaintsApi";
import { adminApi } from "@/services/adminApi";
import { AuthContext } from "@/contexts/AuthContext";
import { BrowserRouter, MemoryRouter, Routes, Route, Navigate } from "react-router-dom";

// Mock API modules
vi.mock("@/services/complaintsApi", () => ({
  complaintsApi: {
    listAll: vi.fn(),
  },
  membersApi: {
    list: vi.fn(),
    listEligibleUsers: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    unlink: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/services/adminApi", () => ({
  adminApi: {
    listUsers: vi.fn(),
  },
}));

// Mock toast
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
  toast: vi.fn(),
}));

describe("GovAI Resolve Phase 8.6 Remediation Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. HeatmapView Identifier Safety & Popover Rendering", () => {
    it("renders cluster popover safely when complaints have only id and no _id", async () => {
      const mockComplaintsWithoutUnderscoreId = [
        {
          id: "6af1234567890abcdef12345",
          reference: "CMP-F12345",
          title: "Pipeline burst on MG Road",
          description: "Water leaking near junction",
          category: "Water Supply",
          status: "Pending",
          priority: "High",
          location: "MG Road, Bengaluru",
          latitude: 12.9716,
          longitude: 77.5946,
          createdAt: new Date().toISOString(),
          // Note: _id is explicitly undefined to simulate complaintsApi.list() output
        },
        {
          id: "6af9876543210fedcba54321",
          reference: "CMP-A54321",
          title: "Sewage overflow in street",
          description: "Murky water spreading",
          category: "Water Supply",
          status: "In Progress",
          priority: "Medium",
          location: "Brigade Road, Bengaluru",
          latitude: 12.9720,
          longitude: 77.5950,
          createdAt: new Date().toISOString(),
        },
      ] as unknown as ComplaintRecord[];

      vi.mocked(complaintsApi.listAll).mockResolvedValueOnce(mockComplaintsWithoutUnderscoreId);

      render(<HeatmapView />);

      await waitFor(() => {
        expect(screen.getByText("Complaint Geographic Heatmap")).toBeInTheDocument();
      });

      // Find cluster label "2" rendered inside the SVG
      const clusterMarker = screen.getByText("2", { selector: "text" });
      expect(clusterMarker).toBeInTheDocument();

      // Click the cluster marker
      fireEvent.click(clusterMarker);

      // Verify that popover renders without throwing TypeError: Cannot read properties of undefined (reading 'slice')
      await waitFor(() => {
        expect(screen.getByText(/Cluster: 2 Incidents/i)).toBeInTheDocument();
        expect(screen.getByText("Pipeline burst on MG Road")).toBeInTheDocument();
        expect(screen.getByText("Sewage overflow in street")).toBeInTheDocument();
        expect(screen.getByText(/Citizen personal identity details are protected/i)).toBeInTheDocument();
        expect(screen.getByText("ID: CMP-F12345")).toBeInTheDocument();
        expect(screen.getByText("ID: CMP-A54321")).toBeInTheDocument();
      });
    });

    it("falls back to derived CMP-XXXXXX when reference is missing and id is present", async () => {
      const mockComplaintWithIdOnly = [
        {
          id: "6af11223344556677889900a",
          // reference missing
          title: "Pothole on 80ft road",
          description: "Road issue",
          category: "Road & Infrastructure",
          status: "Pending",
          location: "80ft Road, Bengaluru",
          latitude: 12.9340,
          longitude: 77.6200,
          createdAt: new Date().toISOString(),
        },
      ] as unknown as ComplaintRecord[];

      vi.mocked(complaintsApi.listAll).mockResolvedValueOnce(mockComplaintWithIdOnly);

      render(<HeatmapView />);

      await waitFor(() => {
        expect(screen.getByText("Complaint Geographic Heatmap")).toBeInTheDocument();
      });

      const clusterMarker = screen.getByText("1", { selector: "text" });
      fireEvent.click(clusterMarker);

      await waitFor(() => {
        expect(screen.getByText("Incident Location Detail")).toBeInTheDocument();
        // ID should be derived from the last 6 characters of the id ("89900a" -> "89900A")
        expect(screen.getByText("ID: CMP-89900A")).toBeInTheDocument();
      });
    });
  });

  describe("2. Citizen Route Alias (/citizen/raise-complaint -> /citizen/new)", () => {
    it("redirects /citizen/raise-complaint to /citizen/new for authenticated citizens", async () => {
      render(
        <MemoryRouter initialEntries={["/citizen/raise-complaint"]}>
          <Routes>
            <Route path="/citizen/raise-complaint" element={<Navigate to="/citizen/new" replace />} />
            <Route path="/citizen/new" element={<div>Raise Complaint Page Target</div>} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText("Raise Complaint Page Target")).toBeInTheDocument();
      });
    });
  });

  describe("3. Admin Officer Linking Button Accessibility", () => {
    it("renders eligible officer cards as accessible buttons with proper keyboard interaction", async () => {
      const mockMembers = [
        {
          id: "mem-1",
          name: "Unlinked Officer Roster",
          department: "Water Supply",
          userId: null,
          createdAt: new Date().toISOString(),
        },
      ];

      const mockUsers = [
        {
          id: "user-admin",
          name: "Admin User",
          email: "admin@govai.gov",
          role: "admin",
          status: "active",
        },
      ];

      const mockEligibleOfficers = [
        {
          id: "officer-user-1",
          name: "Officer Rajesh",
          email: "officer.rajesh@govai.gov",
          department: "Water Supply",
          status: "active",
          isLinked: false,
          linkedMember: null,
        },
        {
          id: "officer-user-2",
          name: "Officer Priya (Linked)",
          email: "officer.priya@govai.gov",
          department: "Water Supply",
          status: "active",
          isLinked: true,
          linkedMember: { memberId: "mem-other", memberName: "Other Member" },
        },
      ];

      vi.mocked(membersApi.list).mockResolvedValue(mockMembers as unknown as MemberRecord[]);
      vi.mocked(adminApi.listUsers).mockResolvedValue(mockUsers as unknown as ReturnType<typeof adminApi.listUsers>);
      vi.mocked(membersApi.listEligibleUsers).mockResolvedValue(mockEligibleOfficers as unknown as ReturnType<typeof membersApi.listEligibleUsers>);

      render(
        <BrowserRouter>
          <AdminDepartments />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText("Unlinked Officer Roster")).toBeInTheDocument();
      });

      // Find and click the "Link Officer" button for the unlinked member
      const linkOfficerBtn = screen.getByTestId("link-officer-unlinked-officer-roster");
      expect(linkOfficerBtn).toBeInTheDocument();
      fireEvent.click(linkOfficerBtn);

      // Verify the modal opens and displays eligible officers
      await waitFor(() => {
        expect(screen.getByTestId("link-officer-dialog")).toBeInTheDocument();
        expect(screen.getByText("Select Eligible Officer Account")).toBeInTheDocument();
      });

      // Eligible officer container must be a button
      const eligibleOfficerBtn = screen.getByTestId("eligible-officer-officer-user-1");
      expect(eligibleOfficerBtn.tagName).toBe("BUTTON");
      expect(eligibleOfficerBtn).toHaveAttribute("type", "button");
      expect(eligibleOfficerBtn).not.toBeDisabled();
      expect(eligibleOfficerBtn).toHaveAttribute("aria-pressed", "false");

      // Unavailable/already linked officer must be disabled
      const unavailableOfficerBtn = screen.getByTestId("eligible-officer-officer-user-2");
      expect(unavailableOfficerBtn).toBeDisabled();

      // Test keyboard interaction: press Enter on eligible officer button
      fireEvent.keyDown(eligibleOfficerBtn, { key: "Enter", code: "Enter" });

      await waitFor(() => {
        expect(eligibleOfficerBtn).toHaveAttribute("aria-pressed", "true");
      });

      // Confirm link button should now be enabled
      const confirmBtn = screen.getByTestId("confirm-link-officer-btn");
      expect(confirmBtn).not.toBeDisabled();

      // Test click on confirm link
      vi.mocked(membersApi.update).mockResolvedValueOnce({
        id: "mem-1",
        name: "Unlinked Officer Roster",
        department: "Water Supply",
        userId: "officer-user-1",
      } as unknown as MemberRecord);

      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(membersApi.update).toHaveBeenCalledWith("mem-1", {
          userId: "officer-user-1",
        });
      });
    });
  });
});
