import React, { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Users,
  CheckCircle2,
  Clock,
  ClipboardList,
  Star,
  TrendingUp,
  RefreshCw,
  Link2,
  Unlink,
  UserCheck,
  UserX,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";
import {
  membersApi,
  DepartmentOfficerPerformanceResponse,
  OfficerPerformanceRecord,
} from "@/services/complaintsApi";
import { ApiErrorPanel } from "@/components/shared/ApiErrorPanel";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const OfficerPerformance: React.FC = () => {
  const [data, setData] = useState<DepartmentOfficerPerformanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const response = await membersApi.getPerformance();
      setData(response);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const summary = data?.summary;
  const officers = data?.officers || [];
  const department = data?.department || "Department";

  return (
    <div className="space-y-8">
      {/* ── Header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className="border-primary/20 bg-primary/10 text-primary font-semibold text-xs">
              {department}
            </Badge>
            <span className="text-xs text-muted-foreground">Department Supervision</span>
          </div>
          <h1 className="text-2xl font-heading font-extrabold tracking-tight text-foreground sm:text-3xl">
            Officer Performance
          </h1>
          <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
            Monitor field officer resolution velocity, workload distribution, and verified citizen ratings across {department}.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadData(true)}
            disabled={loading || refreshing}
            className="rounded-xl border-border bg-card shadow-sm hover:bg-muted"
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", refreshing && "animate-spin")} />
            Refresh
          </Button>
          <Button
            asChild
            variant="default"
            size="sm"
            className="rounded-xl gradient-primary text-white shadow-sm"
          >
            <Link to="/department/members">
              <Users className="h-4 w-4 mr-2" />
              Manage Roster
            </Link>
          </Button>
        </div>
      </div>

      {error ? (
        <ApiErrorPanel error={error} onRetry={() => void loadData()} />
      ) : loading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {[...Array(6)].map((_, i) => (
              <Card key={i} className="glass-card p-4 h-24 animate-pulse bg-muted/20" />
            ))}
          </div>
          <Card className="glass-card p-12 text-center text-sm text-muted-foreground">
            <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-primary" />
            Aggregating officer metrics and citizen evaluations...
          </Card>
        </div>
      ) : (
        <>
          {/* ── Section 1: Department Summary (Requirement 3) ── */}
          {summary && (
            <motion.section
              aria-label="Department Performance Summary"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-3"
            >
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Department Performance Summary
              </h2>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {/* Total Officers */}
                <Card className="glass-card p-4 relative overflow-hidden border-border/60">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground">Total Officers</span>
                    <Users className="h-4 w-4 text-blue-500" />
                  </div>
                  <p className="mt-2 text-2xl font-black text-foreground">{summary.totalOfficers}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Rostered staff</p>
                </Card>

                {/* Active Officers */}
                <Card className="glass-card p-4 relative overflow-hidden border-border/60">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground">Active Officers</span>
                    <UserCheck className="h-4 w-4 text-emerald-500" />
                  </div>
                  <p className="mt-2 text-2xl font-black text-emerald-600 dark:text-emerald-400">
                    {summary.activeOfficers}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {summary.totalOfficers > 0
                      ? `${Math.round((summary.activeOfficers / summary.totalOfficers) * 100)}% active`
                      : "0%"}
                  </p>
                </Card>

                {/* Assigned Complaints */}
                <Card className="glass-card p-4 relative overflow-hidden border-border/60">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground">Assigned Tasks</span>
                    <ClipboardList className="h-4 w-4 text-sky-500" />
                  </div>
                  <p className="mt-2 text-2xl font-black text-foreground">{summary.totalAssignedComplaints}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Assigned to team</p>
                </Card>

                {/* Resolved Complaints */}
                <Card className="glass-card p-4 relative overflow-hidden border-border/60">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground">Resolved</span>
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  </div>
                  <p className="mt-2 text-2xl font-black text-emerald-600 dark:text-emerald-400">
                    {summary.resolvedComplaints}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {summary.totalAssignedComplaints > 0
                      ? `${Math.round((summary.resolvedComplaints / summary.totalAssignedComplaints) * 100)}% resolution rate`
                      : "No workload"}
                  </p>
                </Card>

                {/* Pending Complaints */}
                <Card className="glass-card p-4 relative overflow-hidden border-border/60">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground">Pending</span>
                    <Clock className="h-4 w-4 text-amber-500" />
                  </div>
                  <p className="mt-2 text-2xl font-black text-amber-600 dark:text-amber-400">
                    {summary.pendingComplaints}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Open in department</p>
                </Card>

                {/* Citizen Feedback */}
                <Card className="glass-card p-4 relative overflow-hidden border-border/60">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground">Satisfaction</span>
                    <Star className="h-4 w-4 text-amber-400 fill-amber-400" />
                  </div>
                  <div className="mt-2 flex items-baseline gap-1">
                    {summary.feedbackSummary.avgRating !== null ? (
                      <>
                        <span className="text-2xl font-black text-foreground">
                          {summary.feedbackSummary.avgRating.toFixed(1)}
                        </span>
                        <span className="text-xs text-amber-500 font-bold">★</span>
                      </>
                    ) : (
                      <span className="text-sm font-bold text-muted-foreground">Not Rated</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {summary.feedbackSummary.totalFeedbacks}{" "}
                    {summary.feedbackSummary.totalFeedbacks === 1 ? "review" : "reviews"}
                  </p>
                </Card>
              </div>
            </motion.section>
          )}

          {/* ── Section 2: Individual Officer Cards (Requirement 2) ── */}
          <section aria-label="Individual Officer Performance Breakdown" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-heading font-bold text-foreground">
                  Officer Scorecards ({officers.length})
                </h2>
                <p className="text-xs text-muted-foreground">
                  Individual performance metrics computed from verified complaints and citizen reviews.
                </p>
              </div>
            </div>

            {officers.length === 0 ? (
              <Card className="glass-card p-12 text-center space-y-4">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                  <Users className="h-7 w-7" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">No Officers Rostered</h3>
                  <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                    Your department currently has no field officers added to the roster. Add officers to assign complaints and track performance.
                  </p>
                </div>
                <Button asChild variant="outline" className="rounded-xl">
                  <Link to="/department/members">
                    <Users className="h-4 w-4 mr-2" />
                    Go to Team Management
                  </Link>
                </Button>
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {officers.map((officer, index) => (
                  <motion.div
                    key={officer.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <Card className="glass-card relative overflow-hidden p-5 space-y-5 border-border/70 hover:border-border transition-colors">
                      {/* Officer Header */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-sky-400 text-sm font-bold text-white shadow-md">
                            {officer.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <h3 className="font-heading font-bold text-foreground text-base leading-tight">
                              {officer.name}
                            </h3>
                            <p className="text-xs text-muted-foreground truncate max-w-[180px]">
                              {officer.linkedUser?.email || "No email assigned"}
                            </p>
                          </div>
                        </div>

                        {/* Status Badges */}
                        <div className="flex flex-col items-end gap-1">
                          {/* Active / Inactive Badge */}
                          {officer.status === "active" ? (
                            <Badge
                              variant="outline"
                              className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[11px] font-semibold py-0.5 px-2"
                            >
                              <UserCheck className="w-3 h-3 mr-1 inline" />
                              Active
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400 text-[11px] font-semibold py-0.5 px-2"
                            >
                              <UserX className="w-3 h-3 mr-1 inline" />
                              Inactive
                            </Badge>
                          )}

                          {/* Linked / Unlinked Badge */}
                          {officer.isLinked ? (
                            <Badge
                              variant="outline"
                              className="border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400 text-[10px] py-0 px-1.5"
                            >
                              <Link2 className="w-2.5 h-2.5 mr-1 inline" />
                              Linked
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="border-zinc-400/40 bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 text-[10px] py-0 px-1.5"
                            >
                              <Unlink className="w-2.5 h-2.5 mr-1 inline" />
                              Unlinked
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Complaint Metrics Grid */}
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-xl bg-muted/40 p-2.5 border border-border/40">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            Assigned
                          </span>
                          <p className="text-lg font-black text-foreground mt-0.5">
                            {officer.assignedComplaints}
                          </p>
                        </div>
                        <div className="rounded-xl bg-muted/40 p-2.5 border border-border/40">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                            Resolved
                          </span>
                          <p className="text-lg font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                            {officer.resolvedComplaints}
                          </p>
                        </div>
                        <div className="rounded-xl bg-muted/40 p-2.5 border border-border/40">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                            Pending
                          </span>
                          <p className="text-lg font-black text-amber-600 dark:text-amber-400 mt-0.5">
                            {officer.pendingComplaints}
                          </p>
                        </div>
                      </div>

                      {/* Resolution Rate Progress */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground font-medium flex items-center gap-1">
                            <TrendingUp className="h-3.5 w-3.5 text-primary" />
                            Resolution Rate
                          </span>
                          <span className="font-bold text-foreground">
                            {officer.resolutionRate}%
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-muted/60">
                          <motion.div
                            className={cn(
                              "h-full rounded-full transition-all",
                              officer.resolutionRate >= 75
                                ? "bg-emerald-500"
                                : officer.resolutionRate >= 40
                                ? "bg-blue-500"
                                : "bg-amber-500"
                            )}
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(100, officer.resolutionRate)}%` }}
                            transition={{ duration: 0.6, ease: "easeOut" }}
                          />
                        </div>
                      </div>

                      {/* Citizen Feedback Rating (Requirement 2: Show "Not Rated" when feedback is unavailable) */}
                      <div className="rounded-xl bg-muted/30 p-3 border border-border/50 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                            Citizen Rating
                          </span>
                          {officer.avgRating !== null ? (
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <div className="flex items-center gap-0.5">
                                {[1, 2, 3, 4, 5].map((star) => (
                                  <Star
                                    key={star}
                                    className={cn(
                                      "h-3.5 w-3.5",
                                      star <= Math.round(officer.avgRating || 0)
                                        ? "fill-warning text-warning"
                                        : "text-muted-foreground/20"
                                    )}
                                  />
                                ))}
                              </div>
                              <span className="text-sm font-bold text-foreground">
                                {officer.avgRating.toFixed(1)}
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <Badge
                                variant="secondary"
                                className="bg-muted text-muted-foreground text-xs font-semibold py-0.5 px-2 rounded-md"
                              >
                                Not Rated
                              </Badge>
                            </div>
                          )}
                        </div>

                        <div className="text-right">
                          <span className="text-xs text-muted-foreground">
                            {officer.feedbackCount} {officer.feedbackCount === 1 ? "review" : "reviews"}
                          </span>
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};

export default OfficerPerformance;
