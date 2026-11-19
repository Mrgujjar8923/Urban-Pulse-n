import { apiClient } from "./apiClient";

export interface AdminUserRecord {
  id: string;
  name: string;
  email: string;
  role: "citizen" | "department" | "admin";
  department?: string | null;
  departmentRole?: "authority" | "officer" | null;
  status: "active" | "pending" | "rejected";
  complaintsCount: number;
  createdAt?: string;
  isOfficer?: boolean;
  memberId?: string | null;
  memberName?: string | null;
  memberLinked?: boolean;
}

export interface DepartmentRequestRecord {
  id: string;
  name: string;
  email: string;
  department?: string | null;
  departmentRole?: "authority" | "officer" | null;
  status: "active" | "pending" | "rejected";
  appliedAt?: string;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
}

export interface AdminOverviewMetrics {
  totalComplaints: number;
  pendingComplaints: number;
  assignedComplaints: number;
  inProgressComplaints: number;
  resolvedComplaints: number;
  overdueComplaints: number;
  resolutionRate: number;
  totalCitizens: number;
  totalAuthorities: number;
  totalOfficers: number;
  totalUsers: number;
}

export interface AdminDepartmentBreakdownItem {
  department: string;
  total: number;
  pending: number;
  assigned: number;
  inProgress: number;
  resolved: number;
  resolutionRate: number;
}

export interface AdminMonthlyTrendItem {
  year: number;
  month: number;
  label: string;
  submitted: number;
  resolved: number;
}

export interface AdminOverviewStats {
  metrics: AdminOverviewMetrics;
  departmentBreakdown: AdminDepartmentBreakdownItem[];
  statusDistribution: Array<{ name: string; value: number }>;
  monthlyTrend: AdminMonthlyTrendItem[];
  appliedFilters: {
    dateRange: string;
    department: string;
  };
}

export interface DepartmentPerformanceRecord {
  department: string;
  total: number;
  pending: number;
  assigned: number;
  inProgress: number;
  resolved: number;
  overdue: number;
  resolutionRate: number;
  avgResolutionHours: number;
  feedbackCount: number;
  avgRating: number;
  membersCount: number;
}

export interface AdminFeedbackItem {
  complaintId: string;
  title: string;
  category: string;
  location: string;
  citizen: { name: string; email: string } | null;
  assignedOfficer: { name: string; department?: string } | null;
  rating: number;
  comment: string;
  workCompleted: boolean;
  percentDone: number;
  image?: string;
  createdAt: string;
}

export interface AdminFeedbackResponse {
  summary: {
    totalFeedbacks: number;
    avgRating: number;
    percentSatisfied: number;
    completedCount: number;
    ratingDistribution: Record<number, number>;
  };
  feedbacks: AdminFeedbackItem[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
  };
}

export interface AnalyticsTrendPoint {
  period: string;
  submitted: number;
  resolved: number;
  pending: number;
  inProgress: number;
  assigned: number;
}

export interface AnalyticsTrendComparison {
  currentPeriodSubmitted: number;
  previousPeriodSubmitted: number;
  percentChange: number;
  trendDirection: "up" | "down" | "flat";
  previousPeriodStart?: string;
  previousPeriodEnd?: string;
}

export interface AnalyticsDepartmentItem {
  department: string;
  total: number;
  pending: number;
  assigned: number;
  inProgress: number;
  resolved: number;
  overdue: number;
  resolutionRate: number;
  slaComplianceRate: number;
  avgResolutionHours: number;
  workloadShare: number;
}

export interface AnalyticsAgeingBucket {
  range: string;
  count: number;
  percentage: number;
}

export interface AnalyticsResolutionData {
  avgResolutionHours: number;
  medianResolutionHours: number;
  fastestDepartment: { department: string; avgHours: number } | null;
  slowestDepartment: { department: string; avgHours: number } | null;
  unresolvedCount: number;
  ageingBuckets: AnalyticsAgeingBucket[];
}

export interface AnalyticsSlaData {
  totalTracked: number;
  compliantWithSla: number;
  breached: number;
  complianceRate: number;
  totalEscalations: number;
}

export interface AnalyticsPriorityItem {
  priority: "Critical" | "High" | "Medium" | "Low" | "Unknown";
  count: number;
  percentage: number;
  resolved: number;
  overdue: number;
  resolutionRate: number;
  avgResolutionHours: number;
}

