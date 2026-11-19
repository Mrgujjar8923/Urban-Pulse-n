import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { normalizeComplaint, ComplaintRecord } from "@/services/complaintsApi";

const { apiClientMock, complaintsApiMock } = vi.hoisted(() => ({
  apiClientMock: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  complaintsApiMock: {
    retryAiAnalysis: vi.fn(),
    listAll: vi.fn(),
  },
}));

vi.mock("@/services/apiClient", async () => {
  const actual = await vi.importActual<typeof import("@/services/apiClient")>("@/services/apiClient");
  return {
    ...actual,
    apiClient: apiClientMock,
  };
});

vi.mock("@/services/complaintsApi", async () => {
  const actual = await vi.importActual<typeof import("@/services/complaintsApi")>("@/services/complaintsApi");
  return {
    ...actual,
    complaintsApi: {
      ...actual.complaintsApi,
      retryAiAnalysis: complaintsApiMock.retryAiAnalysis,
      listAll: complaintsApiMock.listAll,
    },
  };
});

// Mock AuthContext
let mockCurrentUser = {
  id: "user-1",
  name: "Citizen Jane",
  email: "citizen@govai.gov",
  role: "citizen",
  departmentRole: undefined as string | undefined,
  department: undefined as string | undefined,
  isOfficer: false,
};

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: mockCurrentUser,
    logout: vi.fn(),
  }),
}));

import CitizenComplaintDetail from "@/pages/citizen/ComplaintDetail";
import AuthorityComplaintDetail from "@/pages/authority/ComplaintDetail";
import AdminComplaints from "@/pages/admin/AdminComplaints";

