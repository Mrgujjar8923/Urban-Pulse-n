import React, { type PropsWithChildren } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { authApiMock } = vi.hoisted(() => ({
  authApiMock: {
    login: vi.fn(),
    getMe: vi.fn(),
    register: vi.fn(),
  },
}));

vi.mock("@/services/authApi", () => ({ authApi: authApiMock }));

import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { notifyUnauthorized, ApiError } from "@/services/apiClient";

const wrapper = ({ children }: PropsWithChildren) => <AuthProvider>{children}</AuthProvider>;

const officerApiUser = {
  id: "officer-user-id",
  name: "Road Demo Login",
  email: "road.demo@govai.gov",
  role: "department" as const,
  department: "Road & Infrastructure",
  departmentRole: "officer" as const,
  status: "active" as const,
  memberId: "priya-member-id",
  memberName: "Officer Priya",
};

describe("authentication session lifecycle", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    authApiMock.login.mockReset();
    authApiMock.getMe.mockReset();
    authApiMock.register.mockReset();
  });

  it("stores the authenticated department role and Member identity on login, then clears them on logout", async () => {
    authApiMock.login.mockResolvedValue({ token: "test-session-token", user: officerApiUser });
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.login("road.demo@govai.gov", "provided-password", "authority", "Road & Infrastructure", "officer");
    });

    expect(authApiMock.login).toHaveBeenCalledWith(expect.objectContaining({
      role: "department",
      department: "Road & Infrastructure",
      departmentRole: "officer",
    }));
    expect(result.current.user?.departmentRole).toBe("officer");
    expect(result.current.user?.memberName).toBe("Officer Priya");
    expect(localStorage.getItem("govai_token")).toBe("test-session-token");

    act(() => result.current.logout());
    expect(result.current.user).toBeNull();
    expect(localStorage.getItem("govai_token")).toBeNull();
    expect(localStorage.getItem("govai_user")).toBeNull();
  });

  it("restores the authenticated account from the server when a session token exists", async () => {
    localStorage.setItem("govai_token", "restorable-token");
    localStorage.setItem("govai_user", JSON.stringify({ ...officerApiUser, role: "authority" }));
    authApiMock.getMe.mockResolvedValue({ user: officerApiUser });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.user?.memberName).toBe("Officer Priya"));
    expect(authApiMock.getMe).toHaveBeenCalledOnce();
  });

  it("HTTP 401 on protected request triggers session eviction (token and user cleared)", async () => {
    localStorage.setItem("govai_token", "active-session-token");
    localStorage.setItem("govai_user", JSON.stringify({ ...officerApiUser, role: "authority" }));
    authApiMock.getMe.mockResolvedValue({ user: officerApiUser });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.user).not.toBeNull());

    act(() => {
      notifyUnauthorized();
    });

    expect(result.current.user).toBeNull();
    expect(localStorage.getItem("govai_token")).toBeNull();
    expect(localStorage.getItem("govai_user")).toBeNull();
  });

  it("HTTP 403 authorization denial does NOT evict the authenticated session", async () => {
    localStorage.setItem("govai_token", "active-session-token");
    localStorage.setItem("govai_user", JSON.stringify({ ...officerApiUser, role: "authority" }));
    authApiMock.getMe.mockRejectedValue(new ApiError(403, "Forbidden"));

    const { result } = renderHook(() => useAuth(), { wrapper });
    
    expect(localStorage.getItem("govai_token")).toBe("active-session-token");
    expect(result.current.user?.id).toBe("officer-user-id");
  });
});
