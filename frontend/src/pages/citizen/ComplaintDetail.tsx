import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  MapPin,
  Calendar,
  User,
  Building,
  Brain,
  Clock,
  Star,
  MessageSquare,
  Trash2,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  Languages,
  Lightbulb,
  Route,
  ShieldAlert,
  UserRound,
} from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PriorityBadge, StatusBadge } from "@/components/shared/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { apiClient, ApiError } from "@/services/apiClient";
import { complaintsApi, normalizeComplaint, ComplaintRecord } from "@/services/complaintsApi";
import { ApiErrorPanel } from "@/components/shared/ApiErrorPanel";
import { ComplaintEvidenceViewer } from "@/components/shared/ComplaintEvidenceViewer";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface AIAnalysis {
  status?: "pending" | "completed" | "failed" | "manual_review_required";
  errorCategory?: string | null;
  errorMessage?: string | null;
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

type ComplaintWithAnalysis = ComplaintRecord & {
  aiAnalysis?: AIAnalysis | null;
};

const getTimelineLabel = (event: ComplaintRecord["timeline"][number]) => (
  event.label || event.eventType?.replace(/_/g, " ") || event.status || "Timeline event"
);

const getTimelineIcon = (event: ComplaintRecord["timeline"][number]) => {
  const key = `${event.eventType || ""} ${event.label || ""} ${event.status || ""}`.toLowerCase();
  if (key.includes("ai") || key.includes("analysis") || key.includes("priority")) return Bot;
  if (key.includes("department") || key.includes("route")) return Route;
  if (key.includes("officer") || key.includes("assign")) return UserRound;
  if (key.includes("sla") || key.includes("deadline")) return ShieldAlert;
  if (key.includes("status") || key.includes("resolved") || key.includes("completed")) return CheckCircle2;
  return ClipboardCheck;
};

const getTimelineTone = (event: ComplaintRecord["timeline"][number], isLatest: boolean) => {
  const key = `${event.eventType || ""} ${event.label || ""} ${event.status || ""}`.toLowerCase();
  if (isLatest || key.includes("resolved")) return "border-emerald-500/30 bg-emerald-500/[0.07] text-emerald-600 dark:text-emerald-300";
  if (key.includes("status") || key.includes("progress")) return "border-blue-500/30 bg-blue-500/[0.07] text-blue-600 dark:text-blue-300";
  if (key.includes("ai")) return "border-violet-500/30 bg-violet-500/[0.07] text-violet-600 dark:text-violet-300";
  return "border-slate-300/70 bg-slate-100/70 text-slate-600 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-300";
};

const slaStatusClass: Record<string, string> = {
  "On Track": "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-400",
  "Due Soon": "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400",
  Overdue: "border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400",
  Resolved: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400",
  Unavailable: "border-slate-200 bg-slate-50 text-slate-500 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-400",
};

const formatRemaining = (remainingMs: number | null) => {
  if (remainingMs === null) return "Unavailable";
  if (remainingMs < 0) {
    const hours = Math.ceil(Math.abs(remainingMs) / (60 * 60 * 1000));
    return `${hours}h overdue`;
  }
  const hours = Math.floor(remainingMs / (60 * 60 * 1000));
  const days = Math.floor(hours / 24);
  return days > 0 ? `${days}d ${hours % 24}h remaining` : `${Math.max(1, hours)}h remaining`;
};

const ComplaintDetail: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [complaint, setComplaint] = useState<ComplaintWithAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [deleting, setDeleting] = useState(false);

  const loadComplaint = React.useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await apiClient.get(`/api/complaints/${id}`);
      const normalizedComplaint = normalizeComplaint(data) as ComplaintWithAnalysis;
      normalizedComplaint.aiAnalysis = data?.aiAnalysis || null;
      setComplaint(normalizedComplaint);
    } catch (error) {
      setComplaint(null);
      setLoadError(error);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadComplaint().catch(() => setLoading(false));
  }, [loadComplaint]);

  const canDelete = user?.role === "citizen" || user?.role === "admin";
  const backPath = user?.role === "admin"
    ? "/admin"
    : user?.role === "authority"
      ? "/department"
      : "/citizen/complaints";

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading complaint...</p>;
  }

  const isNotFound = loadError instanceof ApiError && loadError.status === 404;

  if (loadError && !isNotFound) {
    return (
      <div className="space-y-4">
        <Link to={backPath} className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to complaints
        </Link>
        <ApiErrorPanel error={loadError} onRetry={() => void loadComplaint()} />
      </div>
    );
  }

  if (!complaint || isNotFound) {
    return (
      <div className="text-center py-20">
        <h2 className="text-xl font-heading font-bold text-foreground">Complaint not found</h2>
        <Link to={backPath} className="text-primary hover:underline text-sm mt-2 block">Back to complaints</Link>
      </div>
    );
  }

  const aiAnalysis = complaint.aiAnalysis;
  const hasUrgencyScore = typeof aiAnalysis?.urgencyScore === "number" && Number.isFinite(aiAnalysis.urgencyScore);
  const urgencyScore = hasUrgencyScore ? aiAnalysis.urgencyScore! : 0;

  const handleDelete = async () => {
    if (!id || deleting) return;

    try {
      setDeleting(true);
      await complaintsApi.delete(id);
      toast({ title: "Complaint deleted", description: "The complaint was permanently deleted." });
      navigate(backPath, { replace: true });
    } catch (error: unknown) {
      toast({
        title: "Deletion failed",
        description: error instanceof Error ? error.message : "Unable to delete the complaint.",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const timeline = complaint.timeline || [];
  const latestEventIndex = timeline.length - 1;

  const isFeedbackEligible =
    complaint.status === "Resolved" &&
    user?.role === "citizen" &&
    (!complaint.feedback ||
      (Boolean(complaint.currentResolution?.id) &&
        complaint.feedback.resolutionId !== complaint.currentResolution?.id));

  return (
    <div className="mx-auto max-w-5xl space-y-7 pb-8">
      <Link to={backPath} className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to complaints
      </Link>

      <section className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/80 p-5 shadow-sm dark:border-white/[0.07] dark:bg-slate-900/80 sm:p-7">
        <div className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="font-mono text-[11px] tracking-wide text-muted-foreground">{complaint.reference}</Badge>
              <StatusBadge status={complaint.status} />
            </div>
            <h1 className="max-w-3xl break-words text-2xl font-black tracking-tight text-slate-900 dark:text-white sm:text-3xl">{complaint.title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">Complaint overview and resolution activity</p>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
            {isFeedbackEligible && (
              <Link to={`/citizen/complaints/${complaint.id}/feedback`}>
                <Button variant="outline" size="sm" className="w-full sm:w-auto"><Star className="mr-1.5 h-4 w-4" /> Give Feedback</Button>
              </Link>
            )}
            {canDelete && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" disabled={deleting} className="w-full sm:w-auto"><Trash2 className="mr-1.5 h-4 w-4" /> {deleting ? "Deleting..." : "Delete Complaint"}</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Permanently delete this complaint?</AlertDialogTitle>
                    <AlertDialogDescription>This action is permanent. The complaint, its feedback, and complaint-specific records will be deleted and cannot be recovered.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={(event) => { event.preventDefault(); handleDelete(); }} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      {deleting ? "Deleting..." : "Delete permanently"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      </section>

      <Card className="overflow-hidden border-slate-200/80 shadow-sm dark:border-white/[0.07]">
        <div className="border-b border-slate-200/80 px-5 py-4 dark:border-white/[0.07] sm:px-7">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-blue-500/10 p-2.5 text-blue-600 dark:text-blue-300"><ClipboardCheck className="h-5 w-5" /></div>
            <div><h2 className="font-heading text-base font-bold text-foreground">Complaint Details</h2><p className="text-xs text-muted-foreground">Submitted information and current ownership</p></div>
          </div>
        </div>
        <div className="space-y-6 p-5 sm:p-7">
          <p className="max-w-4xl whitespace-pre-wrap break-words text-[15px] leading-7 text-foreground/80">{complaint.description}</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: MapPin, label: "Location", value: complaint.location || "Location not provided" },
              { icon: Calendar, label: "Submitted", value: new Date(complaint.createdAt).toLocaleDateString() },
              { icon: Building, label: "Department", value: complaint.category },
              { icon: User, label: "Assigned officer", value: complaint.assignedTo?.name || "Unassigned" },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="min-w-0 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 dark:border-white/[0.06] dark:bg-white/[0.03]">
                <div className="mb-2 flex items-center gap-2 text-muted-foreground"><Icon className="h-4 w-4 text-blue-500" /><span className="text-[11px] font-semibold uppercase tracking-wider">{label}</span></div>
                <p className="break-words text-sm font-medium text-foreground">{value}</p>
              </div>
            ))}
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-200/80 dark:border-white/[0.06]">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Attached Photo Evidence</h3>
            <ComplaintEvidenceViewer complaintId={complaint.id} imageKey={complaint.image} />
          </div>
        </div>
      </Card>

      {complaint.status === "Resolved" && (
        <Card className="overflow-hidden border-emerald-500/30 shadow-sm dark:border-emerald-500/20">
          <div className="border-b border-emerald-500/20 bg-emerald-500/[0.05] px-5 py-4 dark:border-emerald-500/10 sm:px-7">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-emerald-500/10 p-2.5 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-heading text-base font-bold text-foreground">Complaint Resolution</h2>
                  <p className="text-xs text-muted-foreground">Official resolution recorded by department officer</p>
                </div>
              </div>
              {isFeedbackEligible && (
                <Link to={`/citizen/complaints/${complaint.id}/feedback`}>
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white">
                    <Star className="mr-1.5 h-4 w-4" /> Give Feedback
                  </Button>
                </Link>
              )}
            </div>
          </div>
          <div className="space-y-5 p-5 sm:p-7">
            {complaint.currentResolution ? (
              <>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Officer Remarks</p>
                  <p className="mt-1.5 whitespace-pre-wrap break-words rounded-xl border border-border bg-slate-50/70 p-4 text-sm leading-6 text-foreground/90 dark:bg-white/[0.03]">
                    {complaint.currentResolution.remarks}
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 dark:border-white/[0.06] dark:bg-white/[0.03]">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Resolved By</p>
                    <p className="mt-1 break-words text-sm font-medium text-foreground">
                      {complaint.currentResolution.resolvedBy?.name || complaint.currentResolution.resolvedBy?.email || "Department Officer"}
                      {complaint.currentResolution.resolvedBy?.department ? ` (${complaint.currentResolution.resolvedBy.department})` : ""}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 dark:border-white/[0.06] dark:bg-white/[0.03]">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Resolution Date</p>
                    <p className="mt-1 break-words text-sm font-medium text-foreground">
                      {complaint.currentResolution.resolvedAt ? new Date(complaint.currentResolution.resolvedAt).toLocaleString() : (complaint.sla?.resolvedAt ? new Date(complaint.sla.resolvedAt).toLocaleString() : "Unavailable")}
                    </p>
                  </div>
                </div>
                {complaint.currentResolution.evidence && (
                  <div className="space-y-2 pt-2 border-t border-slate-200/80 dark:border-white/[0.06]">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Resolution Evidence Photo</h3>
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

      <Card className="overflow-hidden border-slate-200/80 shadow-sm dark:border-white/[0.07]">
        <div className="border-b border-slate-200/80 px-5 py-4 dark:border-white/[0.07] sm:px-7">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-blue-500/10 p-2.5 text-blue-600 dark:text-blue-300"><ShieldAlert className="h-5 w-5" /></div>
            <div><h2 className="font-heading text-base font-bold text-foreground">Service Level Agreement</h2><p className="text-xs text-muted-foreground">Current deadline and resolution timing</p></div>
          </div>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-7">
          <div className="rounded-xl border border-border bg-muted/20 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">SLA status</p>
            <span className={`mt-2 inline-flex rounded-full border px-3 py-1 text-xs font-bold ${slaStatusClass[complaint.sla.slaStatus] || slaStatusClass.Unavailable}`}>
              {complaint.sla.slaStatus}
            </span>
          </div>
          <div className="rounded-xl border border-border bg-muted/20 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Deadline</p>
            <p className="mt-2 break-words text-sm font-semibold text-foreground">
              {complaint.sla.deadline ? new Date(complaint.sla.deadline).toLocaleString() : "Unavailable"}
            </p>
          </div>
          {complaint.sla.slaStatus !== "Resolved" && complaint.sla.slaStatus !== "Unavailable" && (
            <div className="rounded-xl border border-border bg-muted/20 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Remaining time</p>
              <p className={cn("mt-2 text-sm font-semibold", complaint.sla.isOverdue ? "text-destructive" : "text-foreground")}>
                {formatRemaining(complaint.sla.remainingMs)}
              </p>
            </div>
          )}
          {complaint.sla.resolvedAt && (
            <div className="rounded-xl border border-border bg-muted/20 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Resolved at</p>
              <p className="mt-2 break-words text-sm font-semibold text-foreground">{new Date(complaint.sla.resolvedAt).toLocaleString()}</p>
            </div>
          )}
          {complaint.sla.slaStatus === "Unavailable" && (
            <p className="text-sm text-muted-foreground sm:col-span-2">SLA information is unavailable for this legacy complaint.</p>
          )}
        </div>
      </Card>

      <Card className="overflow-hidden border-slate-200/80 shadow-sm dark:border-white/[0.07]">
        <div className="border-b border-slate-200/80 px-5 py-4 dark:border-white/[0.07] sm:px-7">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-violet-500/10 p-2.5 text-violet-600 dark:text-violet-300"><Brain className="h-5 w-5" /></div>
            <div><h2 className="font-heading text-base font-bold text-foreground">AI Analysis</h2><p className="text-xs text-muted-foreground">Structured review of the submitted complaint</p></div>
          </div>
        </div>
        <div className="p-5 sm:p-7">
          {!aiAnalysis ? (
            <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">AI analysis not available.</div>
          ) : aiAnalysis.status === "failed" ? (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-5">
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-semibold text-sm">
                <ShieldAlert className="h-4 w-4" />
                <span>AI Analysis Temporarily Unavailable</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                AI-assisted analysis was temporarily unavailable when this complaint was submitted. Your complaint has been safely recorded under your selected category ({complaint.category}) with standard SLA protection.
              </p>
              {aiAnalysis.errorCategory && (
                <p className="mt-3 text-xs text-muted-foreground font-mono">
                  Status code: {aiAnalysis.errorCategory}
                </p>
              )}
            </div>
          ) : aiAnalysis.status === "manual_review_required" ? (
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/[0.06] p-5">
              <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-semibold text-sm">
                <Lightbulb className="h-4 w-4" />
                <span>Manual Review Required</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                AI analysis could not verify the department category with sufficient confidence. Your complaint is preserved under {complaint.category} and is queued for manual department review.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-blue-500/20 bg-blue-500/[0.06] p-4"><p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Classification</p><p className="mt-2 break-words text-sm font-bold text-foreground">{aiAnalysis.category || "Not provided"}</p></div>
                <div className="rounded-xl border border-border bg-muted/20 p-4"><p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Priority</p><div className="mt-2">{aiAnalysis.priority ? <PriorityBadge priority={aiAnalysis.priority} /> : <span className="text-sm text-muted-foreground">Not provided</span>}</div></div>
                <div className="rounded-xl border border-border bg-muted/20 p-4"><p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Urgency</p>{hasUrgencyScore ? <div className="mt-2 flex items-center gap-3"><div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full", urgencyScore > 6 ? "bg-destructive" : urgencyScore > 4 ? "bg-warning" : "bg-success")} style={{ width: `${(urgencyScore / 10) * 100}%` }} /></div><span className="text-sm font-bold">{urgencyScore}/10</span></div> : <p className="mt-2 text-sm text-muted-foreground">Not provided</p>}</div>
                <div className="rounded-xl border border-border bg-muted/20 p-4"><p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Confidence</p><p className="mt-2 text-lg font-bold text-foreground">{typeof aiAnalysis.confidence === "number" ? `${Math.round(aiAnalysis.confidence * 100)}%` : "Not provided"}</p></div>
              </div>
              <div className="grid gap-5 md:grid-cols-2">
                <div className="min-w-0 md:col-span-2"><p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Reasoning</p><p className="whitespace-pre-wrap break-words rounded-xl border border-border bg-muted/20 p-4 text-sm leading-6 text-foreground/80">{aiAnalysis.reasoning || "Not provided"}</p></div>
                {[
                  { icon: Languages, label: "Detected language", value: aiAnalysis.detectedLanguage },
                  { icon: Languages, label: "English translation", value: aiAnalysis.englishTranslation },
                  { icon: Lightbulb, label: "Detected issue", value: aiAnalysis.detectedIssue },
                  { icon: MapPin, label: "Affected area", value: aiAnalysis.affectedArea },
                  { icon: Building, label: "Recommended department", value: aiAnalysis.recommendedDepartment },
                ].map(({ icon: Icon, label, value }) => value ? <div key={label} className="min-w-0 rounded-xl border border-border bg-muted/20 p-4"><div className="mb-2 flex items-center gap-2 text-muted-foreground"><Icon className="h-4 w-4 text-violet-500" /><p className="text-xs font-semibold uppercase tracking-wider">{label}</p></div><p className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground/80">{value}</p></div> : null)}
                {aiAnalysis.recommendedAction && <div className="min-w-0 md:col-span-2"><p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recommended action</p><div className="flex gap-3 rounded-xl border border-blue-500/20 bg-blue-500/[0.06] p-4"><Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-blue-500" /><p className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground/80">{aiAnalysis.recommendedAction}</p></div></div>}
              </div>
            </div>
          )}
          <div className="mt-6 flex items-center justify-between border-t border-border/60 pt-4"><span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Current signal</span><StatusBadge status={complaint.status} /></div>
        </div>
      </Card>

      {timeline.length > 0 && (
        <Card className="overflow-hidden border-slate-200/80 shadow-sm dark:border-white/[0.07]">
          <div className="border-b border-slate-200/80 px-5 py-4 dark:border-white/[0.07] sm:px-7">
            <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-3"><div className="rounded-xl bg-blue-500/10 p-2.5 text-blue-600 dark:text-blue-300"><Clock className="h-5 w-5" /></div><div><h2 className="font-heading text-base font-bold text-foreground">Complaint Timeline</h2><p className="text-xs text-muted-foreground">{timeline.length} recorded event{timeline.length === 1 ? "" : "s"} · latest status: {complaint.status}</p></div></div><span className="hidden text-xs font-medium text-muted-foreground sm:block">Lifecycle activity</span></div>
          </div>
          <div className="relative space-y-3 p-5 sm:p-7">
            <div className="absolute bottom-8 left-[2.05rem] top-8 w-px bg-border sm:left-[3.05rem]" />
            {timeline.map((event, index) => {
              const Icon = getTimelineIcon(event);
              const isLatest = index === latestEventIndex;
              const tone = getTimelineTone(event, isLatest);
              return (
                <motion.div key={`${event.eventType || event.label || event.status || "event"}-${index}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * 0.04, 0.3) }} className="relative flex gap-3 sm:gap-4">
                  <div className={cn("relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border", tone)}><Icon className="h-4 w-4" /></div>
                  <div className={cn("min-w-0 flex-1 rounded-xl border p-4 transition-colors", isLatest ? "border-blue-500/30 bg-blue-500/[0.06]" : "border-border bg-card/60")}>
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4"><p className="break-words text-sm font-semibold text-foreground">{getTimelineLabel(event)}</p>{isLatest && <span className="w-fit rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-300">Latest</span>}</div>
                    <p className="mt-1 text-xs text-muted-foreground">{event.timestamp ? new Date(event.timestamp).toLocaleString() : "Time unavailable"}</p>
                    {event.note && <p className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-muted/50 px-3 py-2 text-sm leading-5 text-foreground/70">{event.note}</p>}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </Card>
      )}

      {complaint.feedback && (
        <Card className="overflow-hidden border-slate-200/80 shadow-sm dark:border-white/[0.07]">
          <div className="p-5 sm:p-7"><h2 className="mb-4 flex items-center gap-2 font-heading text-base font-bold"><MessageSquare className="h-4 w-4 text-primary" /> Submitted Feedback</h2><div className="space-y-3"><div className="flex items-center gap-1">{[1, 2, 3, 4, 5].map((star) => <Star key={star} className={cn("h-4 w-4", star <= complaint.feedback!.rating ? "fill-warning text-warning" : "text-muted-foreground/30")} />)}</div><p className="break-words text-sm text-foreground/80">{complaint.feedback.comment || "No additional comments provided."}</p><p className="text-xs text-muted-foreground">Work completed: {complaint.feedback.workCompleted ? "Yes" : "No"} · {complaint.feedback.percentDone}% done</p></div></div>
        </Card>
      )}
    </div>
  );
};

export default ComplaintDetail;
