import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  ArrowLeft,
  Brain,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Clock,
  Loader2,
  MapPin,
  Route,
  ShieldAlert,
  User,
  UserRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge, PriorityBadge } from "@/components/shared/StatusBadge";
import { complaintsApi, ComplaintRecord, membersApi, MemberRecord, normalizeComplaint, isEligibleOfficerMember } from "@/services/complaintsApi";
import { apiClient, ApiError } from "@/services/apiClient";
import { ComplaintEvidenceViewer } from "@/components/shared/ComplaintEvidenceViewer";
import { ResolveComplaintDialog } from "@/components/shared/ResolveComplaintDialog";
import { cn } from "@/lib/utils";

type AIAnalysis = {
  status?: "pending" | "completed" | "failed" | "manual_review_required";
  errorCategory?: string | null;
  errorMessage?: string | null;
  detectedLanguage?: string;
  englishTranslation?: string;
  category?: string;
  priority?: string;
  urgencyScore?: number;
  confidence?: number;
  detectedIssue?: string;
  affectedArea?: string;
  recommendedDepartment?: string;
  recommendedAction?: string;
  reasoning?: string;
};

type AuthorityComplaint = ComplaintRecord & { aiAnalysis?: AIAnalysis | null };

const STATUS_OPTIONS = ["Pending", "Assigned", "In Progress", "Resolved"];
const OPERATIONAL_EVENTS = new Set([
  "complaint_created",
  "ai_category_classified",
  "ai_priority_detected",
  "ai_analysis_unavailable",
  "ai_analysis_retried",
  "ai_manual_review_required",
  "department_assigned",
  "officer_assigned",
  "officer_reassigned",
  "status_changed",
  "sla_started",
  "sla_overdue_escalated",
]);

const slaStatusClass: Record<string, string> = {
  "On Track": "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-400",
  "Due Soon": "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400",
  Overdue: "border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400",
  Resolved: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400",
  Unavailable: "border-slate-200 bg-slate-50 text-slate-500 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-400",
};

const formatRemaining = (remainingMs: number | null) => {
  if (remainingMs === null) return "Unavailable";
  if (remainingMs < 0) return `${Math.ceil(Math.abs(remainingMs) / 3600000)}h overdue`;
  const hours = Math.floor(remainingMs / 3600000);
  const days = Math.floor(hours / 24);
  return days > 0 ? `${days}d ${hours % 24}h remaining` : `${Math.max(1, hours)}h remaining`;
};

const eventLabel = (event: ComplaintRecord["timeline"][number]) => (
  event.label || event.eventType?.replace(/_/g, " ") || event.status || "Operational event"
);

const eventIcon = (event: ComplaintRecord["timeline"][number]) => {
  const key = `${event.eventType || ""} ${event.label || ""}`.toLowerCase();
  if (key.includes("officer") || key.includes("assign")) return UserRound;
  if (key.includes("sla")) return ShieldAlert;
  if (key.includes("status")) return CheckCircle2;
  if (key.includes("department")) return Route;
  return ClipboardList;
};

