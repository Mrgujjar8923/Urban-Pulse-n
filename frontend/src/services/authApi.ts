import { apiClient } from "./apiClient";

export interface AuthApiPayload {
  name?: string;
  email: string;
  password: string;
  role?: "citizen" | "department" | "admin";
  department?: string;
  departmentRole?: "authority" | "officer";
}

export interface AuthApiUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: "citizen" | "department" | "admin";
  avatar?: string | null;
  department?: string | null;
  departmentRole?: "authority" | "officer" | null;
  status?: "active" | "pending" | "rejected";
  isOfficer?: boolean;
  memberId?: string | null;
  memberName?: string | null;
}

export interface AuthApiResponse {
  token?: string;
  message?: string;
  user: AuthApiUser;
}

export interface OfficerOption {
  id: string;
  name: string;
  email: string;
  department: string;
  status: string;
  isLinked: boolean;
  statusBadge: string;
}

export const authApi = {
  login(payload: AuthApiPayload) {
    return apiClient.post("/api/auth/login", payload) as Promise<AuthApiResponse>;
  },
  register(payload: AuthApiPayload) {
    return apiClient.post("/api/auth/register", payload) as Promise<AuthApiResponse>;
  },
  getMe() {
    return apiClient.get("/api/auth/me") as Promise<{ user: AuthApiUser }>;
  },
  getOfficerOptions(department?: string) {
    const query = department ? `?department=${encodeURIComponent(department)}` : "";
    return apiClient.get(`/api/auth/officer-options${query}`) as Promise<OfficerOption[]>;
  },
  updateProfile(payload: { name: string; phone?: string }) {
    return apiClient.put("/api/auth/profile", payload) as Promise<{ message: string; user: AuthApiUser }>;
  },
  changePassword(payload: { currentPassword: string; newPassword: string }) {
    return apiClient.put("/api/auth/change-password", payload) as Promise<{ message: string }>;
  },
  forgotPassword(payload: { email: string }) {
    return apiClient.post("/api/auth/forgot-password", payload) as Promise<{ message: string }>;
  },
  resetPassword(payload: { token: string; password: string }) {
    return apiClient.post("/api/auth/reset-password", payload) as Promise<{ message: string }>;
  },
};
