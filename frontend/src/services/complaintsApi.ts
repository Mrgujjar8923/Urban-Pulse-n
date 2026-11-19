import { apiClient } from "./apiClient";

export interface ComplaintPayload {
  title: string;
  description: string;
  category: string;
  location?: string;
  latitude?: number | null;
  longitude?: number | null;
  image?: string;
  clientRequestId?: string;
}

export interface AIAnalysisRecord {
  status?: "pending" | "completed" | "failed" | "manual_review_required";
  errorCategory?: string | null;
  errorMessage?: string | null;
  retryCount?: number;
  lastAttemptAt?: string | null;
  model?: string | null;
  detectedLanguage?: string;
  englishTranslation?: string;
  category?: string;
  priority?: string;
  urgencyScore?: number;
  confidence?: number;
  reasoning?: string;
  detectedIssue?: string;
  affectedArea?: string;
  recommendedDepartment?: string;
  recommendedAction?: string;
  analyzedAt?: string;
}

export interface LinkedUserRecord {
  id?: string;
  _id?: string;
  name: string;
  email: string;
  department?: string;
  departmentRole?: string;
  role?: string;
  status?: string;
}

export interface EligibleUser {
  id: string;
  name: string;
  email: string;
  department: string;
  status: string;
  isLinked: boolean;
  linkedMember: { memberId: string; memberName: string } | null;
}