const AuthorityComplaintDetail: React.FC = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const [complaint, setComplaint] = useState<AuthorityComplaint | null>(null);
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [retryingAi, setRetryingAi] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState("");
  const [selectedMember, setSelectedMember] = useState("");
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);

  useEffect(() => {
    if (!id) return;

    let isMounted = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      setErrorStatus(null);
      try {
        const rawComplaint = await apiClient.get(`/api/complaints/${id}`);
        if (!isMounted) return;
        const normalized = normalizeComplaint(rawComplaint);
        setComplaint({ ...normalized, aiAnalysis: rawComplaint?.aiAnalysis || null });
        setSelectedStatus(normalized.status);
        setSelectedMember(normalized.assignedTo?.id || "");

        // Only department authorities and admins have access to list department members for assignment.
        // Officers cannot reassign complaints, so we do not call membersApi.list() for officers.
        const canManageMembers = user?.role === "admin" || (user?.role === "authority" && user?.departmentRole === "authority");
        if (canManageMembers) {
          try {
            const departmentMembers = await membersApi.list();
            if (isMounted) setMembers(Array.isArray(departmentMembers) ? departmentMembers : []);
          } catch {
            if (isMounted) setMembers([]);
          }
        } else {
          if (isMounted) setMembers([]);
        }
      } catch (err: unknown) {
        if (!isMounted) return;
        setComplaint(null);
        if (err instanceof ApiError) {
          setErrorStatus(err.status);
          setError(err.message || "Failed to load complaint.");
        } else if (err instanceof Error) {
          setErrorStatus(500);
          setError(err.message);
        } else {
          setErrorStatus(500);
          setError("Unable to load this complaint.");
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void load();
    return () => {
      isMounted = false;
    };
  }, [id, user?.role, user?.departmentRole]);

  const operationalTimeline = useMemo(
    () => (complaint?.timeline || []).filter((event) => OPERATIONAL_EVENTS.has(event.eventType || "")),
    [complaint]
  );

  const eligibleMembers = useMemo(() => {
    const targetDept = complaint?.category || user?.department;
    return members.filter((member) => isEligibleOfficerMember(member, targetDept));
  }, [members, complaint?.category, user?.department]);

  const updateComplaint = async (action: () => Promise<ComplaintRecord>) => {
    if (updating) return;
    setUpdating(true);
    setError(null);
    try {
      const updated = await action();
      setComplaint((current) => current ? { ...updated, aiAnalysis: current.aiAnalysis } : updated);
      setSelectedStatus(updated.status);
      setSelectedMember(updated.assignedTo?.id || "");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to update complaint.");
      setSelectedStatus(complaint.status);
      setSelectedMember(complaint.assignedTo?.id || "");
    } finally {
      setUpdating(false);
    }
  };

  const canRetryAi =
    user?.role === "admin" ||
    (user?.role === "authority" &&
      user?.departmentRole === "authority" &&
      complaint?.category &&
      user?.department === complaint.category);

  const handleRetryAi = async () => {
    if (retryingAi || !complaint) return;
    setRetryingAi(true);
    setError(null);
    try {
      const updated = await complaintsApi.retryAiAnalysis(complaint.id);
      setComplaint(updated);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to retry AI analysis.");
    } finally {
      setRetryingAi(false);
    }
  };

  const isOfficer = user?.isOfficer || user?.departmentRole !== "authority";
  const backLink = isOfficer ? "/department" : "/department/assigned";

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-3">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
        <p className="text-sm font-medium text-muted-foreground">Loading complaint details...</p>
      </div>
    );
  }

  if (!complaint) {
    const errorTitle = errorStatus === 403
      ? "Access Restricted (403)"
      : errorStatus === 404
      ? "Complaint Not Found (404)"
      : errorStatus === 401
      ? "Authentication Required (401)"
      : errorStatus === 500
      ? "Server Error (500)"
      : "Complaint Unavailable";

    return (
      <div className="mx-auto max-w-md py-20 text-center space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h2 className="text-xl font-heading font-bold text-foreground">{errorTitle}</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {error || "This complaint is unavailable or you do not have permission to access it."}
        </p>
        <div className="pt-2">
          <Link
            to={backLink}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Back to complaints
          </Link>
        </div>
      </div>
    );
  }

  const ai = complaint.aiAnalysis;
  const statusChanged = selectedStatus !== complaint.status;
  const memberChanged = selectedMember !== (complaint.assignedTo?.id || "");

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-8">
      <Link
        to={isOfficer ? "/department" : "/department/assigned"}
        className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to complaints
      </Link>

      <section className="rounded-2xl border border-blue-200/80 bg-blue-50/60 p-5 dark:border-blue-500/20 dark:bg-blue-500/[0.06] sm:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="font-mono text-[11px]">{complaint.reference}</Badge>
              <StatusBadge status={complaint.status} />
              <Badge variant="outline">Department operations</Badge>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">{complaint.title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">Operational view for {complaint.category}</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              aria-label="Change complaint status"
              value={selectedStatus}
              disabled={updating}
              onChange={(event) => {
                const nextStatus = event.target.value;
                setSelectedStatus(nextStatus);
                if (nextStatus === "Resolved") {
                  setResolveDialogOpen(true);
                }
              }}
              className="rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground"
            >
              {STATUS_OPTIONS.map((status) => <option key={status}>{status}</option>)}
            </select>
            {statusChanged && (
              <Button
                size="sm"
                disabled={updating}
                onClick={() => {
                  if (selectedStatus === "Resolved") {
                    setResolveDialogOpen(true);
                  } else {
                    void updateComplaint(() => complaintsApi.updateStatus(complaint.id, selectedStatus));
                  }
                }}
              >
                {updating ? "Updating..." : "Update status"}
              </Button>
            )}
          </div>
        </div>
      </section>

      {error && <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card className="overflow-hidden">
          <div className="border-b border-border px-5 py-4">
            <h2 className="font-heading font-bold text-foreground">Complaint overview</h2>
            <p className="text-xs text-muted-foreground">Information needed to act on this case</p>
          </div>
          <div className="space-y-5 p-5">
            <p className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground/80">{complaint.description}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { icon: MapPin, label: "Location", value: complaint.location || "Not provided" },
                { icon: Calendar, label: "Submitted", value: new Date(complaint.createdAt).toLocaleString() },
                { icon: Route, label: "Department", value: complaint.category },
                { icon: User, label: "Assigned officer", value: complaint.assignedTo?.name || "Unassigned" },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="rounded-xl border border-border bg-muted/20 p-3">
                  <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <Icon className="h-3.5 w-3.5 text-primary" /> {label}
                  </div>
                  <p className="break-words text-sm font-medium text-foreground">{value}</p>
                </div>
              ))}
            </div>

            <div className="space-y-2 border-t border-border pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Attached Photo Evidence</h3>
              <ComplaintEvidenceViewer complaintId={complaint.id} imageKey={complaint.image} />
            </div>
            {!(user?.isOfficer || user?.departmentRole !== "authority") && (
              <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-center">
                <label htmlFor="assigned-officer" className="text-sm font-medium text-foreground">Assign officer</label>
                {eligibleMembers.length > 0 ? (
                  <select
                    id="assigned-officer"
                    value={selectedMember}
                    disabled={updating}
                    onChange={(event) => setSelectedMember(event.target.value)}
                    className="rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground sm:ml-auto"
                  >
                    {!complaint.assignedTo && <option value="" disabled>Unassigned</option>}
                    {eligibleMembers.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                  </select>
                ) : (
                  <span className="text-xs font-medium text-amber-600 dark:text-amber-400 sm:ml-auto">
                    No linked officers available in this department
                  </span>
                )}
                {memberChanged && eligibleMembers.length > 0 && (
                  <Button size="sm" disabled={updating || !selectedMember} onClick={() => updateComplaint(() => complaintsApi.assign(complaint.id, selectedMember))}>
                    Assign
                  </Button>
                )}
              </div>
            )}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-border px-5 py-4">
            <div className="flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-primary" /><h2 className="font-heading font-bold text-foreground">SLA and urgency</h2></div>
          </div>
          <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-xl border border-border bg-muted/20 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">SLA status</p>
              <span className={cn("mt-2 inline-flex rounded-full border px-3 py-1 text-xs font-bold", slaStatusClass[complaint.sla.slaStatus] || slaStatusClass.Unavailable)}>{complaint.sla.slaStatus}</span>
            </div>
            <div className="rounded-xl border border-border bg-muted/20 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Deadline</p>
              <p className="mt-2 text-sm font-semibold text-foreground">{complaint.sla.deadline ? new Date(complaint.sla.deadline).toLocaleString() : "Unavailable"}</p>
            </div>
            <div className="rounded-xl border border-border bg-muted/20 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Remaining time</p>
              <p className={cn("mt-2 text-sm font-semibold", complaint.sla.isOverdue && "text-destructive")}>{formatRemaining(complaint.sla.remainingMs)}</p>
            </div>
            {ai?.priority && <div className="rounded-xl border border-border bg-muted/20 p-3"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Priority</p><div className="mt-2"><PriorityBadge priority={ai.priority} /></div></div>}
            {typeof ai?.urgencyScore === "number" && <div className="rounded-xl border border-border bg-muted/20 p-3"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Urgency score</p><p className="mt-2 text-sm font-semibold text-foreground">{ai.urgencyScore}/10</p></div>}
          </div>
        </Card>
      </div>

      {ai && (
        <Card className="overflow-hidden">
          <div className="border-b border-border px-5 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-violet-500" />
              <h2 className="font-heading font-bold text-foreground">AI analysis</h2>
            </div>
            {canRetryAi && (ai.status === "failed" || ai.status === "manual_review_required") && (
              <Button size="sm" variant="outline" disabled={retryingAi} onClick={handleRetryAi}>
                {retryingAi ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                Retry AI Analysis
              </Button>
            )}
          </div>
          {ai.status === "failed" ? (
            <div className="p-5">
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-4">
                <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">AI Analysis Unavailable</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  AI analysis could not complete during initial intake ({ai.errorCategory || "temporary issue"}). Standard category and SLA rules are currently applied.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-5 space-y-4">
              {ai.status === "manual_review_required" && (
                <div className="rounded-xl border border-blue-500/20 bg-blue-500/[0.06] p-4">
                  <p className="text-sm font-semibold text-blue-600 dark:text-blue-400">Manual Review Required</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    AI analysis could not confidently determine category. Department ownership is preserved as {complaint.category}.
                  </p>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  ["Detected language", ai.detectedLanguage],
                  ["English translation", ai.englishTranslation],
                  ["Classification", ai.category],
                  ["Detected issue", ai.detectedIssue],
                  ["Affected area", ai.affectedArea],
                  ["Recommended department", ai.recommendedDepartment],
                  ["Recommended action", ai.recommendedAction],
                  ["Reasoning", ai.reasoning],
                ].filter(([, value]) => value).map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-border bg-muted/20 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {(complaint.status === "Resolved" || (complaint.resolutionHistory && complaint.resolutionHistory.length > 0)) && (
        <Card className="overflow-hidden border-emerald-500/30">
          <div className="border-b border-border bg-emerald-500/[0.04] px-5 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              <h2 className="font-heading font-bold text-foreground">Resolution Details</h2>
            </div>
            {complaint.status === "Resolved" && (
              <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                Resolved
              </Badge>
            )}
          </div>
          <div className="space-y-4 p-5">
            {complaint.currentResolution ? (
              <>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Resolution Remarks</p>
                  <p className="mt-1.5 whitespace-pre-wrap break-words rounded-xl border border-border bg-muted/20 p-4 text-sm leading-6 text-foreground/90">
                    {complaint.currentResolution.remarks}
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-border bg-muted/20 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Resolved By</p>
                    <p className="mt-1 break-words text-sm font-medium text-foreground">
                      {complaint.currentResolution.resolvedBy?.name || complaint.currentResolution.resolvedBy?.email || "Staff member"}
                      {complaint.currentResolution.resolvedBy?.department ? ` (${complaint.currentResolution.resolvedBy.department})` : ""}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-muted/20 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Resolved At</p>
                    <p className="mt-1 break-words text-sm font-medium text-foreground">
                      {complaint.currentResolution.resolvedAt ? new Date(complaint.currentResolution.resolvedAt).toLocaleString() : (complaint.sla?.resolvedAt ? new Date(complaint.sla.resolvedAt).toLocaleString() : "Unavailable")}
                    </p>
                  </div>
                </div>
                {complaint.currentResolution.evidence && (
                  <div className="space-y-2 pt-2 border-t border-border">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Resolution Evidence</h3>
                    <ComplaintEvidenceViewer
                      complaintId={complaint.id}
                      entryId={complaint.currentResolution.id}
                      imageKey={complaint.currentResolution.evidence}
                      isResolution={true}
                    />
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Resolution details are unavailable for this older complaint.</p>
            )}
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-primary" /><h2 className="font-heading font-bold text-foreground">Operational activity</h2></div>
          <p className="mt-1 text-xs text-muted-foreground">Key intake, assignment, status, and SLA events</p>
        </div>
        <div className="space-y-3 p-5">
          {operationalTimeline.length === 0 ? (
            <p className="text-sm text-muted-foreground">No operational events recorded.</p>
          ) : operationalTimeline.map((event, index) => {
            const Icon = eventIcon(event);
            return (
              <div key={`${event.eventType}-${event.timestamp}-${index}`} className="flex gap-3 rounded-xl border border-border bg-muted/20 p-3">
                <div className="mt-0.5 rounded-lg bg-primary/10 p-2 text-primary"><Icon className="h-4 w-4" /></div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold capitalize text-foreground">{eventLabel(event)}</p>
                  {event.note && <p className="mt-1 text-sm text-muted-foreground">{event.note}</p>}
                  {(event.timestamp || event.time) && <p className="mt-1 text-xs text-muted-foreground">{new Date(event.timestamp || event.time || "").toLocaleString()}</p>}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <ResolveComplaintDialog
        open={resolveDialogOpen}
        onOpenChange={(open) => {
          setResolveDialogOpen(open);
          if (!open && complaint) {
            setSelectedStatus(complaint.status);
          }
        }}
        complaintId={complaint.id}
        complaintReference={complaint.reference}
        complaintTitle={complaint.title}
        onSuccess={(updated) => {
          setComplaint((current) => current ? { ...updated, aiAnalysis: current.aiAnalysis } : updated);
          setSelectedStatus(updated.status);
          setSelectedMember(updated.assignedTo?.id || "");
          setResolveDialogOpen(false);
        }}
      />
    </div>
  );
};

export default AuthorityComplaintDetail;
