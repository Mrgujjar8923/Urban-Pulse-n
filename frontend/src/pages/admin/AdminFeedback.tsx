import React, { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  Filter,
  MessageSquare,
  RefreshCw,
  Star,
  User,
  ThumbsUp,
  XCircle,
  ExternalLink,
} from "lucide-react";
import { adminApi, AdminFeedbackResponse } from "@/services/adminApi";
import { DEPARTMENTS } from "@/config/departments";
import { ApiErrorPanel } from "@/components/shared/ApiErrorPanel";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const AdminFeedback: React.FC = () => {
  const [data, setData] = useState<AdminFeedbackResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [selectedDept, setSelectedDept] = useState<string>("All Departments");
  const [minRating, setMinRating] = useState<number>(0);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const response = await adminApi.getFeedback({
        department: selectedDept,
        minRating: minRating > 0 ? minRating : undefined,
      });
      setData(response);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedDept, minRating]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const summary = data?.summary;
  const feedbacks = data?.feedbacks || [];

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">
            Citizen Feedback & Satisfaction
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Direct citizen evaluations, ratings, and resolution confirmations across all departments.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => loadData(true)}
          disabled={loading || refreshing}
          className="rounded-xl border-border bg-card shadow-sm hover:bg-muted"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error && <ApiErrorPanel error={error} onRetry={() => loadData()} />}

      {/* ── Satisfaction Summary Cards ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="glass-card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-warning/10 text-warning">
              <Star className="h-6 w-6 fill-warning" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Average Rating</p>
              <p className="text-2xl font-heading font-bold text-foreground">
                {summary ? `${summary.avgRating} / 5` : "—"}
              </p>
            </div>
          </div>
        </Card>

        <Card className="glass-card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-success/10 text-success">
              <ThumbsUp className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Work Confirmed Done</p>
              <p className="text-2xl font-heading font-bold text-foreground">
                {summary ? `${summary.percentSatisfied}%` : "—"}
              </p>
            </div>
          </div>
        </Card>

        <Card className="glass-card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <MessageSquare className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Evaluations</p>
              <p className="text-2xl font-heading font-bold text-foreground">
                {summary ? summary.totalFeedbacks : "—"}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* ── Filters ── */}
      <Card className="glass-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 rounded-xl border border-border bg-background/50 px-3 py-1.5 text-xs">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <select
                aria-label="Filter by Department"
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                className="bg-transparent font-medium text-foreground outline-none cursor-pointer"
              >
                <option value="All Departments">All Departments</option>
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 rounded-xl border border-border bg-background/50 px-3 py-1.5 text-xs">
              <Star className="h-3.5 w-3.5 text-warning fill-warning" />
              <select
                aria-label="Filter by Star Rating"
                value={minRating}
                onChange={(e) => setMinRating(parseInt(e.target.value, 10))}
                className="bg-transparent font-medium text-foreground outline-none cursor-pointer"
              >
                <option value={0}>All Ratings</option>
                <option value={4}>4+ Stars</option>
                <option value={3}>3+ Stars</option>
                <option value={2}>2+ Stars</option>
                <option value={1}>1+ Star</option>
              </select>
            </div>
          </div>

          <span className="text-xs text-muted-foreground">
            {feedbacks.length} records displayed
          </span>
        </div>
      </Card>

      {/* ── Feedback Feed ── */}
      {loading ? (
        <Card className="glass-card p-12 text-center text-sm text-muted-foreground">
          Loading citizen feedback...
        </Card>
      ) : feedbacks.length === 0 ? (
        <Card className="glass-card p-12 text-center text-sm text-muted-foreground">
          No feedback received matching the selected filters.
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {feedbacks.map((fb, idx) => (
            <motion.div
              key={fb.complaintId}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.04 }}
            >
              <Card className="glass-card p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-foreground text-sm line-clamp-1">
                      {fb.title}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {fb.category} · {fb.location || "Location not specified"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={`h-4 w-4 ${
                          star <= fb.rating
                            ? "fill-warning text-warning"
                            : "text-muted-foreground/30"
                        }`}
                      />
                    ))}
                  </div>
                </div>

                {fb.comment && (
                  <p className="text-xs text-foreground/90 italic bg-muted/30 rounded-xl p-3 border border-border/40">
                    "{fb.comment}"
                  </p>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                  <div>
                    <span>By: <strong>{fb.citizen?.name || "Citizen"}</strong></span>
                    {fb.assignedOfficer && (
                      <span className="ml-3">
                        Officer: <strong>{fb.assignedOfficer.name}</strong>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {fb.workCompleted ? (
                      <Badge variant="outline" className="text-[11px] border-success/30 bg-success/10 text-success">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Completed ({fb.percentDone}%)
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[11px] border-warning/30 bg-warning/10 text-warning">
                        Incomplete ({fb.percentDone}%)
                      </Badge>
                    )}

                    <Link
                      to={`/citizen/complaints/${fb.complaintId}`}
                      className="inline-flex items-center text-primary hover:underline ml-1"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminFeedback;