export interface AdminAnalyticsSummary {
  totalComplaints: number;
  resolvedCount: number;
  pendingCount: number;
  assignedCount: number;
  inProgressCount: number;
  activeBacklog: number;
  overdueCount: number;
  resolutionRate: number;
  slaComplianceRate: number;
  avgResolutionHours: number;
  avgResolutionDays: number;
  medianResolutionHours: number;
  medianResolutionDays: number;
  criticalCount: number;
  totalEscalations: number;
  avgUrgencyScore: number;
}

export interface AdminAnalyticsResponse {
  summary: AdminAnalyticsSummary;
  trends: {
    interval: "daily" | "weekly" | "monthly";
    points: AnalyticsTrendPoint[];
    comparison: AnalyticsTrendComparison | null;
  };
  departments: AnalyticsDepartmentItem[];
  resolution: AnalyticsResolutionData;
  sla: AnalyticsSlaData;
  priority: {
    breakdown: AnalyticsPriorityItem[];
  };
  appliedFilters: {
    dateRange: string;
    department: string;
    interval: string;
  };
}

export interface PaginationMetadata {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMetadata;
}

function listUsers(): Promise<AdminUserRecord[]>;
function listUsers(params: { page: number; limit?: number } | { page?: number; limit: number }): Promise<PaginatedResponse<AdminUserRecord>>;
function listUsers(params?: { page?: number; limit?: number }): Promise<AdminUserRecord[] | PaginatedResponse<AdminUserRecord>>;
async function listUsers(params?: { page?: number; limit?: number }): Promise<AdminUserRecord[] | PaginatedResponse<AdminUserRecord>> {
  let query = "";
  if (params) {
    const searchParams = new URLSearchParams();
    if (params.page !== undefined) searchParams.set("page", String(params.page));
    if (params.limit !== undefined) searchParams.set("limit", String(params.limit));
    const str = searchParams.toString();
    if (str) query = `?${str}`;
  }
  const data = await apiClient.get(`/api/auth/users${query}`);
  if (Array.isArray(data)) {
    return data as AdminUserRecord[];
  }
  if (data && Array.isArray(data.data)) {
    return {
      data: data.data as AdminUserRecord[],
      pagination: data.pagination as PaginationMetadata,
    };
  }
  return [];
}

