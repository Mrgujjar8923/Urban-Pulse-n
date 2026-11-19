import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { complaintsApi, ComplaintRecord } from "@/services/complaintsApi";
import { StatusBadge, PriorityBadge } from "@/components/shared/StatusBadge";
import { ResolveComplaintDialog } from "@/components/shared/ResolveComplaintDialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  ClipboardList,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Activity,
  ArrowUpRight,
  Search,
  RefreshCw,
  MapPin,
  Calendar,
  ShieldAlert,
  Loader2,
  LogOut,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { ApiErrorPanel } from "@/components/shared/ApiErrorPanel";
import { ApiError } from "@/services/apiClient";

const STATUS_FILTERS = ["All", "Assigned", "In Progress", "Resolved", "Overdue"] as const;
type FilterOption = (typeof STATUS_FILTERS)[number];

const formatRemaining = (remainingMs: number | null) => {
  if (remainingMs === null) return "No SLA";
  if (remainingMs < 0) {
    const hours = Math.ceil(Math.abs(remainingMs) / (60 * 60 * 1000));
    return `${hours}h overdue`;
  }
  const hours = Math.floor(remainingMs / (60 * 60 * 1000));
  const days = Math.floor(hours / 24);
  return days > 0 ? `${days}d ${hours % 24}h left` : `${Math.max(1, hours)}h left`;
};

const slaStatusClass = (complaint: ComplaintRecord) => {
  if (complaint.status === "Resolved") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400";
  }
  const remaining = complaint.sla?.remainingMs;
  if (remaining !== null && remaining !== undefined && remaining < 0) {
    return "border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400";
  }
  if (remaining !== null && remaining !== undefined && remaining < 24 * 3600 * 1000) {
    return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400";
  }
  return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-400";
};

const OfficerDashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [complaints, setComplaints] = useState<ComplaintRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [activeFilter, setActiveFilter] = useState<FilterOption>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [resolvingComplaint, setResolvingComplaint] = useState<ComplaintRecord | null>(null);

  const loadComplaints = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await complaintsApi.listMyAssigned();
      setComplaints(data);
    } catch (error) {
      setLoadError(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadComplaints();
  }, [loadComplaints]);

  const stats = useMemo(() => {
    const total = complaints.length;
    const pending = complaints.filter((c) => c.status === "Pending" || c.status === "Assigned").length;
    const inProgress = complaints.filter((c) => c.status === "In Progress").length;
    const resolved = complaints.filter((c) => c.status === "Resolved").length;
    const overdue = complaints.filter(
      (c) =>
        c.status !== "Resolved" &&
        (c.sla?.isOverdue || (c.sla?.remainingMs !== null && c.sla?.remainingMs !== undefined && c.sla.remainingMs < 0))
    ).length;

    return { total, pending, inProgress, resolved, overdue };
  }, [complaints]);

  const filteredComplaints = useMemo(() => {
    return complaints.filter((complaint) => {
      // Filter tab check
      if (activeFilter === "Assigned" && complaint.status !== "Assigned") return false;
      if (activeFilter === "In Progress" && complaint.status !== "In Progress") return false;
      if (activeFilter === "Resolved" && complaint.status !== "Resolved") return false;
      if (activeFilter === "Overdue") {
        const isOverdue =
          complaint.status !== "Resolved" &&
          (complaint.sla?.isOverdue ||
            (complaint.sla?.remainingMs !== null &&
              complaint.sla?.remainingMs !== undefined &&
              complaint.sla.remainingMs < 0));
        if (!isOverdue) return false;
      }

      // Search query check
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesRef = complaint.reference?.toLowerCase().includes(q);
        const matchesTitle = complaint.title?.toLowerCase().includes(q);
        const matchesLoc = complaint.location?.toLowerCase().includes(q);
        if (!matchesRef && !matchesTitle && !matchesLoc) return false;
      }

      return true;
    });
  }, [complaints, activeFilter, searchQuery]);

  const handleStatusChange = async (complaintId: string, nextStatus: string) => {
    if (nextStatus === "Resolved") {
      const target = complaints.find((c) => c.id === complaintId);
      if (target) {
        setResolvingComplaint(target);
        return;
      }
    }

    try {
      setUpdatingId(complaintId);
      const updated = await complaintsApi.updateStatus(complaintId, nextStatus);
      setComplaints((current) => current.map((c) => (c.id === complaintId ? updated : c)));
      toast({
        title: "Status updated",
        description: `Complaint status marked as ${nextStatus}.`,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update complaint status.";
      toast({
        title: "Update failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setUpdatingId(null);
    }
  };

  const statCards = [
    {
      label: "My Assigned Complaints",
      value: stats.total,
      icon: ClipboardList,
      color: "text-blue-600 dark:text-blue-400 bg-blue-500/10",
      filter: "All" as FilterOption,
    },
    {
      label: "My Pending Complaints",
      value: stats.pending,
      icon: Clock,
      color: "text-amber-600 dark:text-amber-400 bg-amber-500/10",
      filter: "Assigned" as FilterOption,
    },
    {
      label: "My In Progress Complaints",
      value: stats.inProgress,
      icon: Activity,
      color: "text-indigo-600 dark:text-indigo-400 bg-indigo-500/10",
      filter: "In Progress" as FilterOption,
    },
    {
      label: "My Resolved Complaints",
      value: stats.resolved,
      icon: CheckCircle2,
      color: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
      filter: "Resolved" as FilterOption,
    },
    {
      label: "My Overdue Complaints",
      value: stats.overdue,
      icon: AlertTriangle,
      color: "text-red-600 dark:text-red-400 bg-red-500/10",
      filter: "Overdue" as FilterOption,
    },
  ];

  if (loading) {
    return <div className="py-16 text-center text-sm text-muted-foreground">Loading your assigned tasks…</div>;
  }

  if (loadError) {
    const isUnlinkedOfficerError = Boolean(
      (loadError instanceof ApiError && (loadError.status === 403 || /member|linked/i.test(loadError.message))) ||
      (loadError instanceof Error && /member|linked/i.test(loadError.message)) ||
      (typeof loadError === "object" && loadError !== null && "status" in loadError && (loadError as { status?: number }).status === 403)
    );

    if (isUnlinkedOfficerError) {
      return (
        <div role="alert" className="flex flex-col items-center justify-center min-h-[360px] p-8 text-center max-w-lg mx-auto bg-card rounded-2xl border border-destructive/20 shadow-sm mt-8">
          <div className="w-12 h-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mb-4">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">Officer Profile Not Linked</h2>
          <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
            Your account is authenticated, but no verified Officer Member profile is linked to this account. Please contact your Department Authority or administrator.
          </p>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => void loadComplaints()}>
              <RefreshCw className="mr-2 h-4 w-4" /> Retry
            </Button>
            <Button variant="destructive" size="sm" onClick={() => { logout(); navigate("/login"); }}>
              <LogOut className="mr-2 h-4 w-4" /> Logout
            </Button>
          </div>
        </div>
      );
    }

    return <ApiErrorPanel error={loadError} onRetry={() => void loadComplaints()} />;
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-heading font-bold text-foreground">Field Officer Workspace</h1>
            <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/20">
              {user?.department || "Department"}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Personal task queue for {user?.memberName || user?.name || "Officer"}. Only complaints assigned to your Member identity are shown.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={loadComplaints}
          disabled={loading}
          className="inline-flex items-center gap-2 self-start sm:self-auto"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* ── KPI Stats Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {statCards.map((card) => {
          const Icon = card.icon;
          const isActive = activeFilter === card.filter;
          return (
            <button
              key={card.label}
              onClick={() => setActiveFilter(card.filter)}
              className={`p-4 rounded-2xl border text-left transition-all ${
                isActive
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-border bg-card/60 hover:bg-card hover:border-border/80"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${card.color}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <span className="text-2xl font-black font-heading text-foreground">{card.value}</span>
              </div>
              <p className="mt-2 text-xs font-medium text-muted-foreground line-clamp-1">{card.label}</p>
            </button>
          );
        })}
      </div>

      {/* ── Complaints Section ── */}
      <Card className="glass-card overflow-hidden">
        {/* Table Toolbar */}
        <div className="p-4 border-b border-border flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {STATUS_FILTERS.map((filter) => (
              <button
                key={filter}
                onClick={() => setActiveFilter(filter)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  activeFilter === filter
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {filter}
              </button>
            ))}
          </div>

          <div className="relative w-full md:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Search assigned tasks"
              placeholder="Search reference, title..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>
        </div>

        {/* Complaints Table */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="py-16 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              Loading your assigned tasks...
            </div>
          ) : filteredComplaints.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              {complaints.length === 0
                ? "No complaints are currently assigned to you."
                : "No complaints match the selected filter."}
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/80 bg-muted/30 text-xs font-semibold text-muted-foreground">
                  <th className="py-3 px-4">Complaint ID</th>
                  <th className="py-3 px-4">Title & Details</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Priority</th>
                  <th className="py-3 px-4">Status & Action</th>
                  <th className="py-3 px-4">SLA Deadline</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredComplaints.map((complaint) => {
                  const isUpdating = updatingId === complaint.id;
                  const deadlineStr = complaint.sla?.deadline
                    ? new Date(complaint.sla.deadline).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "No deadline";

                  return (
                    <tr
                      key={complaint.id}
                      className="hover:bg-muted/20 transition-colors group"
                    >
                      {/* ID */}
                      <td className="py-3 px-4 font-mono text-xs font-bold text-foreground whitespace-nowrap">
                        {complaint.reference}
                      </td>

                      {/* Title & Info */}
                      <td className="py-3 px-4 min-w-[200px] max-w-[320px]">
                        <p className="font-semibold text-foreground text-sm line-clamp-1">{complaint.title}</p>
                        {complaint.location && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3 shrink-0" />
                            <span className="truncate">{complaint.location}</span>
                          </p>
                        )}
                      </td>

                      {/* Category */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <Badge variant="secondary" className="text-[11px] font-medium">
                          {complaint.category}
                        </Badge>
                      </td>

                      {/* Priority */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <PriorityBadge priority={complaint.priority || "Medium"} />
                      </td>

                      {/* Status & Quick Updater */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <StatusBadge status={complaint.status} />
                          <select
                            aria-label={`Update status for complaint ${complaint.reference}`}
                            value={complaint.status}
                            disabled={isUpdating}
                            onChange={(e) => handleStatusChange(complaint.id, e.target.value)}
                            className="text-xs h-7 rounded border border-border bg-card px-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                          >
                            <option value="Assigned">Assigned</option>
                            <option value="In Progress">In Progress</option>
                            <option value="Resolved">Resolved</option>
                          </select>
                          {isUpdating && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
                        </div>
                      </td>

                      {/* SLA Deadline & Remaining */}
                      <td className="py-3 px-4 whitespace-nowrap text-xs">
                        <div className="space-y-1">
                          <p className="text-foreground flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-muted-foreground" />
                            {deadlineStr}
                          </p>
                          <span
                            className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold border ${slaStatusClass(
                              complaint
                            )}`}
                          >
                            {formatRemaining(complaint.sla?.remainingMs)}
                          </span>
                        </div>
                      </td>

                      {/* Action */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/department/complaints/${complaint.id}`)}
                          className="h-8 text-xs font-semibold text-primary hover:text-primary hover:bg-primary/10 inline-flex items-center gap-1"
                        >
                          View Details
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {resolvingComplaint && (
        <ResolveComplaintDialog
          open={Boolean(resolvingComplaint)}
          onOpenChange={(open) => !open && setResolvingComplaint(null)}
          complaintId={resolvingComplaint.id}
          complaintReference={resolvingComplaint.reference}
          complaintTitle={resolvingComplaint.title}
          onSuccess={(updated) => {
            setComplaints((current) => current.map((c) => (c.id === updated.id ? updated : c)));
            setResolvingComplaint(null);
          }}
        />
      )}
    </div>
  );
};

export default OfficerDashboard;