export interface MemberRecord {
  id: string;
  _id?: string;
  name: string;
  department: string;
  userId?: LinkedUserRecord | string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface OfficerPerformanceRecord {
  id: string;
  _id?: string;
  name: string;
  department: string;
  status: "active" | "inactive";
  isLinked: boolean;
  linkedUser: {
    id: string;
    name: string;
    email: string;
    status: string;
  } | null;
  assignedComplaints: number;
  resolvedComplaints: number;
  pendingComplaints: number;
  resolutionRate: number;
  avgRating: number | null;
  feedbackCount: number;
}

export interface DepartmentPerformanceSummary {
  totalOfficers: number;
  activeOfficers: number;
  totalAssignedComplaints: number;
  resolvedComplaints: number;
  pendingComplaints: number;
  authorityResolvedComplaints: number;
  feedbackSummary: {
    totalFeedbacks: number;
    avgRating: number | null;
    percentSatisfied: number | null;
  };
}

export interface DepartmentOfficerPerformanceResponse {
  department: string;
  summary: DepartmentPerformanceSummary;
  officers: OfficerPerformanceRecord[];
}

export const isEligibleOfficerMember = (member: MemberRecord, targetDepartment?: string): boolean => {
  if (!member || !member.userId) return false;
  if (targetDepartment && member.department !== targetDepartment) return false;
  if (typeof member.userId === "object" && member.userId !== null) {
    if (member.userId.status && member.userId.status !== "active") return false;
    if (member.userId.departmentRole && member.userId.departmentRole !== "officer") return false;
    if (targetDepartment && member.userId.department && member.userId.department !== targetDepartment) return false;
  }
  return true;
};

export interface FeedbackHistoryEntry {
  id?: string;
  _id?: string;
  rating: number;
  comment?: string;
  image?: string;
  workCompleted?: boolean;
  percentDone?: number;
  resolutionId?: string | null;
  submittedAt?: string;
}

export interface FeedbackRecord {
  id: string;
  rating: number;
  comment?: string;
  image?: string;
  workCompleted: boolean;
  percentDone: number;
  resolutionId?: string | null;
  history?: FeedbackHistoryEntry[];
  createdAt: string;
  updatedAt?: string;
}

export interface ResolutionHistoryEntry {
  id: string;
  _id?: string;
  remarks: string;
  evidence?: string;
  resolvedAt: string;
  resolvedBy?: {
    id?: string;
    _id?: string;
    name?: string;
    email?: string;
    role?: string;
    department?: string;
  } | null;
}

export interface ComplaintTimelineEntry {
  eventType?: string;
  label?: string;
  status?: string;
  timestamp?: string | null;
  time?: string | null;
  note?: string;
  [key: string]: unknown;
}

export interface ComplaintSla {
  startedAt?: string;
  durationMinutes?: number;
  deadline?: string;
  resolvedAt?: string;
  slaStatus: "Resolved" | "Overdue" | "Due Soon" | "On Track" | "Unavailable";
  remainingMs: number | null;
  isOverdue: boolean;
}

export interface ComplaintRecord {
  id: string;
  reference: string;
  title: string;
  description: string;
  category: string;
  status: string;
  priority?: string;
  aiUrgencyScore?: number;
  aiAnalysis?: AIAnalysisRecord | null;
  clientRequestId?: string | null;
  _submissionMeta?: { aiStatus?: string; errorCategory?: string };
  location?: string;
  latitude?: number | null;
  longitude?: number | null;
  image?: string;
  createdAt: string;
  updatedAt?: string;
  assignedTo?: MemberRecord | null;
  createdBy?: {
    id: string;
    name: string;
    email: string;
    role: string;
    department?: string | null;
  } | null;
  feedback?: FeedbackRecord | null;
  resolutionHistory?: ResolutionHistoryEntry[];
  currentResolution?: ResolutionHistoryEntry | null;
  sla: ComplaintSla;
  timeline: ComplaintTimelineEntry[];
}

const buildReference = (id: string) => `CMP-${id.slice(-6).toUpperCase()}`;

interface RawComplaint {
  _id?: string;
  id?: string;
  reference?: string;
  title?: string;
  description?: string;
  category?: string;
  status?: string;
  priority?: string;
  aiAnalysis?: AIAnalysisRecord | null;
  clientRequestId?: string | null;
  _submissionMeta?: { aiStatus?: string; errorCategory?: string };
  location?: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
  image?: string;
  createdAt?: string;
  updatedAt?: string;
  assignedTo?: { _id?: string; id?: string; name?: string; department?: string } | null;
  createdBy?: { _id?: string; id?: string; name?: string; email?: string; role?: string; department?: string | null } | null;
  feedback?: {
    _id?: string;
    id?: string;
    rating?: number;
    comment?: string;
    image?: string;
    workCompleted?: boolean;
    percentDone?: number;
    resolutionId?: string | null;
    history?: FeedbackHistoryEntry[];
    createdAt?: string;
    updatedAt?: string;
  } | null;
  resolutionHistory?: Array<{
    _id?: string;
    id?: string;
    remarks?: string;
    evidence?: string;
    resolvedAt?: string;
    resolvedBy?: { _id?: string; id?: string; name?: string; email?: string; role?: string; department?: string } | null;
  }>;
  sla?: { startedAt?: string; durationMinutes?: number; deadline?: string; resolvedAt?: string; slaStatus?: ComplaintSla["slaStatus"]; remainingMs?: number; isOverdue?: boolean };
  timeline?: Array<ComplaintTimelineEntry & { timestamp?: string; time?: string }>;
}

export const normalizeComplaint = (complaint: RawComplaint): ComplaintRecord => {
  const id = complaint?._id || complaint?.id || "";
  const rawAi = complaint?.aiAnalysis;
  const aiAnalysis: AIAnalysisRecord | null = rawAi
    ? {
        ...rawAi,
        status: rawAi.status || (rawAi.category ? "completed" : "pending"),
      }
    : null;

  return {
    id,
    reference: complaint?.reference || buildReference(id),
    title: complaint?.title || "",
    description: complaint?.description || "",
    category: complaint?.category || "",
    status: complaint?.status || "Pending",
    priority: complaint?.aiAnalysis?.priority || complaint?.priority,
    aiUrgencyScore: complaint?.aiAnalysis?.urgencyScore,
    aiAnalysis,
    clientRequestId: complaint?.clientRequestId || null,
    _submissionMeta: complaint?._submissionMeta,
    location: complaint?.location || "",
    latitude: typeof complaint?.latitude === "number" ? complaint.latitude : (complaint?.latitude != null && !isNaN(Number(complaint.latitude)) ? Number(complaint.latitude) : null),
    longitude: typeof complaint?.longitude === "number" ? complaint.longitude : (complaint?.longitude != null && !isNaN(Number(complaint.longitude)) ? Number(complaint.longitude) : null),
    image: complaint?.image || "",
    createdAt: complaint?.createdAt || new Date().toISOString(),
    updatedAt: complaint?.updatedAt,
    assignedTo: complaint?.assignedTo
      ? {
          id: complaint.assignedTo._id || complaint.assignedTo.id,
          _id: complaint.assignedTo._id,
          name: complaint.assignedTo.name,
          department: complaint.assignedTo.department,
        }
      : null,
    createdBy: complaint?.createdBy
      ? {
          id: complaint.createdBy._id || complaint.createdBy.id,
          name: complaint.createdBy.name,
          email: complaint.createdBy.email,
          role: complaint.createdBy.role,
          department: complaint.createdBy.department,
        }
      : null,
    feedback: complaint?.feedback
      ? {
          id: complaint.feedback._id || complaint.feedback.id || "",
          rating: complaint.feedback.rating ?? 0,
          comment: complaint.feedback.comment,
          image: complaint.feedback.image,
          workCompleted: Boolean(complaint.feedback.workCompleted),
          percentDone: complaint.feedback.percentDone || 0,
          resolutionId: complaint.feedback.resolutionId || null,
          history: Array.isArray(complaint.feedback.history) ? complaint.feedback.history : [],
          createdAt: complaint.feedback.createdAt || new Date().toISOString(),
          updatedAt: complaint.feedback.updatedAt,
        }
      : null,
    resolutionHistory: Array.isArray(complaint?.resolutionHistory)
      ? complaint.resolutionHistory.map((entry) => ({
          id: entry._id || entry.id || "",
          _id: entry._id,
          remarks: entry.remarks || "",
          evidence: entry.evidence || "",
          resolvedAt: entry.resolvedAt || new Date().toISOString(),
          resolvedBy: entry.resolvedBy
            ? {
                id: entry.resolvedBy._id || entry.resolvedBy.id || "",
                _id: entry.resolvedBy._id,
                name: entry.resolvedBy.name || "",
                email: entry.resolvedBy.email || "",
                role: entry.resolvedBy.role || "",
                department: entry.resolvedBy.department || "",
              }
            : null,
        }))
      : [],
    currentResolution: (complaint?.status === "Resolved" && Array.isArray(complaint?.resolutionHistory) && complaint.resolutionHistory.length > 0)
      ? {
          id: complaint.resolutionHistory[complaint.resolutionHistory.length - 1]._id || complaint.resolutionHistory[complaint.resolutionHistory.length - 1].id || "",
          _id: complaint.resolutionHistory[complaint.resolutionHistory.length - 1]._id,
          remarks: complaint.resolutionHistory[complaint.resolutionHistory.length - 1].remarks || "",
          evidence: complaint.resolutionHistory[complaint.resolutionHistory.length - 1].evidence || "",
          resolvedAt: complaint.resolutionHistory[complaint.resolutionHistory.length - 1].resolvedAt || new Date().toISOString(),
          resolvedBy: complaint.resolutionHistory[complaint.resolutionHistory.length - 1].resolvedBy
            ? {
                id: complaint.resolutionHistory[complaint.resolutionHistory.length - 1].resolvedBy._id || complaint.resolutionHistory[complaint.resolutionHistory.length - 1].resolvedBy.id || "",
                _id: complaint.resolutionHistory[complaint.resolutionHistory.length - 1].resolvedBy._id,
                name: complaint.resolutionHistory[complaint.resolutionHistory.length - 1].resolvedBy.name || "",
                email: complaint.resolutionHistory[complaint.resolutionHistory.length - 1].resolvedBy.email || "",
                role: complaint.resolutionHistory[complaint.resolutionHistory.length - 1].resolvedBy.role || "",
                department: complaint.resolutionHistory[complaint.resolutionHistory.length - 1].resolvedBy.department || "",
              }
            : null,
        }
      : null,
    sla: {
      startedAt: complaint?.sla?.startedAt || undefined,
      durationMinutes: typeof complaint?.sla?.durationMinutes === "number"
        ? complaint.sla.durationMinutes
        : undefined,
      deadline: complaint?.sla?.deadline || undefined,
      resolvedAt: complaint?.sla?.resolvedAt || undefined,
      slaStatus: complaint?.sla?.slaStatus || "Unavailable",
      remainingMs: typeof complaint?.sla?.remainingMs === "number" ? complaint.sla.remainingMs : null,
      isOverdue: Boolean(complaint?.sla?.isOverdue),
    },
    timeline: Array.isArray(complaint?.timeline)
      ? complaint.timeline.map((entry) => {
          const timestampCandidate = entry?.timestamp || entry?.time;
          const timestamp = timestampCandidate && !Number.isNaN(new Date(timestampCandidate).getTime())
            ? new Date(timestampCandidate).toISOString()
            : null;

          return {
            ...entry,
            eventType: entry?.eventType,
            label: entry?.label,
            status: entry?.status,
            timestamp,
            time: entry?.time,
            note: entry?.note,
          };
        })
      : [],
  };
};

const toQueryString = (params?: Record<string, string | number | undefined | null>): string => {
  if (!params) return "";
  const filtered = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "");
  if (filtered.length === 0) return "";
  const searchParams = new URLSearchParams();
  for (const [k, v] of filtered) {
    searchParams.set(k, String(v));
  }
  return `?${searchParams.toString()}`;
};

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