export const adminApi = {
  listUsers,
  async listDepartmentRequests() {
    const data = await apiClient.get("/api/auth/department-requests");
    return Array.isArray(data) ? (data as DepartmentRequestRecord[]) : [];
  },
  async reviewDepartmentRequest(id: string, status?: "active" | "rejected", departmentRole?: "authority" | "officer") {
    const body: { status?: "active" | "rejected"; departmentRole?: "authority" | "officer" } = {};
    if (status) body.status = status;
    if (departmentRole) body.departmentRole = departmentRole;
    const data = await apiClient.put(`/api/auth/department-requests/${id}`, body);
    return data as DepartmentRequestRecord;
  },
  async updateDepartmentRole(id: string, departmentRole: "authority" | "officer") {
    const data = await apiClient.put(`/api/auth/users/${id}/department-role`, { departmentRole });
    return data;
  },
  async getOverviewStats(params?: {
    dateRange?: string;
    department?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<AdminOverviewStats> {
    const searchParams = new URLSearchParams();
    if (params?.dateRange) searchParams.set("dateRange", params.dateRange);
    if (params?.department) searchParams.set("department", params.department);
    if (params?.startDate) searchParams.set("startDate", params.startDate);
    if (params?.endDate) searchParams.set("endDate", params.endDate);

    const query = searchParams.toString();
    const endpoint = query ? `/api/admin/stats?${query}` : "/api/admin/stats";
    return apiClient.get(endpoint) as Promise<AdminOverviewStats>;
  },
  async getDepartmentPerformance(): Promise<DepartmentPerformanceRecord[]> {
    const data = await apiClient.get("/api/admin/departments");
    return Array.isArray(data) ? (data as DepartmentPerformanceRecord[]) : [];
  },
  async getFeedback(params?: {
    page?: number;
    limit?: number;
    department?: string;
    minRating?: number;
  }): Promise<AdminFeedbackResponse> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set("page", params.page.toString());
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.department) searchParams.set("department", params.department);
    if (params?.minRating) searchParams.set("minRating", params.minRating.toString());

    const query = searchParams.toString();
    const endpoint = query ? `/api/admin/feedback?${query}` : "/api/admin/feedback";
    return apiClient.get(endpoint) as Promise<AdminFeedbackResponse>;
  },
  async getAnalytics(params?: {
    dateRange?: string;
    department?: string;
    startDate?: string;
    endDate?: string;
    interval?: string;
  }): Promise<AdminAnalyticsResponse> {
    const searchParams = new URLSearchParams();
    if (params?.dateRange) searchParams.set("dateRange", params.dateRange);
    if (params?.department) searchParams.set("department", params.department);
    if (params?.startDate) searchParams.set("startDate", params.startDate);
    if (params?.endDate) searchParams.set("endDate", params.endDate);
    if (params?.interval) searchParams.set("interval", params.interval);

    const query = searchParams.toString();
    const endpoint = query ? `/api/admin/analytics?${query}` : "/api/admin/analytics";
    return apiClient.get(endpoint) as Promise<AdminAnalyticsResponse>;
  },
  async getAnalyticsTrends(params?: {
    dateRange?: string;
    department?: string;
    interval?: string;
  }): Promise<{ interval: string; points: AnalyticsTrendPoint[]; comparison: AnalyticsTrendComparison | null }> {
    const searchParams = new URLSearchParams();
    if (params?.dateRange) searchParams.set("dateRange", params.dateRange);
    if (params?.department) searchParams.set("department", params.department);
    if (params?.interval) searchParams.set("interval", params.interval);

    const query = searchParams.toString();
    const endpoint = query ? `/api/admin/analytics/trends?${query}` : "/api/admin/analytics/trends";
    return apiClient.get(endpoint) as Promise<{ interval: string; points: AnalyticsTrendPoint[]; comparison: AnalyticsTrendComparison | null }>;
  },
  async getAnalyticsDepartments(params?: {
    dateRange?: string;
    department?: string;
  }): Promise<{ departments: AnalyticsDepartmentItem[]; totalComplaints: number }> {
    const searchParams = new URLSearchParams();
    if (params?.dateRange) searchParams.set("dateRange", params.dateRange);
    if (params?.department) searchParams.set("department", params.department);

    const query = searchParams.toString();
    const endpoint = query ? `/api/admin/analytics/departments?${query}` : "/api/admin/analytics/departments";
    return apiClient.get(endpoint) as Promise<{ departments: AnalyticsDepartmentItem[]; totalComplaints: number }>;
  },
  async getAnalyticsResolution(params?: {
    dateRange?: string;
    department?: string;
  }): Promise<AnalyticsResolutionData> {
    const searchParams = new URLSearchParams();
    if (params?.dateRange) searchParams.set("dateRange", params.dateRange);
    if (params?.department) searchParams.set("department", params.department);

    const query = searchParams.toString();
    const endpoint = query ? `/api/admin/analytics/resolution?${query}` : "/api/admin/analytics/resolution";
    return apiClient.get(endpoint) as Promise<AnalyticsResolutionData>;
  },
  async getAnalyticsSla(params?: {
    dateRange?: string;
    department?: string;
  }): Promise<AnalyticsSlaData> {
    const searchParams = new URLSearchParams();
    if (params?.dateRange) searchParams.set("dateRange", params.dateRange);
    if (params?.department) searchParams.set("department", params.department);

    const query = searchParams.toString();
    const endpoint = query ? `/api/admin/analytics/sla?${query}` : "/api/admin/analytics/sla";
    return apiClient.get(endpoint) as Promise<AnalyticsSlaData>;
  },
  async getAnalyticsPriority(params?: {
    dateRange?: string;
    department?: string;
  }): Promise<{ totalComplaints: number; avgUrgencyScore: number; priorityBreakdown: AnalyticsPriorityItem[] }> {
    const searchParams = new URLSearchParams();
    if (params?.dateRange) searchParams.set("dateRange", params.dateRange);
    if (params?.department) searchParams.set("department", params.department);

    const query = searchParams.toString();
    const endpoint = query ? `/api/admin/analytics/priority?${query}` : "/api/admin/analytics/priority";
    return apiClient.get(endpoint) as Promise<{ totalComplaints: number; avgUrgencyScore: number; priorityBreakdown: AnalyticsPriorityItem[] }>;
  },
};
