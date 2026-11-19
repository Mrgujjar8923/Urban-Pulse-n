import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Building2,
  CheckCircle2,
  Clock,
  Star,
  TrendingUp,
  AlertTriangle,
  Users,
  RefreshCw,
} from "lucide-react";
import { adminApi, DepartmentPerformanceRecord } from "@/services/adminApi";
import { ApiErrorPanel } from "@/components/shared/ApiErrorPanel";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const DepartmentPerformance: React.FC = () => {
  const [departments, setDepartments] = useState<DepartmentPerformanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const loadData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const data = await adminApi.getDepartmentPerformance();
      setDepartments(data);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">
            Department Performance
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Municipal performance benchmarks, resolution velocity, and citizen feedback scores across departments.
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

      {loading ? (
        <Card className="glass-card p-12 text-center text-sm text-muted-foreground">
          Aggregating department performance metrics...
        </Card>
      ) : departments.length === 0 ? (
        <Card className="glass-card p-12 text-center text-sm text-muted-foreground">
          No department data available.
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {departments.map((dept, index) => (
            <motion.div
              key={dept.department}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.08 }}
            >
              <Card className="glass-card p-6 space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <Building2 className="h-6 w-6" />
                    </div>
                    <div>
                      <h2 className="text-lg font-heading font-bold text-foreground">
                        {dept.department}
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        {dept.membersCount} active staff rostered
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs px-2.5 py-1 font-semibold">
                    {dept.total} Total Cases
                  </Badge>
                </div>

                {/* Progress bar */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Resolution Efficiency</span>
                    <span className="font-bold text-foreground">{dept.resolutionRate}%</span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-600 to-emerald-500 rounded-full transition-all duration-500"
                      style={{ width: `${dept.resolutionRate}%` }}
                    />
                  </div>
                </div>

                {/* Key Metrics Grid */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-center">
                  <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                    <p className="text-[11px] text-muted-foreground">Pending</p>
                    <p className="text-lg font-heading font-bold text-warning">{dept.pending}</p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                    <p className="text-[11px] text-muted-foreground">In Progress</p>
                    <p className="text-lg font-heading font-bold text-primary">
                      {dept.assigned + dept.inProgress}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                    <p className="text-[11px] text-muted-foreground">Resolved</p>
                    <p className="text-lg font-heading font-bold text-success">{dept.resolved}</p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                    <p className="text-[11px] text-muted-foreground">Overdue</p>
                    <p className={`text-lg font-heading font-bold ${dept.overdue > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                      {dept.overdue}
                    </p>
                  </div>
                </div>

                {/* Secondary indicators */}
                <div className="grid grid-cols-2 gap-4 border-t border-border/60 pt-4 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-primary" />
                    <span>Avg Resolution: <strong>{dept.avgResolutionHours}h</strong></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Star className="h-4 w-4 text-warning fill-warning" />
                    <span>Citizen Rating: <strong>{dept.avgRating > 0 ? `${dept.avgRating} / 5` : "No ratings"}</strong></span>
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

export default DepartmentPerformance;

