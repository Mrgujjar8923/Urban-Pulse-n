import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { DEPARTMENT_METADATA } from "@/config/departments";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion } from "framer-motion";
import {
  ClipboardList,
  MapPin,
  Calendar,
  Users,
  CheckCircle2,
  AlertTriangle,
  Star,
  TrendingUp,
  UserCheck,
  UserX,
  Link2,
  Unlink,
  ArrowRight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  complaintsApi,
  ComplaintRecord,
  membersApi,
  MemberRecord,
  isEligibleOfficerMember,
  DepartmentOfficerPerformanceResponse,
} from "@/services/complaintsApi";
import { ApiErrorPanel } from "@/components/shared/ApiErrorPanel";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  countDepartmentComplaints,
  DEPARTMENT_COMPLAINT_FILTERS,
  DepartmentComplaintFilter,
  filterDepartmentComplaints,
} from "./departmentComplaintFilters";

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

const slaStatusClass: Record<string, string> = {
  Resolved: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400",
  Overdue: "border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400",
  "Due Soon": "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400",
  "On Track": "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-400",
  Unavailable: "border-slate-200 bg-slate-50 text-slate-500 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-400",
};

const DepartmentDashboard: React.FC = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [selectedOfficer, setSelectedOfficer] = useState<Record<string, string>>({});
  const [complaints, setComplaints] = useState<ComplaintRecord[]>([]);
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [performanceData, setPerformanceData] = useState<DepartmentOfficerPerformanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<DepartmentComplaintFilter>("All");
  const complaintsSectionRef = useRef<HTMLDivElement>(null);

  const department = user?.department || "";

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [complaintData, memberData, perfData] = await Promise.all([
        complaintsApi.listDepartment(),
        membersApi.list(),
        membersApi.getPerformance().catch(() => null),
      ]);
      setComplaints(complaintData);
      setMembers(memberData);
      setPerformanceData(perfData);
    } catch (error) {
      setLoadError(error);
    } finally {
      setLoading(false);
    }
  }, []);

  const eligibleOfficers = useMemo(() => {
    return members.filter((member) => isEligibleOfficerMember(member, department));
  }, [members, department]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const stats = useMemo(() => (
    DEPARTMENT_COMPLAINT_FILTERS.filter((filter) => filter !== "Overdue").map((filter) => ({
      label: filter,
      value: countDepartmentComplaints(complaints, filter),
      icon: ClipboardList,
      color: "text-foreground",
    }))
  ), [complaints]);

  const overdueCount = countDepartmentComplaints(complaints, "Overdue");
  const visibleComplaints = useMemo(
    () => filterDepartmentComplaints(complaints, activeFilter),
    [complaints, activeFilter]
  );

  const selectFilter = (filter: DepartmentComplaintFilter) => {
    setActiveFilter(filter);
    requestAnimationFrame(() => complaintsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const handleAssign = async (complaintId: string) => {
    const memberId = selectedOfficer[complaintId];
    if (!memberId) {
      toast({ title: "Select an officer", description: "Please choose an officer before assigning.", variant: "destructive" });
      return;
    }

    try {
      setAssigningId(complaintId);
      const updatedComplaint = await complaintsApi.assign(complaintId, memberId);
      setComplaints((current) => current.map((complaint) => (
        complaint.id === complaintId ? updatedComplaint : complaint
      )));
      toast({ title: "Complaint assigned", description: `${updatedComplaint.reference} is now assigned.` });
    } catch (err: unknown) {
      toast({
        title: "Assignment failed",
        description: err instanceof Error ? err.message : "Unable to assign complaint.",
        variant: "destructive",
      });
    } finally {
      setAssigningId(null);
    }
  };

  const total = complaints.length;
  const pending = complaints.filter((complaint) => complaint.status === "Pending").length;
  const assigned = complaints.filter((complaint) => complaint.status === "Assigned").length;
  const inProgress = complaints.filter((complaint) => complaint.status === "In Progress").length;
  const resolved = complaints.filter((complaint) => complaint.status === "Resolved").length;

  const resolutionRate = total ? Math.round((resolved / total) * 100) : 0;
  const assignmentRate = total ? Math.round(((assigned + inProgress) / total) * 100) : 0;

  if (loading) {
    return <div className="py-16 text-center text-sm text-muted-foreground">Loading department complaints…</div>;
  }

  if (loadError) {
    return <ApiErrorPanel error={loadError} onRetry={() => void loadDashboard()} />;
  }

  return (
    <div className="space-y-6">
      {/* ══ Hero Header ══ */}
      <motion.section
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative overflow-hidden rounded-2xl border border-slate-200/80 dark:border-white/[0.07] bg-white/80 dark:bg-slate-900/80 backdrop-blur-md shadow-xl dark:shadow-none"
      >
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute top-0 left-0 w-64 h-64 rounded-full bg-blue-500/10 dark:bg-blue-500/15 blur-3xl -translate-x-1/2 -translate-y-1/2" />
          <div className="absolute bottom-0 right-0 w-48 h-48 rounded-full bg-sky-500/10 dark:bg-sky-500/15 blur-3xl translate-x-1/3 translate-y-1/3" />
        </div>

        <div className="relative px-5 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <div className="mb-4 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-blue-200 dark:border-blue-500/20 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 text-xs font-bold uppercase tracking-widest">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                <Users className="h-3.5 w-3.5" />
                Department Command Center
              </div>
              <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white sm:text-4xl">
                {department || "Department"}{" "}
                <span className="bg-gradient-to-r from-blue-600 to-blue-400 bg-clip-text text-transparent">
                  Dashboard
                </span>
              </h1>
              <p className="mt-3 max-w-[65ch] text-sm leading-6 text-slate-500 dark:text-slate-400 sm:text-base">
                Real-time complaint workload, team capacity, and assignment performance for {department || "your department"}.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                { label: "Team Members", value: members.length },
                { label: "Assignment Rate", value: `${assignmentRate}%` },
                { label: "Resolution Rate", value: `${resolutionRate}%` },
              ].map((pill) => (
                <div key={pill.label} className="rounded-xl border border-slate-200/80 dark:border-white/[0.07] bg-slate-50/80 dark:bg-white/[0.04] backdrop-blur px-4 py-4">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">{pill.label}</p>
                  <p className="mt-2 text-base font-bold text-slate-900 dark:text-white">{pill.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.section>

      {/* ══ Stat Cards ══ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20, rotateX: 6 }}
            animate={{ opacity: 1, y: 0, rotateX: 0 }}
            transition={{ delay: index * 0.07, duration: 0.45, ease: "easeOut" }}
            whileHover={{ y: -3, transition: { duration: 0.2 } }}
            style={{ transformStyle: "preserve-3d" }}
          >
            <button
              type="button"
              onClick={() => selectFilter(stat.label as DepartmentComplaintFilter)}
              aria-pressed={activeFilter === stat.label}
              className={`group relative w-full overflow-hidden rounded-2xl border p-4 text-left shadow-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:shadow-none ${
                activeFilter === stat.label
                  ? "border-blue-500 bg-blue-50/80 dark:border-blue-400 dark:bg-blue-500/10"
                  : "border-slate-200/80 bg-white/80 dark:border-white/[0.07] dark:bg-slate-900/80"
              } backdrop-blur-md`}
            >
              <div className="pointer-events-none absolute -top-4 -right-4 w-16 h-16 rounded-full bg-blue-500/10 dark:bg-blue-500/15 blur-xl" />
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-blue-100 dark:border-blue-500/20 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 mb-3 transition-all duration-300 group-hover:bg-gradient-to-br group-hover:from-blue-600 group-hover:to-blue-400 group-hover:text-white group-hover:border-transparent">
                <stat.icon className="w-4 h-4" />
              </div>
              <p className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">{stat.value}</p>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mt-1">{stat.label}</p>
              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-blue-600 via-blue-400 to-sky-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-b-2xl" />
            </button>
          </motion.div>
        ))}
      </div>

      <div ref={complaintsSectionRef} className="relative scroll-mt-6 overflow-hidden rounded-2xl border border-slate-200/80 dark:border-white/[0.07] bg-white/80 dark:bg-slate-900/80 backdrop-blur-md shadow-xl dark:shadow-none">
        <div className="pointer-events-none absolute -top-8 -right-8 w-24 h-24 rounded-full bg-blue-500/10 dark:bg-blue-500/15 blur-2xl" />
        <div className="relative flex items-center justify-between px-5 py-4 border-b border-slate-200/80 dark:border-white/[0.07]">
          <h2 className="text-base font-extrabold tracking-tight text-slate-900 dark:text-white">Department Complaints</h2>
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            {activeFilter} · {visibleComplaints.length} shown
          </span>
        </div>
        <div className="flex flex-wrap gap-2 border-b border-slate-200/80 p-4 dark:border-white/[0.07]">
          {DEPARTMENT_COMPLAINT_FILTERS.map((filter) => {
            const count = filter === "Overdue" ? overdueCount : countDepartmentComplaints(complaints, filter);
            return (
              <button
                key={filter}
                type="button"
                onClick={() => selectFilter(filter)}
                aria-pressed={activeFilter === filter}
                className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  activeFilter === filter
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-700 dark:border-white/[0.1] dark:bg-slate-900 dark:text-slate-300 dark:hover:border-blue-500"
                }`}
              >
                {filter} <span className="ml-1 opacity-80">({count})</span>
              </button>
            );
          })}
        </div>
        <div className="divide-y divide-slate-100 dark:divide-white/[0.05]">
          {loading ? (
            <div className="p-4 text-sm text-slate-400 dark:text-slate-500">Loading complaints...</div>
          ) : complaints.length === 0 ? (
            <div className="p-4 text-sm text-slate-400 dark:text-slate-500">No complaints in this department yet.</div>
          ) : visibleComplaints.length === 0 ? (
            <div className="p-4 text-sm text-slate-400 dark:text-slate-500">
              No complaints match the {activeFilter} filter.
            </div>
          ) : (
            visibleComplaints.map((complaint) => {
              const selectedMemberId = selectedOfficer[complaint.id] || complaint.assignedTo?.id || "";

              return (
                <div key={complaint.id} className="p-4 hover:bg-blue-50/30 dark:hover:bg-blue-500/[0.04] transition-colors">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <Link
                      to={`/department/complaints/${complaint.id}`}
                      className="min-w-0 flex-1 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      aria-label={`Open complaint ${complaint.reference}`}
                    >
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-xs font-mono font-bold text-slate-400 dark:text-slate-500">{complaint.reference}</span>
                        <StatusBadge status={complaint.status} />
                      </div>
                      <h3 className="font-bold text-slate-900 dark:text-white text-sm">{complaint.title}</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{complaint.description}</p>
                      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4 mt-3 text-xs text-slate-400 dark:text-slate-500">
                        {complaint.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{complaint.location}</span>}
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(complaint.createdAt).toLocaleDateString()}</span>
                        <span>{complaint.createdBy?.name || "Citizen"}</span>
                        {complaint.assignedTo && <span className="font-medium text-slate-700 dark:text-slate-300">Assigned to {complaint.assignedTo.name}</span>}
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                        <span className={`rounded-full border px-2.5 py-1 font-bold ${slaStatusClass[complaint.sla.slaStatus] || slaStatusClass.Unavailable}`}>
                          SLA: {complaint.sla.slaStatus}
                        </span>
                        {complaint.sla.deadline && complaint.sla.slaStatus !== "Unavailable" && (
                          <span className="text-slate-500 dark:text-slate-400">
                            Deadline: {new Date(complaint.sla.deadline).toLocaleString()} · {formatRemaining(complaint.sla.remainingMs)}
                          </span>
                        )}
                      </div>
                    </Link>

                    <div className="w-full lg:w-56 flex flex-col gap-2">
                      <Select
                        value={selectedMemberId}
                        onValueChange={(value) => setSelectedOfficer((current) => ({ ...current, [complaint.id]: value }))}
                        disabled={!eligibleOfficers.length}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={eligibleOfficers.length ? "Select officer" : "No active officers linked"} />
                        </SelectTrigger>
                        <SelectContent>
                          {eligibleOfficers.map((member) => (
                            <SelectItem key={member.id} value={member.id}>{member.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        className="w-full"
                        disabled={!eligibleOfficers.length || assigningId === complaint.id}
                        onClick={() => handleAssign(complaint.id)}
                      >
                        {assigningId === complaint.id ? "Saving..." : complaint.assignedTo ? "Reassign" : "Assign"}
                      </Button>
                      {!eligibleOfficers.length && (
                        <span className="text-[11px] text-amber-600 dark:text-amber-400 text-center">
                          No active linked officers available.
                        </span>
                      )}
                    </div>
                    </div>
                  </div>
                );
              })
            )}
        </div>
      </div>

      {/* ── Section: Officer Performance & Department Summary (Phase 8.15) ── */}
      <section className="space-y-4" aria-label="Officer Performance">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                Officer Performance
              </h2>
              <Badge variant="outline" className="border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400 font-semibold text-xs">
                {department}
              </Badge>
            </div>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              Department summary and individual field officer workload, resolution velocity, and verified citizen ratings.
            </p>
          </div>

          <Button
            asChild
            variant="outline"
            size="sm"
            className="rounded-xl border-slate-200 dark:border-white/[0.08] bg-white dark:bg-slate-900 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Link to="/department/officer-performance">
              <TrendingUp className="h-4 w-4 mr-1.5 text-primary" />
              Full Performance View
              <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Link>
          </Button>
        </div>

        {/* Department Summary Cards (Requirement 3) */}
        {performanceData?.summary && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Card className="holographic-card rounded-xl border border-slate-200/80 dark:border-white/[0.06] bg-slate-50/80 dark:bg-white/[0.04] p-3.5 backdrop-blur">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Total Officers
              </span>
              <p className="mt-1 text-2xl font-black text-slate-900 dark:text-white">
                {performanceData.summary.totalOfficers}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                {performanceData.summary.activeOfficers} Active
              </p>
            </Card>

            <Card className="holographic-card rounded-xl border border-slate-200/80 dark:border-white/[0.06] bg-slate-50/80 dark:bg-white/[0.04] p-3.5 backdrop-blur">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                Active Officers
              </span>
              <p className="mt-1 text-2xl font-black text-emerald-600 dark:text-emerald-400">
                {performanceData.summary.activeOfficers}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                {performanceData.summary.totalOfficers > 0
                  ? `${Math.round((performanceData.summary.activeOfficers / performanceData.summary.totalOfficers) * 100)}% roster`
                  : "0%"}
              </p>
            </Card>

            <Card className="holographic-card rounded-xl border border-slate-200/80 dark:border-white/[0.06] bg-slate-50/80 dark:bg-white/[0.04] p-3.5 backdrop-blur">
              <span className="text-[10px] font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400">
                Assigned
              </span>
              <p className="mt-1 text-2xl font-black text-slate-900 dark:text-white">
                {performanceData.summary.totalAssignedComplaints}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">Complaints assigned</p>
            </Card>

            <Card className="holographic-card rounded-xl border border-slate-200/80 dark:border-white/[0.06] bg-slate-50/80 dark:bg-white/[0.04] p-3.5 backdrop-blur">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                Resolved
              </span>
              <p className="mt-1 text-2xl font-black text-emerald-600 dark:text-emerald-400">
                {performanceData.summary.resolvedComplaints}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                {performanceData.summary.totalAssignedComplaints > 0
                  ? `${Math.round((performanceData.summary.resolvedComplaints / performanceData.summary.totalAssignedComplaints) * 100)}% resolution rate`
                  : "0%"}
              </p>
            </Card>

            <Card className="holographic-card rounded-xl border border-slate-200/80 dark:border-white/[0.06] bg-slate-50/80 dark:bg-white/[0.04] p-3.5 backdrop-blur">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                Pending
              </span>
              <p className="mt-1 text-2xl font-black text-amber-600 dark:text-amber-400">
                {performanceData.summary.pendingComplaints}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">Awaiting action</p>
            </Card>

            <Card className="holographic-card rounded-xl border border-slate-200/80 dark:border-white/[0.06] bg-slate-50/80 dark:bg-white/[0.04] p-3.5 backdrop-blur">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500 dark:text-amber-400">
                Citizen Rating
              </span>
              <div className="mt-1 flex items-baseline gap-1">
                {performanceData.summary.feedbackSummary.avgRating !== null ? (
                  <>
                    <span className="text-2xl font-black text-slate-900 dark:text-white">
                      {performanceData.summary.feedbackSummary.avgRating.toFixed(1)}
                    </span>
                    <span className="text-xs text-amber-500 font-bold">★</span>
                  </>
                ) : (
                  <span className="text-sm font-bold text-slate-400 dark:text-slate-500">Not Rated</span>
                )}
              </div>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                {performanceData.summary.feedbackSummary.totalFeedbacks} reviews
              </p>
            </Card>
          </div>
        )}

        {/* Officer Cards Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {(!performanceData || performanceData.officers.length === 0) ? (
            <div className="col-span-full rounded-2xl border border-dashed border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.02] p-8 text-center">
              <Users className="mx-auto h-8 w-8 text-slate-400 dark:text-slate-500 mb-2" />
              <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                No officers rostered in this department yet.
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Add field officers in Member Management to begin assigning tickets and tracking performance.
              </p>
              <Button asChild size="sm" variant="outline" className="mt-3 rounded-xl">
                <Link to="/department/members">Manage Members</Link>
              </Button>
            </div>
          ) : (
            performanceData.officers.map((officer, index) => (
              <motion.article
                key={officer.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="holographic-card relative overflow-hidden rounded-2xl border border-slate-200/80 dark:border-white/[0.07] bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-4 shadow-sm hover:shadow-md transition-all space-y-3.5"
              >
                {/* Officer Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-sky-400 text-xs font-bold text-white shadow-sm">
                      {officer.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                        {officer.name}
                      </h3>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[140px]">
                        {officer.linkedUser?.email || "Unlinked officer"}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    {officer.status === "active" ? (
                      <Badge
                        variant="outline"
                        className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[10px] font-semibold py-0 px-1.5"
                      >
                        <UserCheck className="w-2.5 h-2.5 mr-1 inline" />
                        Active
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400 text-[10px] font-semibold py-0 px-1.5"
                      >
                        <UserX className="w-2.5 h-2.5 mr-1 inline" />
                        Inactive
                      </Badge>
                    )}

                    {officer.isLinked ? (
                      <Badge
                        variant="outline"
                        className="border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400 text-[9px] py-0 px-1"
                      >
                        <Link2 className="w-2 h-2 mr-0.5 inline" />
                        Linked
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-slate-400/40 bg-slate-500/10 text-slate-600 dark:text-slate-400 text-[9px] py-0 px-1"
                      >
                        <Unlink className="w-2 h-2 mr-0.5 inline" />
                        Unlinked
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Complaint Metrics Row */}
                <div className="grid grid-cols-3 gap-1.5 text-center text-xs">
                  <div className="rounded-lg bg-slate-50 dark:bg-white/[0.03] p-1.5 border border-slate-100 dark:border-white/[0.04]">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Assigned</span>
                    <p className="text-sm font-black text-slate-900 dark:text-white mt-0.5">{officer.assignedComplaints}</p>
                  </div>
                  <div className="rounded-lg bg-emerald-50/50 dark:bg-emerald-500/5 p-1.5 border border-emerald-100/50 dark:border-emerald-500/10">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Resolved</span>
                    <p className="text-sm font-black text-emerald-600 dark:text-emerald-400 mt-0.5">{officer.resolvedComplaints}</p>
                  </div>
                  <div className="rounded-lg bg-amber-50/50 dark:bg-amber-500/5 p-1.5 border border-amber-100/50 dark:border-amber-500/10">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">Pending</span>
                    <p className="text-sm font-black text-amber-600 dark:text-amber-400 mt-0.5">{officer.pendingComplaints}</p>
                  </div>
                </div>

                {/* Resolution Progress Bar */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-500 dark:text-slate-400">Resolution Rate</span>
                    <span className="font-bold text-slate-900 dark:text-white">{officer.resolutionRate}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-white/[0.07]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-blue-600 to-sky-400 transition-all duration-500"
                      style={{ width: `${Math.min(100, officer.resolutionRate)}%` }}
                    />
                  </div>
                </div>

                {/* Citizen Rating */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-white/[0.05] text-xs">
                  <span className="text-slate-500 dark:text-slate-400 text-[11px]">Citizen Rating:</span>
                  {officer.avgRating !== null ? (
                    <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1">
                      <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                      {officer.avgRating.toFixed(1)}
                      <span className="text-[10px] font-normal text-slate-400">({officer.feedbackCount})</span>
                    </span>
                  ) : (
                    <Badge variant="secondary" className="text-[10px] py-0 px-1.5 text-slate-400 bg-slate-100 dark:bg-white/[0.05]">
                      Not Rated
                    </Badge>
                  )}
                </div>
              </motion.article>
            ))
          )}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        {/* Team Performance */}
        <motion.article
          initial={{ opacity: 0, y: 20, rotateY: -4 }}
          animate={{ opacity: 1, y: 0, rotateY: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          whileHover={{ y: -6, scale: 1.01, transition: { duration: 0.25 } }}
          style={{ transformStyle: "preserve-3d" }}
          className="holographic-card relative overflow-hidden rounded-2xl border border-slate-200/80 dark:border-white/[0.07] bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-5 shadow-xl dark:shadow-none md:p-6"
        >
          <div className="pointer-events-none absolute -top-8 -right-8 w-24 h-24 rounded-full bg-blue-500/10 dark:bg-blue-500/15 blur-2xl" />
          <div className="relative flex items-center justify-between mb-5">
            <div>
              <h2 className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-white">Team Performance</h2>
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Officer assignment and workload overview.</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-blue-100 dark:border-blue-500/20 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Users className="h-5 w-5" />
            </div>
          </div>

          <div className="space-y-3">
            {members.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.02] px-4 py-8 text-center text-sm text-slate-400 dark:text-slate-500">
                No team members added yet.
              </div>
            ) : (
              members.map((member, index) => {
                const memberComplaints = complaints.filter((c) => c.assignedTo?.id === member.id);
                const assignmentRate = memberComplaints.length > 0 ? Math.round((memberComplaints.length / complaints.length) * 100) : 0;

                return (
                  <motion.div
                    key={member.id}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.06 }}
                    className="holographic-card rounded-xl border border-slate-200/80 dark:border-white/[0.06] bg-slate-50/80 dark:bg-white/[0.04] backdrop-blur p-3.5 hover:-translate-y-0.5 transition-transform duration-200"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-slate-900 dark:text-white">{member.name}</p>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{memberComplaints.length} assigned</p>
                      </div>
                      <span className="rounded-full border border-blue-200 dark:border-blue-500/20 bg-blue-50 dark:bg-blue-500/10 px-2.5 py-1 text-xs font-bold text-blue-700 dark:text-blue-400">
                        {assignmentRate}%
                      </span>
                    </div>
                    <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-white/[0.07]">
                      <motion.div
                        className="h-full rounded-full bg-gradient-to-r from-blue-600 to-sky-400"
                        initial={{ width: 0 }}
                        animate={{ width: `${assignmentRate}%` }}
                        transition={{ duration: 0.8, ease: "easeOut", delay: 0.3 + index * 0.1 }}
                      />
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>
        </motion.article>

        {/* Department Status */}
        <motion.article
          initial={{ opacity: 0, y: 20, rotateY: 4 }}
          animate={{ opacity: 1, y: 0, rotateY: 0 }}
          transition={{ duration: 0.5, delay: 0.08, ease: "easeOut" }}
          whileHover={{ y: -6, scale: 1.01, transition: { duration: 0.25 } }}
          style={{ transformStyle: "preserve-3d" }}
          className="holographic-card relative overflow-hidden rounded-2xl border border-slate-200/80 dark:border-white/[0.07] bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-5 shadow-xl dark:shadow-none md:p-6"
        >
          <div className="pointer-events-none absolute -top-8 -right-8 w-24 h-24 rounded-full bg-emerald-500/10 dark:bg-emerald-500/15 blur-2xl" />
          <div className="relative flex items-center justify-between mb-5">
            <div>
              <h2 className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-white">Department Status</h2>
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Key metrics and workflow health checks.</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-blue-100 dark:border-blue-500/20 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </div>

          <div className="space-y-3">
            {[
              { label: "Total Complaints", value: total, color: "text-blue-600 dark:text-blue-400", note: `All complaints routed to ${department || "your department"}.` },
              { label: "Pending Action", value: pending, color: "text-sky-600 dark:text-sky-400", note: "Complaints awaiting assignment or action." },
            ].map((sig, i) => (
              <motion.div
                key={sig.label}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + i * 0.08 }}
                className="holographic-card rounded-xl border border-slate-200/80 dark:border-white/[0.06] bg-slate-50/80 dark:bg-white/[0.04] backdrop-blur p-4 hover:-translate-y-0.5 transition-transform duration-200"
              >
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">{sig.label}</p>
                <p className={`mt-2 text-3xl font-black tracking-tight ${sig.color}`}>{sig.value}</p>
                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{sig.note}</p>
              </motion.div>
            ))}
            <motion.div
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.36 }}
              className="holographic-card rounded-xl border border-slate-200/80 dark:border-white/[0.06] bg-slate-50/80 dark:bg-white/[0.04] backdrop-blur p-4 hover:-translate-y-0.5 transition-transform duration-200"
            >
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Recommended Action</p>
              <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white leading-relaxed">
                {pending > 0
                  ? `Prioritize assigning ${pending} pending complaint${pending !== 1 ? "s" : ""} to available team members.`
                  : "All complaints are assigned. Focus on resolution and follow-ups."}
              </p>
            </motion.div>
          </div>
        </motion.article>
      </section>
    </div>
  );
};

export default DepartmentDashboard;