describe("Phase 4B — Gemini Reliability & Safe Fallback (Frontend)", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  describe("normalizeComplaint behavior", () => {
    it("preserves completed AI analysis and priority", () => {
      const raw = {
        _id: "comp-1",
        title: "Pothole",
        description: "Large road hole",
        category: "Road & Infrastructure",
        status: "Pending",
        aiAnalysis: {
          status: "completed" as const,
          category: "Road & Infrastructure",
          priority: "High",
          urgencyScore: 8,
          confidence: 0.9,
          reasoning: "Road damage needs quick intervention",
        },
      };

      const normalized = normalizeComplaint(raw);
      expect(normalized.priority).toBe("High");
      expect(normalized.aiUrgencyScore).toBe(8);
      expect(normalized.aiAnalysis?.status).toBe("completed");
    });

    it("preserves failed AI analysis status and errorCategory without fabricating results", () => {
      const raw = {
        _id: "comp-2",
        title: "No water",
        description: "Water cuts",
        category: "Water Supply",
        status: "Pending",
        aiAnalysis: {
          status: "failed" as const,
          errorCategory: "TIMEOUT",
          errorMessage: "Gemini request timed out.",
          retryCount: 1,
        },
      };

      const normalized = normalizeComplaint(raw);
      expect(normalized.aiAnalysis?.status).toBe("failed");
      expect(normalized.aiAnalysis?.errorCategory).toBe("TIMEOUT");
      expect(normalized.aiAnalysis?.reasoning).toBeUndefined();
    });

    it("handles historical complaints with null or missing aiAnalysis safely", () => {
      const raw = {
        _id: "comp-legacy",
        title: "Old complaint",
        description: "Created before AI system",
        category: "Electricity",
        status: "Resolved",
      };

      const normalized = normalizeComplaint(raw);
      expect(normalized.aiAnalysis).toBeNull();
      expect(normalized.status).toBe("Resolved");
    });
  });

  describe("Citizen Complaint Detail AI rendering", () => {
    it("renders full AI breakdown when AI status is completed", async () => {
      mockCurrentUser = {
        id: "citizen-1",
        name: "Citizen Jane",
        email: "citizen@govai.gov",
        role: "citizen",
        departmentRole: undefined,
        department: undefined,
        isOfficer: false,
      };

      apiClientMock.get.mockResolvedValueOnce({
        _id: "comp-comp",
        title: "Broken streetlight",
        description: "Light flickering",
        category: "Electricity",
        status: "Pending",
        sla: {
          slaStatus: "On Track",
          deadline: new Date(Date.now() + 86400000).toISOString(),
          remainingMs: 86400000,
          isOverdue: false,
        },
        timeline: [],
        aiAnalysis: {
          status: "completed",
          category: "Electricity",
          priority: "Medium",
          urgencyScore: 5,
          confidence: 0.85,
          reasoning: "Streetlight fault detected",
        },
      });

      render(
        <MemoryRouter initialEntries={["/citizen/complaints/comp-comp"]}>
          <Routes>
            <Route path="/citizen/complaints/:id" element={<CitizenComplaintDetail />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText("Broken streetlight")).toBeInTheDocument();
      });

      expect(screen.getByText("AI Analysis")).toBeInTheDocument();
      expect(screen.getByText("Streetlight fault detected")).toBeInTheDocument();
      expect(screen.getByText("85%")).toBeInTheDocument();
    });

    it("renders AI Analysis Temporarily Unavailable banner when AI status is failed", async () => {
      apiClientMock.get.mockResolvedValueOnce({
        _id: "comp-fail",
        title: "Pothole on Main Road",
        description: "Deep pothole",
        category: "Road & Infrastructure",
        status: "Pending",
        sla: {
          slaStatus: "On Track",
          deadline: new Date(Date.now() + 86400000).toISOString(),
          remainingMs: 86400000,
          isOverdue: false,
        },
        timeline: [],
        aiAnalysis: {
          status: "failed",
          errorCategory: "TIMEOUT",
          errorMessage: "Request timed out",
          retryCount: 1,
        },
      });

      render(
        <MemoryRouter initialEntries={["/citizen/complaints/comp-fail"]}>
          <Routes>
            <Route path="/citizen/complaints/:id" element={<CitizenComplaintDetail />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText("Pothole on Main Road")).toBeInTheDocument();
      });

      expect(screen.getByText("AI Analysis Temporarily Unavailable")).toBeInTheDocument();
      expect(
        screen.getByText(/AI-assisted analysis was temporarily unavailable when this complaint was submitted/)
      ).toBeInTheDocument();
      expect(screen.getByText("Status code: TIMEOUT")).toBeInTheDocument();

      // Ensure no fake AI results are shown
      expect(screen.queryByText("Confidence")).not.toBeInTheDocument();
      expect(screen.queryByText("Reasoning")).not.toBeInTheDocument();
    });

    it("renders Manual Review Required banner when AI category is unverified", async () => {
      apiClientMock.get.mockResolvedValueOnce({
        _id: "comp-review",
        title: "Park problem",
        description: "Bench broken",
        category: "Environment",
        status: "Pending",
        sla: {
          slaStatus: "On Track",
          deadline: new Date(Date.now() + 86400000).toISOString(),
          remainingMs: 86400000,
          isOverdue: false,
        },
        timeline: [],
        aiAnalysis: {
          status: "manual_review_required",
          errorCategory: "INVALID_CATEGORY",
        },
      });

      render(
        <MemoryRouter initialEntries={["/citizen/complaints/comp-review"]}>
          <Routes>
            <Route path="/citizen/complaints/:id" element={<CitizenComplaintDetail />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText("Park problem")).toBeInTheDocument();
      });

      expect(screen.getByText("Manual Review Required")).toBeInTheDocument();
      expect(
        screen.getByText(/AI analysis could not verify the department category with sufficient confidence/)
      ).toBeInTheDocument();
    });

    it("renders legacy fallback when complaint has no AI analysis metadata", async () => {
      apiClientMock.get.mockResolvedValueOnce({
        _id: "comp-legacy-2",
        title: "Legacy complaint",
        description: "Created in 2025",
        category: "Water Supply",
        status: "Resolved",
        sla: {
          slaStatus: "Unavailable",
          remainingMs: null,
          isOverdue: false,
        },
        timeline: [],
        aiAnalysis: null,
      });

      render(
        <MemoryRouter initialEntries={["/citizen/complaints/comp-legacy-2"]}>
          <Routes>
            <Route path="/citizen/complaints/:id" element={<CitizenComplaintDetail />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText("Legacy complaint")).toBeInTheDocument();
      });

      expect(screen.getByText("AI analysis not available.")).toBeInTheDocument();
    });
  });

  describe("Authority Complaint Detail & Retry AI RBAC", () => {
    it("renders Retry AI Analysis button for Department Authority in matching department", async () => {
      mockCurrentUser = {
        id: "auth-road",
        name: "Road Authority",
        email: "authority@demo.com",
        role: "authority",
        departmentRole: "authority",
        department: "Road & Infrastructure",
        isOfficer: false,
      };

      apiClientMock.get.mockResolvedValueOnce({
        _id: "comp-retry-1",
        title: "Damaged Flyover",
        description: "Concrete cracks",
        category: "Road & Infrastructure",
        status: "Pending",
        sla: {
          slaStatus: "On Track",
          deadline: new Date(Date.now() + 86400000).toISOString(),
          remainingMs: 86400000,
          isOverdue: false,
        },
        timeline: [],
        aiAnalysis: {
          status: "failed",
          errorCategory: "PROVIDER_UNAVAILABLE",
        },
      });

      render(
        <MemoryRouter initialEntries={["/department/complaints/comp-retry-1"]}>
          <Routes>
            <Route path="/department/complaints/:id" element={<AuthorityComplaintDetail />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText("Damaged Flyover")).toBeInTheDocument();
      });

      const retryBtn = screen.getByRole("button", { name: /Retry AI Analysis/i });
      expect(retryBtn).toBeInTheDocument();

      complaintsApiMock.retryAiAnalysis.mockResolvedValueOnce({
        id: "comp-retry-1",
        reference: "CMP-RETRY-1",
        title: "Damaged Flyover",
        description: "Concrete cracks",
        category: "Road & Infrastructure",
        status: "Pending",
        sla: {
          slaStatus: "On Track",
          remainingMs: 86400000,
          isOverdue: false,
        },
        timeline: [],
        aiAnalysis: {
          status: "completed",
          category: "Road & Infrastructure",
          priority: "Critical",
          reasoning: "Structural flyover crack is high risk",
        },
      });

      fireEvent.click(retryBtn);

      await waitFor(() => {
        expect(complaintsApiMock.retryAiAnalysis).toHaveBeenCalledWith("comp-retry-1");
      });
    });

    it("hides Retry AI Analysis button for Field Officers", async () => {
      mockCurrentUser = {
        id: "officer-priya",
        name: "Officer Priya",
        email: "road.demo@govai.gov",
        role: "authority",
        departmentRole: "officer",
        department: "Road & Infrastructure",
        isOfficer: true,
      };

      apiClientMock.get.mockResolvedValueOnce({
        _id: "comp-retry-2",
        title: "Pothole repair",
        description: "Need gravel",
        category: "Road & Infrastructure",
        status: "Assigned",
        sla: {
          slaStatus: "On Track",
          deadline: new Date(Date.now() + 86400000).toISOString(),
          remainingMs: 86400000,
          isOverdue: false,
        },
        timeline: [],
        aiAnalysis: {
          status: "failed",
          errorCategory: "TIMEOUT",
        },
      });

      render(
        <MemoryRouter initialEntries={["/department/complaints/comp-retry-2"]}>
          <Routes>
            <Route path="/department/complaints/:id" element={<AuthorityComplaintDetail />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText("Pothole repair")).toBeInTheDocument();
      });

      expect(screen.queryByRole("button", { name: /Retry AI Analysis/i })).not.toBeInTheDocument();
    });

    it("hides Retry AI Analysis button for Authority from another department", async () => {
      mockCurrentUser = {
        id: "auth-water",
        name: "Water Authority",
        email: "water@demo.com",
        role: "authority",
        departmentRole: "authority",
        department: "Water Supply",
        isOfficer: false,
      };

      apiClientMock.get.mockResolvedValueOnce({
        _id: "comp-retry-3",
        title: "Road pothole",
        description: "Road issue",
        category: "Road & Infrastructure", // Different department!
        status: "Pending",
        sla: {
          slaStatus: "On Track",
          remainingMs: 86400000,
          isOverdue: false,
        },
        timeline: [],
        aiAnalysis: {
          status: "failed",
        },
      });

      render(
        <MemoryRouter initialEntries={["/department/complaints/comp-retry-3"]}>
          <Routes>
            <Route path="/department/complaints/:id" element={<AuthorityComplaintDetail />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText("Road pothole")).toBeInTheDocument();
      });

      expect(screen.queryByRole("button", { name: /Retry AI Analysis/i })).not.toBeInTheDocument();
    });
  });

  describe("Phase 6B — Multilingual Support & Translation Display", () => {
    it("Authority Complaint Detail renders Detected language and English translation for completed AI analysis", async () => {
      mockCurrentUser = {
        id: "auth-1",
        name: "Authority Officer",
        email: "auth@govai.gov",
        role: "authority",
        departmentRole: "authority",
        department: "Water Supply",
        isOfficer: false,
      };

      apiClientMock.get.mockResolvedValueOnce({
        _id: "comp-ml-1",
        title: "नल से गंदा पानी आ रहा है",
        description: "पिछले दो दिनों से पीने का पानी बहुत मटमैला और दुर्गंधयुक्त है।",
        category: "Water Supply",
        status: "Pending",
        sla: {
          slaStatus: "On Track",
          deadline: new Date(Date.now() + 86400000).toISOString(),
          remainingMs: 86400000,
          isOverdue: false,
        },
        timeline: [],
        aiAnalysis: {
          status: "completed",
          detectedLanguage: "Hindi (Devanagari)",
          englishTranslation: "Contaminated muddy and foul-smelling tap water for the last two days.",
          category: "Water Supply",
          priority: "High",
          urgencyScore: 8,
          confidence: 0.95,
          reasoning: "Contaminated drinking water poses serious public health risk.",
          detectedIssue: "Water contamination",
          affectedArea: "Residential sector",
          recommendedDepartment: "Water Supply",
          recommendedAction: "Flush supply main and test water quality samples",
        },
      });

      render(
        <MemoryRouter initialEntries={["/department/complaints/comp-ml-1"]}>
          <Routes>
            <Route path="/department/complaints/:id" element={<AuthorityComplaintDetail />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText("नल से गंदा पानी आ रहा है")).toBeInTheDocument();
        expect(screen.getByText(/पिछले दो दिनों से पीने का पानी/i)).toBeInTheDocument();
      });

      expect(screen.getByText("Detected language")).toBeInTheDocument();
      expect(screen.getByText("Hindi (Devanagari)")).toBeInTheDocument();
      expect(screen.getByText("English translation")).toBeInTheDocument();
      expect(screen.getByText("Contaminated muddy and foul-smelling tap water for the last two days.")).toBeInTheDocument();
    });

    it("Authority Complaint Detail renders translation alongside Manual Review Required banner when category is unsupported", async () => {
      mockCurrentUser = {
        id: "auth-1",
        name: "Authority Officer",
        email: "auth@govai.gov",
        role: "authority",
        departmentRole: "authority",
        department: "Environment",
        isOfficer: false,
      };

      apiClientMock.get.mockResolvedValueOnce({
        _id: "comp-ml-2",
        title: "कचरे का ढेर",
        description: "पार्क के पास कचरा जल रहा है जिससे धुआं फैल रहा है",
        category: "Environment",
        status: "Pending",
        sla: {
          slaStatus: "On Track",
          deadline: new Date(Date.now() + 86400000).toISOString(),
          remainingMs: 86400000,
          isOverdue: false,
        },
        timeline: [],
        aiAnalysis: {
          status: "manual_review_required",
          errorCategory: "INVALID_CATEGORY",
          errorMessage: "AI returned unsupported department category.",
          detectedLanguage: "Hindi (Devanagari)",
          englishTranslation: "Garbage is burning near the park and smoke is spreading.",
          category: "Waste Management Authority",
          priority: "High",
          urgencyScore: 7,
          confidence: 0.9,
          reasoning: "Open burning of waste creates hazardous airborne pollutants.",
          detectedIssue: "Illegal open waste burning",
          affectedArea: "Near city park",
          recommendedDepartment: "Waste Management Authority",
          recommendedAction: "Extinguish fire and inspect dump site",
        },
      });

      render(
        <MemoryRouter initialEntries={["/department/complaints/comp-ml-2"]}>
          <Routes>
            <Route path="/department/complaints/:id" element={<AuthorityComplaintDetail />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText("कचरे का ढेर")).toBeInTheDocument();
      });

      expect(screen.getByText("Manual Review Required")).toBeInTheDocument();
      expect(screen.getByText("Detected language")).toBeInTheDocument();
      expect(screen.getByText("Hindi (Devanagari)")).toBeInTheDocument();
      expect(screen.getByText("English translation")).toBeInTheDocument();
      expect(screen.getByText("Garbage is burning near the park and smoke is spreading.")).toBeInTheDocument();
    });

    it("Admin Complaints Dossier renders Detected Language and English Translation in inspection modal", async () => {
      mockCurrentUser = {
        id: "admin-1",
        name: "Admin User",
        email: "admin@govai.gov",
        role: "admin",
        departmentRole: undefined,
        department: undefined,
        isOfficer: false,
      };

      const testComplaint: ComplaintRecord = {
        id: "comp-admin-ml",
        reference: "CMP-ADMIN-01",
        title: "सड़क पर गहरा गड्ढा",
        description: "गाड़ी दुर्घटनाग्रस्त हो गई है गड्ढे की वजह से",
        category: "Road & Infrastructure",
        status: "Pending",
        priority: "High",
        aiUrgencyScore: 9,
        location: "Main Chowk",
        createdAt: new Date().toISOString(),
        sla: {
          slaStatus: "On Track",
          remainingMs: 72000000,
          isOverdue: false,
        },
        timeline: [],
        aiAnalysis: {
          status: "completed",
          detectedLanguage: "Hindi (Devanagari)",
          englishTranslation: "Deep pothole on the road caused a vehicle crash.",
          category: "Road & Infrastructure",
          priority: "High",
          urgencyScore: 9,
          confidence: 0.96,
          reasoning: "Road crater caused vehicle accident.",
          detectedIssue: "Accident-causing crater",
          recommendedAction: "Cordon off lane and fill pothole immediately",
        },
        createdBy: {
          id: "cit-1",
          name: "Ramesh Sharma",
          email: "ramesh@example.com",
          role: "citizen",
        },
      };

      complaintsApiMock.listAll.mockResolvedValueOnce([testComplaint]);

      render(
        <MemoryRouter>
          <AdminComplaints />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText("सड़क पर गहरा गड्ढा")).toBeInTheDocument();
      });

      const inspectBtn = screen.getByTitle("View complaint dossier");
      fireEvent.click(inspectBtn);

      await waitFor(() => {
        expect(screen.getByText("AI Classification & Urgency Assessment")).toBeInTheDocument();
      });

      expect(screen.getByText(/Detected Language:/i)).toBeInTheDocument();
      expect(screen.getByText("Hindi (Devanagari)")).toBeInTheDocument();
      expect(screen.getByText(/English Translation:/i)).toBeInTheDocument();
      expect(screen.getByText("Deep pothole on the road caused a vehicle crash.")).toBeInTheDocument();
      expect(screen.getByText("गाड़ी दुर्घटनाग्रस्त हो गई है गड्ढे की वजह से")).toBeInTheDocument();
    });
  });
});