function listMine(): Promise<ComplaintRecord[]>;
function listMine(params: { page: number; limit?: number } | { page?: number; limit: number }): Promise<PaginatedResponse<ComplaintRecord>>;
function listMine(params?: { page?: number; limit?: number }): Promise<ComplaintRecord[] | PaginatedResponse<ComplaintRecord>>;
async function listMine(params?: { page?: number; limit?: number }): Promise<ComplaintRecord[] | PaginatedResponse<ComplaintRecord>> {
  const data = await apiClient.get(`/api/complaints/my${toQueryString(params)}`);
  if (Array.isArray(data)) {
    return data.map(normalizeComplaint);
  }
  if (data && Array.isArray(data.data)) {
    return {
      data: data.data.map(normalizeComplaint),
      pagination: data.pagination as PaginationMetadata,
    };
  }
  return [];
}

function listDepartment(params?: { department?: string }): Promise<ComplaintRecord[]>;
function listDepartment(params: { page: number; limit?: number; department?: string } | { page?: number; limit: number; department?: string }): Promise<PaginatedResponse<ComplaintRecord>>;
function listDepartment(params?: { page?: number; limit?: number; department?: string }): Promise<ComplaintRecord[] | PaginatedResponse<ComplaintRecord>>;
async function listDepartment(params?: { page?: number; limit?: number; department?: string }): Promise<ComplaintRecord[] | PaginatedResponse<ComplaintRecord>> {
  const data = await apiClient.get(`/api/complaints/department${toQueryString(params)}`);
  if (Array.isArray(data)) {
    return data.map(normalizeComplaint);
  }
  if (data && Array.isArray(data.data)) {
    return {
      data: data.data.map(normalizeComplaint),
      pagination: data.pagination as PaginationMetadata,
    };
  }
  return [];
}

