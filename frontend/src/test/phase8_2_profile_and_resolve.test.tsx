import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ProfileSettings from "@/components/shared/ProfileSettings";
import AssignedComplaints from "@/pages/authority/Assigned";
import { authApi } from "@/services/authApi";
import { complaintsApi, ComplaintRecord } from "@/services/complaintsApi";

// Polyfill ResizeObserver for Radix UI dialogs
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}));

const mockUpdateProfile = vi.fn();
const mockUser = {
  id: "u-123",
  name: "Officer Sharma",
  email: "sharma@govai.gov",
  role: "authority",
  department: "Water Supply",
};

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: mockUser,
    updateProfile: mockUpdateProfile,
  }),
}));

vi.mock("@/services/authApi", () => ({
  authApi: {
    updateProfile: vi.fn(),
    changePassword: vi.fn(),
  },
}));

vi.mock("@/services/complaintsApi", async () => {
  const actual = await vi.importActual<typeof import("@/services/complaintsApi")>("@/services/complaintsApi");
  return {
    ...actual,
    complaintsApi: {
      ...actual.complaintsApi,
      listDepartment: vi.fn(),
      updateStatus: vi.fn(),
    },
  };
});

describe("Phase 8.2: ProfileSettings Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders profile settings with prefilled user information", () => {
    render(<ProfileSettings />);

    const nameInput = screen.getByLabelText(/Full Name/i) as HTMLInputElement;
    expect(nameInput.value).toBe("Officer Sharma");
    expect(screen.getByDisplayValue("sharma@govai.gov")).toBeDefined();
    expect(screen.getByDisplayValue("Water Supply")).toBeDefined();
  });

  it("rejects empty name with validation error toast", async () => {
    render(<ProfileSettings />);

    const nameInput = screen.getByLabelText(/Full Name/i);
    fireEvent.change(nameInput, { target: { value: "   " } });

    const saveBtn = screen.getByRole("button", { name: /Save Changes/i });
    fireEvent.click(saveBtn);

    expect(authApi.updateProfile).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Validation Error",
        description: "Name cannot be empty.",
        variant: "destructive",
      })
    );
  });

  it("saves profile name successfully via authApi.updateProfile and updates AuthContext", async () => {
    vi.mocked(authApi.updateProfile).mockResolvedValueOnce({
      message: "Profile updated successfully",
      user: {
        id: "u-123",
        name: "Officer Sharma Senior",
        email: "sharma@govai.gov",
        role: "authority",
        department: "Water Supply",
      },
    });

    render(<ProfileSettings />);

    const nameInput = screen.getByLabelText(/Full Name/i);
    fireEvent.change(nameInput, { target: { value: "Officer Sharma Senior" } });

    const saveBtn = screen.getByRole("button", { name: /Save Changes/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(authApi.updateProfile).toHaveBeenCalledWith({ name: "Officer Sharma Senior" });
      expect(mockUpdateProfile).toHaveBeenCalledWith({ name: "Officer Sharma Senior" });
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Profile Updated",
        })
      );
    });
  });

  it("validates required password fields on password update", async () => {
    render(<ProfileSettings />);

    const updateBtn = screen.getByRole("button", { name: /Update Password/i });
    fireEvent.click(updateBtn);

    expect(authApi.changePassword).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Validation Error",
        description: "All password fields are required.",
        variant: "destructive",
      })
    );
  });

  it("rejects mismatched new and confirm passwords", async () => {
    render(<ProfileSettings />);

    const currentPwInput = screen.getByLabelText(/^Current Password/i);
    const newPwInput = screen.getByLabelText(/^New Password/i);
    const confirmPwInput = screen.getByLabelText(/^Confirm New Password/i);

    fireEvent.change(currentPwInput, { target: { value: "OldPassword123" } });
    fireEvent.change(newPwInput, { target: { value: "NewPassword456" } });
    fireEvent.change(confirmPwInput, { target: { value: "DifferentPassword789" } });

    const updateBtn = screen.getByRole("button", { name: /Update Password/i });
    fireEvent.click(updateBtn);

    expect(authApi.changePassword).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Password Mismatch",
        description: "New password and confirm password do not match.",
        variant: "destructive",
      })
    );
  });

  it("rejects password shorter than 6 characters", async () => {
    render(<ProfileSettings />);

    const currentPwInput = screen.getByLabelText(/^Current Password/i);
    const newPwInput = screen.getByLabelText(/^New Password/i);
    const confirmPwInput = screen.getByLabelText(/^Confirm New Password/i);

    fireEvent.change(currentPwInput, { target: { value: "OldPassword123" } });
    fireEvent.change(newPwInput, { target: { value: "12345" } });
    fireEvent.change(confirmPwInput, { target: { value: "12345" } });

    const updateBtn = screen.getByRole("button", { name: /Update Password/i });
    fireEvent.click(updateBtn);

    expect(authApi.changePassword).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Weak Password",
        description: "Password must be at least 6 characters.",
        variant: "destructive",
      })
    );
  });

  it("updates password successfully via authApi.changePassword", async () => {
    vi.mocked(authApi.changePassword).mockResolvedValueOnce({
      message: "Password updated successfully",
    });

    render(<ProfileSettings />);

    const currentPwInput = screen.getByLabelText(/^Current Password/i) as HTMLInputElement;
    const newPwInput = screen.getByLabelText(/^New Password/i) as HTMLInputElement;
    const confirmPwInput = screen.getByLabelText(/^Confirm New Password/i) as HTMLInputElement;

    fireEvent.change(currentPwInput, { target: { value: "CurrentSecret123" } });
    fireEvent.change(newPwInput, { target: { value: "BrandNewSecret456" } });
    fireEvent.change(confirmPwInput, { target: { value: "BrandNewSecret456" } });

    const updateBtn = screen.getByRole("button", { name: /Update Password/i });
    fireEvent.click(updateBtn);

    await waitFor(() => {
      expect(authApi.changePassword).toHaveBeenCalledWith({
        currentPassword: "CurrentSecret123",
        newPassword: "BrandNewSecret456",
      });
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Password Updated",
        })
      );
      expect(currentPwInput.value).toBe("");
      expect(newPwInput.value).toBe("");
      expect(confirmPwInput.value).toBe("");
    });
  });
});

