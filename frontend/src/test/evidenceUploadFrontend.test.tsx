import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ComplaintEvidenceViewer } from "@/components/shared/ComplaintEvidenceViewer";
import RaiseComplaint from "@/pages/citizen/RaiseComplaint";

// Mock complaintsApi
const { complaintsApiMock, navigateMock } = vi.hoisted(() => ({
  complaintsApiMock: {
    create: vi.fn(),
    getEvidenceBlob: vi.fn(),
  },
  navigateMock: vi.fn(),
}));

vi.mock("@/services/complaintsApi", async () => {
  const actual = await vi.importActual<typeof import("@/services/complaintsApi")>("@/services/complaintsApi");
  return {
    ...actual,
    complaintsApi: {
      ...actual.complaintsApi,
      create: complaintsApiMock.create,
      getEvidenceBlob: complaintsApiMock.getEvidenceBlob,
    },
  };
});

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

describe("Phase 7A: Complaint Evidence Upload & Retrieval (Frontend)", () => {
  let createdUrls: string[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    createdUrls = [];

    // Polyfill URL.createObjectURL and URL.revokeObjectURL for jsdom
    URL.createObjectURL = vi.fn((blob: Blob) => {
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
  // 1–5: COMPLAINT EVIDENCE VIEWER COMPONENT
  // ==========================================

  it("1. ComplaintEvidenceViewer: renders empty placeholder when imageKey is undefined, null, or empty string", () => {
    const { rerender } = render(<ComplaintEvidenceViewer complaintId="c-101" />);
    expect(screen.getByText("No photo evidence attached to this complaint.")).toBeInTheDocument();
    expect(complaintsApiMock.getEvidenceBlob).not.toHaveBeenCalled();

    rerender(<ComplaintEvidenceViewer complaintId="c-101" imageKey="" />);
    expect(screen.getByText("No photo evidence attached to this complaint.")).toBeInTheDocument();
    expect(complaintsApiMock.getEvidenceBlob).not.toHaveBeenCalled();
  });

  it("2. ComplaintEvidenceViewer: renders empty placeholder when imageKey is legacy 'uploaded' string (backward compatibility)", () => {
    render(<ComplaintEvidenceViewer complaintId="c-102" imageKey="uploaded" />);
    expect(screen.getByText("No photo evidence attached to this complaint.")).toBeInTheDocument();
    expect(complaintsApiMock.getEvidenceBlob).not.toHaveBeenCalled();
  });

  it("3. ComplaintEvidenceViewer: displays loading state while fetching evidence blob", async () => {
    let resolveBlob: (b: Blob) => void;
    complaintsApiMock.getEvidenceBlob.mockReturnValue(
      new Promise((resolve) => {
        resolveBlob = resolve;
      })
    );

    render(<ComplaintEvidenceViewer complaintId="c-103" imageKey="complaints/uuid-123.jpg" />);
    expect(screen.getByText("Loading attached evidence...")).toBeInTheDocument();

    // Resolve promise to clean up
    resolveBlob!(new Blob(["mock-image-data"], { type: "image/jpeg" }));
    await waitFor(() => {
      expect(screen.queryByText("Loading attached evidence...")).not.toBeInTheDocument();
    });
  });

  it("4. ComplaintEvidenceViewer: displays error banner when evidence fetch fails", async () => {
    complaintsApiMock.getEvidenceBlob.mockRejectedValue(new Error("File could not be found."));

    render(<ComplaintEvidenceViewer complaintId="c-104" imageKey="complaints/missing.jpg" />);

    await waitFor(() => {
      expect(screen.getByText("Evidence image unavailable")).toBeInTheDocument();
      expect(screen.getByText("File could not be found.")).toBeInTheDocument();
    });
  });

  it("5. ComplaintEvidenceViewer: renders image preview thumbnail when blob succeeds and opens modal dialog on click", async () => {
    const mockBlob = new Blob(["mock-image-data"], { type: "image/jpeg" });
    complaintsApiMock.getEvidenceBlob.mockResolvedValue(mockBlob);

    render(<ComplaintEvidenceViewer complaintId="c-105" imageKey="complaints/valid-evidence.jpg" />);

    await waitFor(() => {
      const img = screen.getByAltText("Complaint photo evidence");
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute("src", expect.stringContaining("blob:mock-evidence"));
    });

    // Click thumbnail / preview button to open lightbox modal
    const viewButton = screen.getByRole("button", { name: /View Full Image/i });
    fireEvent.click(viewButton);

    await waitFor(() => {
      expect(screen.getByText("Complaint Evidence Photo")).toBeInTheDocument();
      expect(screen.getByAltText("Complaint evidence full resolution")).toBeInTheDocument();
    });
  });

  // ==========================================
  // 6–11: RAISE COMPLAINT FORM UPLOAD FLOW
  // ==========================================

  it("6. RaiseComplaint: selecting valid JPEG displays preview thumbnail, filename, and file size", async () => {
    render(
      <MemoryRouter>
        <RaiseComplaint />
      </MemoryRouter>
    );

    const fileInput = document.getElementById("evidence-file-input") as HTMLInputElement;
    expect(fileInput).toBeInTheDocument();

    const testFile = new File(["jpeg-dummy-binary"], "damage_road.jpg", { type: "image/jpeg" });
    fireEvent.change(fileInput, { target: { files: [testFile] } });

    await waitFor(() => {
      expect(screen.getByText("damage_road.jpg")).toBeInTheDocument();
      expect(screen.getByText(/Ready for submission/)).toBeInTheDocument();
      expect(screen.getByAltText("Evidence preview")).toBeInTheDocument();
    });
  });

  it("7. RaiseComplaint: selecting file exceeding 5 MB displays error and rejects file", async () => {
    render(
      <MemoryRouter>
        <RaiseComplaint />
      </MemoryRouter>
    );

    const fileInput = document.getElementById("evidence-file-input") as HTMLInputElement;

    // Create a dummy large file (6 MB)
    const largeFile = new File([new ArrayBuffer(6 * 1024 * 1024)], "huge_photo.jpg", { type: "image/jpeg" });
    fireEvent.change(fileInput, { target: { files: [largeFile] } });

    await waitFor(() => {
      expect(screen.getByText(/File size exceeds 5MB limit/i)).toBeInTheDocument();
      expect(screen.queryByAltText("Evidence preview")).not.toBeInTheDocument();
    });
  });

  it("8. RaiseComplaint: selecting unsupported format (SVG / text) displays error and rejects file", async () => {
    render(
      <MemoryRouter>
        <RaiseComplaint />
      </MemoryRouter>
    );

    const fileInput = document.getElementById("evidence-file-input") as HTMLInputElement;

    const svgFile = new File(['<svg xmlns="http://www.w3.org/2000/svg"></svg>'], "vector.svg", { type: "image/svg+xml" });
    fireEvent.change(fileInput, { target: { files: [svgFile] } });

    await waitFor(() => {
      expect(screen.getByText(/Invalid file type/i)).toBeInTheDocument();
      expect(screen.queryByAltText("Evidence preview")).not.toBeInTheDocument();
    });
  });

  it("9. RaiseComplaint: clicking Remove clears selected file, revokes preview URL, and restores upload box", async () => {
    render(
      <MemoryRouter>
        <RaiseComplaint />
      </MemoryRouter>
    );

    const fileInput = document.getElementById("evidence-file-input") as HTMLInputElement;
    const testFile = new File(["dummy-data"], "pothole.png", { type: "image/png" });
    fireEvent.change(fileInput, { target: { files: [testFile] } });

    await waitFor(() => {
      expect(screen.getByText("pothole.png")).toBeInTheDocument();
    });

    const removeButton = screen.getByRole("button", { name: /remove/i });
    fireEvent.click(removeButton);

    await waitFor(() => {
      expect(screen.queryByText("pothole.png")).not.toBeInTheDocument();
      expect(screen.getByText("Click to upload photo evidence")).toBeInTheDocument();
      expect(URL.revokeObjectURL).toHaveBeenCalled();
    });
  });

  it("10. RaiseComplaint: form submission with selected photo sends FormData with image file", async () => {
    complaintsApiMock.create.mockResolvedValue({
      _id: "comp-999",
      title: "Broken streetlight in front of hospital",
      category: "Electricity",
      aiAnalysis: { status: "completed" },
    });

    render(
      <MemoryRouter>
        <RaiseComplaint />
      </MemoryRouter>
    );

    // Fill form fields
    const titleInput = screen.getByPlaceholderText(/Brief summary/i);
    const descInput = screen.getByPlaceholderText(/Provide detailed description/i);
    const locInput = screen.getByPlaceholderText(/Area, sector, landmark/i);

    fireEvent.change(titleInput, { target: { value: "Broken streetlight in front of hospital" } });
    fireEvent.change(descInput, { target: { value: "Light fixture has fallen down onto the sidewalk" } });
    fireEvent.change(locInput, { target: { value: "Sector 18 Civil Hospital" } });

    // Select file
    const fileInput = document.getElementById("evidence-file-input") as HTMLInputElement;
    const testFile = new File(["valid-jpeg-bytes"], "streetlight.jpg", { type: "image/jpeg" });
    fireEvent.change(fileInput, { target: { files: [testFile] } });

    await waitFor(() => {
      expect(screen.getByText("streetlight.jpg")).toBeInTheDocument();
    });

    // Submit form
    const submitButton = screen.getByRole("button", { name: /Submit Complaint/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(complaintsApiMock.create).toHaveBeenCalledTimes(1);
      const callArg = complaintsApiMock.create.mock.calls[0][0];
      expect(callArg instanceof FormData).toBe(true);
      expect((callArg as FormData).get("title")).toBe("Broken streetlight in front of hospital");
      expect((callArg as FormData).get("image")).toBe(testFile);
      expect(navigateMock).toHaveBeenCalledWith("/citizen/complaints");
    });
  });

  it("11. RaiseComplaint: form submission without photo sends JSON payload without file", async () => {
    complaintsApiMock.create.mockResolvedValue({
      _id: "comp-1000",
      title: "Garbage pile near market",
      category: "Solid Waste Management",
      aiAnalysis: { status: "completed" },
    });

    render(
      <MemoryRouter>
        <RaiseComplaint />
      </MemoryRouter>
    );

    // Fill form fields
    const titleInput = screen.getByPlaceholderText(/Brief summary/i);
    const descInput = screen.getByPlaceholderText(/Provide detailed description/i);
    const locInput = screen.getByPlaceholderText(/Area, sector, landmark/i);

    fireEvent.change(titleInput, { target: { value: "Garbage pile near market" } });
    fireEvent.change(descInput, { target: { value: "Overflowing bin not cleared for 3 days" } });
    fireEvent.change(locInput, { target: { value: "Central Market Gate 2" } });

    // Submit form without selecting file
    const submitButton = screen.getByRole("button", { name: /Submit Complaint/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(complaintsApiMock.create).toHaveBeenCalledTimes(1);
      const callArg = complaintsApiMock.create.mock.calls[0][0];
      expect(callArg instanceof FormData).toBe(false);
      expect(callArg.title).toBe("Garbage pile near market");
      expect(callArg.image).toBeUndefined();
      expect(navigateMock).toHaveBeenCalledWith("/citizen/complaints");
    });
  });
});
