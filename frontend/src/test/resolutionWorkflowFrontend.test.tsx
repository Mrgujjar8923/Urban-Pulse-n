import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ResolveComplaintDialog } from "@/components/shared/ResolveComplaintDialog";
import { ComplaintEvidenceViewer } from "@/components/shared/ComplaintEvidenceViewer";
import ComplaintDetail from "@/pages/citizen/ComplaintDetail";
import FeedbackForm from "@/pages/citizen/FeedbackForm";

// Polyfill ResizeObserver for Radix UI Slider in jsdom
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock API and context dependencies
const {
  complaintsApiMock,
  apiClientMock,
  feedbackApiMock,
  navigateMock,
  mockAuthUser,
} = vi.hoisted(() => ({
  complaintsApiMock: {
    updateStatus: vi.fn(),
    getById: vi.fn(),
    getEvidenceBlob: vi.fn(),
    getResolutionEvidenceBlob: vi.fn(),
    delete: vi.fn(),
  },
  apiClientMock: {
    get: vi.fn(),
  },
  feedbackApiMock: {
    submit: vi.fn(),
  },
  navigateMock: vi.fn(),
  mockAuthUser: {
    current: {
      id: "u-cit-1",
      name: "Test Citizen",
      role: "citizen",
      department: null,
      departmentRole: null,
      isOfficer: false,
    },
  },
}));

vi.mock("@/services/complaintsApi", async () => {
  const actual = await vi.importActual<typeof import("@/services/complaintsApi")>("@/services/complaintsApi");
  return {
    ...actual,
    complaintsApi: {
      ...actual.complaintsApi,
      updateStatus: complaintsApiMock.updateStatus,
      getById: complaintsApiMock.getById,
      getEvidenceBlob: complaintsApiMock.getEvidenceBlob,
      getResolutionEvidenceBlob: complaintsApiMock.getResolutionEvidenceBlob,
      delete: complaintsApiMock.delete,
    },
    feedbackApi: {
      submit: feedbackApiMock.submit,
    },
  };
});

vi.mock("@/services/apiClient", async () => {
  const actual = await vi.importActual<typeof import("@/services/apiClient")>("@/services/apiClient");
  return {
    ...actual,
    apiClient: {
      ...actual.apiClient,
      get: apiClientMock.get,
    },
  };
});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: mockAuthUser.current,
    isAuthenticated: true,
  }),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