describe("Phase 8.2: Authority Assigned Complaints Workflow", () => {
  const dummyComplaints: ComplaintRecord[] = [
    {
      id: "comp-801",
      reference: "CMP-800801",
      title: "Broken pipeline near sector 4",
      description: "Severe water leakage onto main road",
      category: "Water Supply",
      status: "Assigned",
      createdAt: new Date().toISOString(),
      assignedTo: {
        id: "mem-1",
        name: "Officer Verma",
        department: "Water Supply",
      },
      sla: {
        slaStatus: "On Track",
        remainingMs: 100000,
        isOverdue: false,
      },
      timeline: [],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates status directly when changing to non-resolved status", async () => {
    vi.mocked(complaintsApi.listDepartment).mockResolvedValueOnce(dummyComplaints);
    vi.mocked(complaintsApi.updateStatus).mockResolvedValueOnce({
      ...dummyComplaints[0],
      status: "In Progress",
    });

    render(
      <MemoryRouter>
        <AssignedComplaints />
      </MemoryRouter>
    );

    // Wait for complaint to appear
    expect(await screen.findByText("Broken pipeline near sector 4")).toBeDefined();

    // Select status dropdown
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "In Progress" } });

    // "Update Status" button appears
    const updateBtn = await screen.findByRole("button", { name: /Update Status/i });
    fireEvent.click(updateBtn);

    await waitFor(() => {
      expect(complaintsApi.updateStatus).toHaveBeenCalledWith("comp-801", "In Progress");
    });
  });

  it("triggers ResolveComplaintDialog instead of direct status update when selecting Resolved", async () => {
    vi.mocked(complaintsApi.listDepartment).mockResolvedValueOnce(dummyComplaints);

    render(
      <MemoryRouter>
        <AssignedComplaints />
      </MemoryRouter>
    );

    expect(await screen.findByText("Broken pipeline near sector 4")).toBeDefined();

    // Select "Resolved"
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "Resolved" } });

    // The button shows "Resolve Complaint…"
    const resolveTriggerBtn = await screen.findByRole("button", { name: /Resolve Complaint…/i });
    fireEvent.click(resolveTriggerBtn);

    // Verify complaintsApi.updateStatus was NOT called directly without remarks/evidence
    expect(complaintsApi.updateStatus).not.toHaveBeenCalled();

    // Verify ResolveComplaintDialog opens
    expect(await screen.findByRole("dialog")).toBeDefined();
    expect(screen.getByText(/Resolution Remarks/i)).toBeDefined();
  });
});
