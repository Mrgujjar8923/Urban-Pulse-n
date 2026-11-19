import type { User } from "@/contexts/AuthContext";
import { apiClient } from "./apiClient";

export interface ApiNotification {
  _id: string;
  userId: string;
  message: string;
  meta?: Record<string, unknown> | string;
  read: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface PaginatedNotifications {
  data: ApiNotification[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export function getNotifications(user: User): Promise<ApiNotification[]>;
export function getNotifications(user: User, params: { page: number; limit?: number }): Promise<PaginatedNotifications>;
export function getNotifications(user: User, params?: { page?: number; limit?: number }): Promise<ApiNotification[] | PaginatedNotifications>;
export async function getNotifications(
  user: User,
  params?: { page?: number; limit?: number }
): Promise<ApiNotification[] | PaginatedNotifications> {
  void user;
  const searchParams = new URLSearchParams();
  if (params?.page !== undefined) searchParams.set("page", String(params.page));
  if (params?.limit !== undefined) searchParams.set("limit", String(params.limit));
  const query = searchParams.toString();
  const url = query ? `/api/notifications?${query}` : "/api/notifications";
  return apiClient.get(url);
}

export const markAsRead = async (user: User, id: string, read = true): Promise<ApiNotification> => {
  void user;
  return apiClient.put(`/api/notifications/${id}/read`, { read });
};

export const markAllAsRead = async (user: User): Promise<void> => {
  void user;
  await apiClient.put("/api/notifications/read-all", {});
};

export const clearNotifications = async (user: User): Promise<void> => {
  void user;
  await apiClient.delete("/api/notifications/clear");
};