describe("Phase 7B: Complaint Resolution Evidence & Citizen Feedback (Frontend)", () => {
  let createdUrls: string[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    createdUrls = [];

    mockAuthUser.current = {
      id: "u-cit-1",
      name: "Test Citizen",
      role: "citizen",
      department: null,
      departmentRole: null,
      isOfficer: false,
    };

    URL.createObjectURL = vi.fn((_blob: Blob) => {
      const url = `blob:mock-evidence-${Math.random().toString(36).slice(2)}`;
      createdUrls.push(url);
      return url;
    });

    URL.revokeObjectURL = vi.fn((url: string) => {
      createdUrls = createdUrls.filter((u) => u !== url);
    });
  });

  afterEach(() => {
    cleanup();
  });

  // ==========================================
  // 1–10: RESOLVE COMPLAINT DIALOG
  // ==========================================

  it("1. ResolveComplaintDialog: renders modal with complaint reference and title", () => {
    render(
      <ResolveComplaintDialog
        open={true}
        onOpenChange={vi.fn()}
        complaintId="c-101"
        complaintReference="REF-101"
        complaintTitle="Water Pipe Burst"
        onSuccess={vi.fn()}
      />
    );

    expect(screen.getByText("Resolve Complaint")).toBeInTheDocument();
    expect(screen.getByText(/REF-101/)).toBeInTheDocument();
    expect(screen.getByText(/Water Pipe Burst/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Resolution Remarks/i)).toBeInTheDocument();
  });

  it("2. ResolveComplaintDialog: validates that remarks cannot be empty", async () => {
    render(
      <ResolveComplaintDialog
        open={true}
        onOpenChange={vi.fn()}
        complaintId="c-101"
        complaintReference="REF-101"
        complaintTitle="Water Pipe Burst"
        onSuccess={vi.fn()}
      />
    );

    const submitBtn = screen.getByRole("button", { name: /Mark Resolved/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Resolution remarks are required/i)).toBeInTheDocument();
    });
    expect(complaintsApiMock.updateStatus).not.toHaveBeenCalled();
  });

  it("3. ResolveComplaintDialog: updates character count and enforces 2000 character limit", () => {
    render(
      <ResolveComplaintDialog
        open={true}
        onOpenChange={vi.fn()}
        complaintId="c-101"
        complaintReference="REF-101"
        complaintTitle="Water Pipe Burst"
        onSuccess={vi.fn()}
      />
    );

    const textarea = screen.getByLabelText(/Resolution Remarks/i);
    fireEvent.change(textarea, { target: { value: "Repaired pipe leak" } });

    expect(screen.getByText(/18\s*\/\s*2000/)).toBeInTheDocument();
  });

  it("4. ResolveComplaintDialog: selecting a valid JPEG displays preview and file info", () => {
    render(
      <ResolveComplaintDialog
        open={true}
        onOpenChange={vi.fn()}
        complaintId="c-101"
        complaintReference="REF-101"
        complaintTitle="Water Pipe Burst"
        onSuccess={vi.fn()}
      />
    );

    const file = new File(["dummy jpeg content"], "repaired.jpg", { type: "image/jpeg" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [file] } });

    expect(screen.getByText("repaired.jpg")).toBeInTheDocument();
    expect(screen.getByAltText("Resolution evidence preview")).toBeInTheDocument();
  });

  it("5. ResolveComplaintDialog: clicking Remove clears the selected file and revokes object URL", () => {
    render(
      <ResolveComplaintDialog
        open={true}
        onOpenChange={vi.fn()}
        complaintId="c-101"
        complaintReference="REF-101"
        complaintTitle="Water Pipe Burst"
        onSuccess={vi.fn()}
      />
    );

    const file = new File(["dummy jpeg content"], "repaired.jpg", { type: "image/jpeg" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [file] } });
    expect(screen.getByText("repaired.jpg")).toBeInTheDocument();

    const removeBtn = screen.getByRole("button", { name: /Remove/i });
    fireEvent.click(removeBtn);

    expect(screen.queryByText("repaired.jpg")).not.toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  it("6. ResolveComplaintDialog: rejects files larger than 5MB", () => {
    render(
      <ResolveComplaintDialog
        open={true}
        onOpenChange={vi.fn()}
        complaintId="c-101"
        complaintReference="REF-101"
        complaintTitle="Water Pipe Burst"
        onSuccess={vi.fn()}
      />
    );

    const largeFile = new File([new Uint8Array(5 * 1024 * 1024 + 10)], "large.jpg", { type: "image/jpeg" });
    Object.defineProperty(largeFile, "size", { value: 5 * 1024 * 1024 + 10 });

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [largeFile] } });

    expect(screen.getByText(/File size exceeds 5MB limit/i)).toBeInTheDocument();
  });

  it("7. ResolveComplaintDialog: rejects disallowed file types like PDF or SVG", () => {
    render(
      <ResolveComplaintDialog
        open={true}
        onOpenChange={vi.fn()}
        complaintId="c-101"
        complaintReference="REF-101"
        complaintTitle="Water Pipe Burst"
        onSuccess={vi.fn()}
      />
    );

    const pdfFile = new File(["pdf content"], "doc.pdf", { type: "application/pdf" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [pdfFile] } });

    expect(screen.getByText(/Only JPEG, PNG, and WebP images are allowed/i)).toBeInTheDocument();
  });

  it("8. ResolveComplaintDialog: calls updateStatus with FormData when image evidence is attached", async () => {
    const onSuccess = vi.fn();
    complaintsApiMock.updateStatus.mockResolvedValueOnce({
      id: "c-101",
      status: "Resolved",
      resolutionHistory: [{ remarks: "Fixed joint", evidence: "complaints/uuid.jpg" }],
    });

    render(
      <ResolveComplaintDialog
        open={true}
        onOpenChange={vi.fn()}
        complaintId="c-101"
        complaintReference="REF-101"
        complaintTitle="Water Pipe Burst"
        onSuccess={onSuccess}
      />
    );

    const textarea = screen.getByLabelText(/Resolution Remarks/i);
    fireEvent.change(textarea, { target: { value: "Fixed joint successfully." } });

    const file = new File(["image data"], "evidence.png", { type: "image/png" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    const submitBtn = screen.getByRole("button", { name: /Mark Resolved/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(complaintsApiMock.updateStatus).toHaveBeenCalledWith(
        "c-101",
        "Resolved",
        "Fixed joint successfully.",
        file
      );
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it("9. ResolveComplaintDialog: calls updateStatus with JSON payload when no image is attached", async () => {
    const onSuccess = vi.fn();
    complaintsApiMock.updateStatus.mockResolvedValueOnce({
      id: "c-101",
      status: "Resolved",
      resolutionHistory: [{ remarks: "Fixed joint without photo" }],
    });

    render(
      <ResolveComplaintDialog
        open={true}
        onOpenChange={vi.fn()}
        complaintId="c-101"
        complaintReference="REF-101"
        complaintTitle="Water Pipe Burst"
        onSuccess={onSuccess}
      />
    );

    const textarea = screen.getByLabelText(/Resolution Remarks/i);
    fireEvent.change(textarea, { target: { value: "Fixed joint without photo." } });

    const submitBtn = screen.getByRole("button", { name: /Mark Resolved/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(complaintsApiMock.updateStatus).toHaveBeenCalledWith(
        "c-101",
        "Resolved",
        "Fixed joint without photo.",
        null
      );
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it("10. ResolveComplaintDialog: disables submit button and shows loading text during submission", async () => {
    let finishPromise: (val: unknown) => void;
    complaintsApiMock.updateStatus.mockReturnValueOnce(
      new Promise((res) => {
        finishPromise = res;
      })
    );

    render(
      <ResolveComplaintDialog
        open={true}
        onOpenChange={vi.fn()}
        complaintId="c-101"
        complaintReference="REF-101"
        complaintTitle="Water Pipe Burst"
        onSuccess={vi.fn()}
      />
    );

    const textarea = screen.getByLabelText(/Resolution Remarks/i);
    fireEvent.change(textarea, { target: { value: "Submitting fix" } });

    const submitBtn = screen.getByRole("button", { name: /Mark Resolved/i });
    fireEvent.click(submitBtn);

    expect(screen.getByText("Saving Resolution...")).toBeInTheDocument();
    expect(submitBtn).toBeDisabled();

    await waitFor(() => {
      finishPromise!({ id: "c-101", status: "Resolved" });
    });
  });

  // ==========================================
  // 11–12: RESOLUTION EVIDENCE VIEWER
  // ==========================================

  it("11. ComplaintEvidenceViewer: fetches resolution evidence via getResolutionEvidenceBlob when isResolution=true", async () => {
    const mockBlob = new Blob(["image data"], { type: "image/jpeg" });
    complaintsApiMock.getResolutionEvidenceBlob.mockResolvedValueOnce(mockBlob);

    render(
      <ComplaintEvidenceViewer
        complaintId="c-101"
        entryId="entry-res-1"
        imageKey="complaints/res-1.jpg"
        isResolution={true}
      />
    );

    await waitFor(() => {
      expect(complaintsApiMock.getResolutionEvidenceBlob).toHaveBeenCalledWith("c-101", "entry-res-1");
      expect(screen.getByAltText(/Resolution.*evidence/i)).toBeInTheDocument();
    });
  });

  it("12. ComplaintEvidenceViewer: displays resolution-specific placeholder when imageKey is absent", () => {
    render(
      <ComplaintEvidenceViewer
        complaintId="c-101"
        imageKey=""
        isResolution={true}
      />
    );

    expect(screen.getByText("No photo evidence attached to this resolution.")).toBeInTheDocument();
  });

  // ==========================================
  // 13–16: CITIZEN COMPLAINT DETAIL & RESOLUTION CARD
  // ==========================================

  it("13. Citizen ComplaintDetail: renders dedicated Resolution Summary Card when complaint is Resolved", async () => {
    const resolvedComplaint = {
      _id: "c-201",
      reference: "GOV-201",
      title: "Broken Streetlight",
      description: "Light out on Elm Street",
      category: "Electricity",
      status: "Resolved",
      createdAt: "2026-11-01T08:00:00.000Z",
      currentResolution: {
        id: "res-entry-201",
        remarks: "Replaced blown bulb and calibrated ambient sensor.",
        resolvedAt: "2026-11-02T10:00:00.000Z",
        resolvedBy: { name: "Officer Sharma", department: "Electricity" },
        evidence: "complaints/light-fix.jpg",
      },
      resolutionHistory: [
        {
          _id: "res-entry-201",
          remarks: "Replaced blown bulb and calibrated ambient sensor.",
          resolvedAt: "2026-11-02T10:00:00.000Z",
          resolvedBy: { name: "Officer Sharma", department: "Electricity" },
          evidence: "complaints/light-fix.jpg",
        },
      ],
      sla: { slaStatus: "Resolved", deadline: "2026-11-03T08:00:00.000Z", remainingMs: 0 },
      timeline: [],
    };

    apiClientMock.get.mockResolvedValueOnce(resolvedComplaint);
    complaintsApiMock.getResolutionEvidenceBlob.mockResolvedValueOnce(new Blob(["data"], { type: "image/jpeg" }));

    render(
      <MemoryRouter initialEntries={["/citizen/complaints/c-201"]}>
        <Routes>
          <Route path="/citizen/complaints/:id" element={<ComplaintDetail />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Complaint Resolution")).toBeInTheDocument();
      expect(screen.getByText("Replaced blown bulb and calibrated ambient sensor.")).toBeInTheDocument();
      expect(screen.getByText(/Officer Sharma/)).toBeInTheDocument();
      expect(screen.getByText("Resolution Evidence Photo")).toBeInTheDocument();
    });
  });

  it("14. Citizen ComplaintDetail: displays fallback message for legacy resolved complaints without currentResolution", async () => {
    const legacyComplaint = {
      _id: "c-legacy",
      reference: "LEGACY-01",
      title: "Old Water Issue",
      description: "Fixed years ago",
      category: "Water",
      status: "Resolved",
      createdAt: "2024-01-01T08:00:00.000Z",
      resolutionHistory: [],
      sla: { slaStatus: "Resolved", deadline: null, remainingMs: null },
      timeline: [],
    };

    apiClientMock.get.mockResolvedValueOnce(legacyComplaint);

    render(
      <MemoryRouter initialEntries={["/citizen/complaints/c-legacy"]}>
        <Routes>
          <Route path="/citizen/complaints/:id" element={<ComplaintDetail />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Resolution details are unavailable for this older complaint.")).toBeInTheDocument();
    });
  });

  it("15. Citizen ComplaintDetail: shows Give Feedback button when eligible, and hides when feedback for this resolution exists", async () => {
    const resolvedWithoutFeedback = {
      _id: "c-fb-test-1",
      reference: "FB-01",
      title: "Pothole on Main St",
      category: "Roads",
      status: "Resolved",
      createdAt: "2026-11-05T08:00:00.000Z",
      currentResolution: {
        id: "res-attempt-1",
        remarks: "Filled pothole",
        resolvedAt: "2026-11-06T09:00:00.000Z",
      },
      resolutionHistory: [{ _id: "res-attempt-1", remarks: "Filled pothole" }],
      feedback: null,
      sla: { slaStatus: "Resolved" },
      timeline: [],
    };

    apiClientMock.get.mockResolvedValueOnce(resolvedWithoutFeedback);

    const { unmount } = render(
      <MemoryRouter initialEntries={["/citizen/complaints/c-fb-test-1"]}>
        <Routes>
          <Route path="/citizen/complaints/:id" element={<ComplaintDetail />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      const feedbackButtons = screen.getAllByRole("button", { name: /Give Feedback/i });
      expect(feedbackButtons.length).toBeGreaterThan(0);
    });

    unmount();

    // Render complaint with feedback already submitted for this specific resolutionId
    const resolvedWithFeedback = {
      _id: "c-fb-test-2",
      reference: "FB-02",
      title: "Pothole on Main St",
      category: "Roads",
      status: "Resolved",
      createdAt: "2026-11-05T08:00:00.000Z",
      currentResolution: {
        id: "res-attempt-2",
        remarks: "Filled pothole again",
        resolvedAt: "2026-11-06T09:00:00.000Z",
      },
      resolutionHistory: [{ _id: "res-attempt-2", remarks: "Filled pothole again" }],
      feedback: {
        rating: 5,
        comment: "Great job",
        resolutionId: "res-attempt-2",
      },
      sla: { slaStatus: "Resolved" },
      timeline: [],
    };
    apiClientMock.get.mockResolvedValueOnce(resolvedWithFeedback);

    render(
      <MemoryRouter initialEntries={["/citizen/complaints/c-fb-test-2"]}>
        <Routes>
          <Route path="/citizen/complaints/:id" element={<ComplaintDetail />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /Give Feedback/i })).not.toBeInTheDocument();
      expect(screen.getByText("Submitted Feedback")).toBeInTheDocument();
    });
  });

  it("16. Citizen ComplaintDetail: reopened complaint in In Progress state does not render active Resolution Summary Card", async () => {
    const reopenedComplaint = {
      _id: "c-reopened",
      reference: "REOPEN-01",
      title: "Recurring Water Leak",
      category: "Water",
      status: "In Progress",
      createdAt: "2026-11-01T08:00:00.000Z",
      resolutionHistory: [
        {
          _id: "res-old-1",
          remarks: "First attempt: patched valve",
          resolvedAt: "2026-11-02T08:00:00.000Z",
        },
      ],
      sla: { slaStatus: "On Track", remainingMs: 3600000 },
      timeline: [],
    };

    apiClientMock.get.mockResolvedValueOnce(reopenedComplaint);

    render(
      <MemoryRouter initialEntries={["/citizen/complaints/c-reopened"]}>
        <Routes>
          <Route path="/citizen/complaints/:id" element={<ComplaintDetail />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.queryByText("Complaint Resolution")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Give Feedback/i })).not.toBeInTheDocument();
    });
  });

  // ==========================================
  // 17: CITIZEN FEEDBACK FORM FAKE UPLOAD REMOVAL
  // ==========================================

  it("17. Citizen FeedbackForm: does not render the fake 'Upload Proof Image' placeholder card", async () => {
    const resolvedComplaint = {
      id: "c-301",
      reference: "GOV-301",
      title: "Drain Blockage",
      status: "Resolved",
      feedback: null,
      currentResolution: {
        id: "res-301",
        remarks: "Cleared debris",
      },
    };

    complaintsApiMock.getById.mockResolvedValueOnce(resolvedComplaint);

    render(
      <MemoryRouter initialEntries={["/citizen/complaints/c-301/feedback"]}>
        <Routes>
          <Route path="/citizen/complaints/:id/feedback" element={<FeedbackForm />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Work Evaluation Feedback")).toBeInTheDocument();
      expect(screen.queryByText("Upload Proof Image (optional)")).not.toBeInTheDocument();
      expect(screen.queryByText(/represented as metadata/i)).not.toBeInTheDocument();
    });
  });
});