function listMyAssigned(): Promise<ComplaintRecord[]>;
function listMyAssigned(params: { page: number; limit?: number } | { page?: number; limit: number }): Promise<PaginatedResponse<ComplaintRecord>>;
function listMyAssigned(params?: { page?: number; limit?: number }): Promise<ComplaintRecord[] | PaginatedResponse<ComplaintRecord>>;
async function listMyAssigned(params?: { page?: number; limit?: number }): Promise<ComplaintRecord[] | PaginatedResponse<ComplaintRecord>> {
  const data = await apiClient.get(`/api/complaints/my-assigned${toQueryString(params)}`);
  if (Array.isArray(data)) {
    return data.map(normalizeComplaint);
  }
  if (data && Array.isArray(data.data)) {
    return {
      data: data.data.map(normalizeComplaint),
      pagination: data.pagination as PaginationMetadata,
    };
  }
  return [];
}

function listAll(params?: { department?: string; status?: string; priority?: string }): Promise<ComplaintRecord[]>;
function listAll(params: { page: number; limit?: number; department?: string; status?: string; priority?: string } | { page?: number; limit: number; department?: string; status?: string; priority?: string }): Promise<PaginatedResponse<ComplaintRecord>>;
function listAll(params?: { page?: number; limit?: number; department?: string; status?: string; priority?: string }): Promise<ComplaintRecord[] | PaginatedResponse<ComplaintRecord>>;
async function listAll(params?: { page?: number; limit?: number; department?: string; status?: string; priority?: string }): Promise<ComplaintRecord[] | PaginatedResponse<ComplaintRecord>> {
  const data = await apiClient.get(`/api/complaints${toQueryString(params)}`);
  if (Array.isArray(data)) {
    return data.map(normalizeComplaint);
  }
  if (data && Array.isArray(data.data)) {
    return {
      data: data.data.map(normalizeComplaint),
      pagination: data.pagination as PaginationMetadata,
    };
  }
  return [];
}

