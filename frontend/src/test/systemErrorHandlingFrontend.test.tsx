import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ApiError, apiClient } from "@/services/apiClient";
import CitizenComplaintDetail from "@/pages/citizen/ComplaintDetail";
import CitizenDashboard from "@/pages/citizen/CitizenDashboard";
import MyComplaints from "@/pages/citizen/MyComplaints";

// Mock dependencies
const { apiClientMock, complaintsApiMock } = vi.hoisted(() => ({
  apiClientMock: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  complaintsApiMock: {
    listMine: vi.fn(),
    delete: vi.fn(),
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
      listMine: complaintsApiMock.listMine,
      delete: complaintsApiMock.delete,
    },
  };
});

const mockUser = {
  id: "citizen-1",
  name: "Citizen Jane",
  email: "citizen@govai.gov",
  role: "citizen" as const,
  status: "active" as const,
};

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: mockUser,
    isAuthenticated: true,
  }),
}));

describe("System Error Handling & Failure Recovery (Phase 6F)", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  describe("Citizen ComplaintDetail Error Differentiation", () => {
    it("renders 'Complaint not found' only when response is HTTP 404", async () => {
      apiClientMock.get.mockRejectedValueOnce(new ApiError(404, "Complaint not found"));

      render(
        <MemoryRouter initialEntries={["/citizen/complaints/comp-404"]}>
          <Routes>
            <Route path="/citizen/complaints/:id" element={<CitizenComplaintDetail />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText("Complaint not found")).toBeInTheDocument();
      });

      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.getByText("Back to complaints")).toBeInTheDocument();
    });

    it("renders ApiErrorPanel with retry functionality on HTTP 500 server error", async () => {
      apiClientMock.get.mockRejectedValueOnce(new ApiError(500, "Internal server error"));

      render(
        <MemoryRouter initialEntries={["/citizen/complaints/comp-500"]}>
          <Routes>
            <Route path="/citizen/complaints/:id" element={<CitizenComplaintDetail />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole("alert")).toBeInTheDocument();
        expect(screen.getByText("Service error")).toBeInTheDocument();
      });

      // Does NOT show "Complaint not found"
      expect(screen.queryByText("Complaint not found")).not.toBeInTheDocument();

      // Retry button is available
      const retryBtn = screen.getByRole("button", { name: /Try again/i });
      expect(retryBtn).toBeInTheDocument();

      // Successfully loading on retry
      apiClientMock.get.mockResolvedValueOnce({
        _id: "comp-500",
        title: "Fixed Complaint",
        description: "Now recovered",
        category: "Water Supply",
        status: "Pending",
        sla: { slaStatus: "On Track", remainingMs: 3600000 },
        timeline: [],
      });

      fireEvent.click(retryBtn);

      await waitFor(() => {
        expect(screen.getByText("Fixed Complaint")).toBeInTheDocument();
      });
    });

    it("renders ApiErrorPanel on network connection failure (status 0)", async () => {
      apiClientMock.get.mockRejectedValueOnce(new ApiError(0, "Failed to fetch"));

      render(
        <MemoryRouter initialEntries={["/citizen/complaints/comp-offline"]}>
          <Routes>
            <Route path="/citizen/complaints/:id" element={<CitizenComplaintDetail />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole("alert")).toBeInTheDocument();
        expect(screen.getByText("Connection problem")).toBeInTheDocument();
      });

      expect(screen.queryByText("Complaint not found")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Try again/i })).toBeInTheDocument();
    });
  });

  describe("Dashboard Retry Functionality", () => {
    it("CitizenDashboard: shows ApiErrorPanel with retry button and recovers on retry", async () => {
      complaintsApiMock.listMine.mockRejectedValueOnce(new ApiError(500, "Server error"));

      render(
        <MemoryRouter>
          <CitizenDashboard />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole("alert")).toBeInTheDocument();
      });

      const retryBtn = screen.getByRole("button", { name: /Try again/i });
      expect(retryBtn).toBeInTheDocument();

      // Now mock successful recovery
      complaintsApiMock.listMine.mockResolvedValueOnce([
        {
          id: "comp-recovered-1",
          title: "Pothole fixed",
          description: "Details",
          category: "Road & Infrastructure",
          status: "Resolved",
          sla: { slaStatus: "Resolved", remainingMs: 0, isOverdue: false },
          createdAt: new Date().toISOString(),
          timeline: [],
        },
      ]);

      fireEvent.click(retryBtn);

      await waitFor(() => {
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        expect(screen.getByText("Total Filed")).toBeInTheDocument();
      });
    });

    it("MyComplaints: shows ApiErrorPanel with retry button and recovers on retry", async () => {
      complaintsApiMock.listMine.mockRejectedValueOnce(new ApiError(0, "Network failure"));

      render(
        <MemoryRouter>
          <MyComplaints />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole("alert")).toBeInTheDocument();
        expect(screen.getByText("Connection problem")).toBeInTheDocument();
      });

      const retryBtn = screen.getByRole("button", { name: /Try again/i });
      expect(retryBtn).toBeInTheDocument();

      complaintsApiMock.listMine.mockResolvedValueOnce([]);

      fireEvent.click(retryBtn);

      await waitFor(() => {
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        expect(screen.getByText("You have not filed any complaints yet.")).toBeInTheDocument();
      });
    });
  });

  describe("API Client Timeout & Cancellation Mechanics", () => {
    it("handles caller AbortSignal cancellation without labeling it a timeout", async () => {
      const actualApiClientModule = await vi.importActual<typeof import("@/services/apiClient")>("@/services/apiClient");

      const origFetch = globalThis.fetch;
      const abortController = new AbortController();

      globalThis.fetch = vi.fn().mockImplementation((_url, init) => {
        return new Promise((_resolve, reject) => {
          if (init?.signal) {
            init.signal.addEventListener("abort", () => {
              const err = new Error("The operation was aborted");
              err.name = "AbortError";
              reject(err);
            });
          }
        });
      });

      try {
        const promise = actualApiClientModule.apiClient.get("/api/test-abort", {
          signal: abortController.signal,
        });

        abortController.abort();

        await expect(promise).rejects.toThrow("The operation was aborted");
      } finally {
        globalThis.fetch = origFetch;
      }
    });

    it("times out stalled requests after timeout limit and throws ApiError(0)", async () => {
      const actualApiClientModule = await vi.importActual<typeof import("@/services/apiClient")>("@/services/apiClient");

      const origFetch = globalThis.fetch;
      vi.useFakeTimers();

      globalThis.fetch = vi.fn().mockImplementation((_url, init) => {
        return new Promise((_resolve, reject) => {
          if (init?.signal) {
            init.signal.addEventListener("abort", () => {
              const err = new Error("The operation was aborted");
              err.name = "AbortError";
              reject(err);
            });
          }
        });
      });

      try {
        const promise = actualApiClientModule.apiClient.get("/api/stalled-endpoint");

        // Advance timers by 30 seconds (DEFAULT_TIMEOUT_MS)
        vi.advanceTimersByTime(30000);

        await expect(promise).rejects.toThrow("Request timed out after 30 seconds");
      } finally {
        vi.useRealTimers();
        globalThis.fetch = origFetch;
      }
    });
  });
});