export const complaintsApi = {
  async create(payload: ComplaintPayload | FormData) {
    const data = await apiClient.post("/api/complaints", payload);
    return normalizeComplaint(data);
  },
  async getEvidenceBlob(id: string): Promise<Blob> {
    return apiClient.getBlob(`/api/complaints/${id}/evidence`);
  },
  listMine,
  async getById(id: string) {
    const data = await apiClient.get(`/api/complaints/${id}`);
    return normalizeComplaint(data);
  },
  listDepartment,
  listMyAssigned,
  listAll,
  async updateStatus(
    id: string,
    payload: string | { status: string; remarks?: string } | FormData,
    remarks?: string,
    evidenceFile?: File | null
  ) {
    let data;
    if (payload instanceof FormData) {
      data = await apiClient.put(`/api/complaints/${id}/status`, payload);
    } else if (evidenceFile) {
      const formData = new FormData();
      const statusStr = typeof payload === "string" ? payload : payload.status;
      const remarksStr = remarks || (typeof payload === "object" ? payload.remarks : "");
      formData.append("status", statusStr);
      if (remarksStr) formData.append("remarks", remarksStr.trim());
      formData.append("image", evidenceFile);
      data = await apiClient.put(`/api/complaints/${id}/status`, formData);
    } else if (typeof payload === "object") {
      data = await apiClient.put(`/api/complaints/${id}/status`, payload);
    } else {
      const body: { status: string; remarks?: string } = { status: payload };
      if (remarks && remarks.trim()) body.remarks = remarks.trim();
      data = await apiClient.put(`/api/complaints/${id}/status`, body);
    }
    return normalizeComplaint(data);
  },
  async getResolutionEvidenceBlob(id: string, entryId?: string): Promise<Blob> {
    const query = entryId ? `?entryId=${encodeURIComponent(entryId)}` : "";
    return apiClient.getBlob(`/api/complaints/${id}/resolution-evidence${query}`);
  },
  async assign(id: string, memberId: string) {
    const data = await apiClient.put(`/api/complaints/${id}/assign`, { memberId });
    return normalizeComplaint(data);
  },
  async retryAiAnalysis(id: string) {
    const data = await apiClient.post(`/api/complaints/${id}/retry-ai`, {});
    return normalizeComplaint(data?.complaint || data);
  },
  async delete(id: string) {
    await apiClient.delete(`/api/complaints/${id}`);
  },
};

export const feedbackApi = {
  submit(data: {
    complaintId: string;
    rating: number;
    comment?: string;
    image?: string;
    workCompleted: boolean;
    percentDone?: number;
  }) {
    return apiClient.post("/api/feedback", data);
  },
};

export const membersApi = {
  async list(department?: string): Promise<MemberRecord[]> {
    const query = department ? `?department=${encodeURIComponent(department)}` : "";
    const data = await apiClient.get(`/api/members${query}`);
    return Array.isArray(data)
      ? data.map((member: {
          _id?: string;
          id?: string;
          name: string;
          department: string;
          createdAt?: string;
          updatedAt?: string;
          userId?: string | null | {
            _id?: string;
            id?: string;
            name: string;
            email: string;
            department?: string;
            departmentRole?: string;
            role?: string;
            status?: string;
          };
        }) => ({
          id: member._id || member.id,
          _id: member._id,
          name: member.name,
          department: member.department,
          createdAt: member.createdAt,
          updatedAt: member.updatedAt,
          userId: member.userId && typeof member.userId === "object"
            ? {
                id: member.userId._id || member.userId.id,
                _id: member.userId._id,
                name: member.userId.name,
                email: member.userId.email,
                department: member.userId.department,
                departmentRole: member.userId.departmentRole,
                role: member.userId.role,
                status: member.userId.status,
              }
            : member.userId || null,
        }))
      : [];
  },
  async create(name: string, userId?: string | null, department?: string) {
    const data = await apiClient.post("/api/members", {
      name,
      ...(userId ? { userId } : {}),
      ...(department ? { department } : {}),
    });
    return {
      id: data._id || data.id,
      _id: data._id,
      name: data.name,
      department: data.department,
      userId: data.userId || null,
    } as MemberRecord;
  },
  async update(id: string, updates: { name?: string; userId?: string | null; unlinkUser?: boolean }) {
    const data = await apiClient.put(`/api/members/${id}`, updates);
    return {
      id: data._id || data.id,
      _id: data._id,
      name: data.name,
      department: data.department,
      userId: data.userId || null,
    } as MemberRecord;
  },
  async listEligibleUsers(department?: string): Promise<EligibleUser[]> {
    const query = department ? `?department=${encodeURIComponent(department)}` : "";
    const data = await apiClient.get(`/api/members/eligible-users${query}`);
    return Array.isArray(data) ? (data as EligibleUser[]) : [];
  },
  async getPerformance(): Promise<DepartmentOfficerPerformanceResponse> {
    const data = await apiClient.get("/api/members/performance");
    return data as DepartmentOfficerPerformanceResponse;
  },
};

export const notificationApi = {
  list() {
    return apiClient.get("/api/notifications");
  },
};
