import React, { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  FileText,
  Filter,
  Gauge,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  UserCheck,
  Users,
  Compass,
  BarChart3,
  MapPin,
  MessageSquare,
  FileBarChart,
  ClipboardList,
} from "lucide-react";
import DashboardCards, { DashboardCardItem } from "@/components/dashboard/DashboardCards";
import Charts from "@/components/dashboard/Charts";
import { DEPARTMENTS } from "@/config/departments";
import { adminApi, AdminOverviewStats } from "@/services/adminApi";
import { ApiErrorPanel } from "@/components/shared/ApiErrorPanel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const DATE_RANGE_OPTIONS = [
  { label: "All Time", value: "allTime" },
  { label: "Last 7 Days", value: "last7Days" },
  { label: "Last 30 Days", value: "last30Days" },
  { label: "Last 6 Months", value: "last6Months" },
  { label: "This Year", value: "thisYear" },
] as const;

const STATUS_COLORS: Record<string, string> = {
  Pending: "#f59e0b",
  Assigned: "#2563eb",
  "In Progress": "#38bdf8",
  Resolved: "#22c55e",
  "No data": "#94a3b8",
};

const NAV_SHORTCUTS = [
  {
    label: "Complaint Management",
    description: "Browse, filter, and inspect complaints across all departments",
    path: "/admin/complaints",
    icon: ClipboardList,
    color: "from-blue-500/20 to-indigo-500/20 text-blue-500",
  },
  {
    label: "Analytics",
    description: "Deep dive trends, category breakdowns, and resolution velocity",
    path: "/admin/analytics",
    icon: BarChart3,
    color: "from-purple-500/20 to-pink-500/20 text-purple-500",
  },
  {
    label: "Department Management",
    description: "Municipal departments, assigned authorities, and officer roster mappings",
    path: "/admin/departments",
    icon: Building2,
    color: "from-emerald-500/20 to-teal-500/20 text-emerald-500",
  },
  {
    label: "Department Performance",
    description: "SLA compliance, workload distribution, and resolution rates",
    path: "/admin/department-performance",
    icon: TrendingUp,
    color: "from-teal-500/20 to-cyan-500/20 text-teal-500",
  },
  {
    label: "Heatmap",
    description: "Geographic problem hotspot density and location clusters",
    path: "/admin/heatmap",
    icon: MapPin,
    color: "from-rose-500/20 to-red-500/20 text-rose-500",
  },
  {
    label: "Feedback",
    description: "Citizen ratings, comments, and satisfaction metrics",
    path: "/admin/feedback",
    icon: MessageSquare,
    color: "from-cyan-500/20 to-blue-500/20 text-cyan-500",
  },
  {
    label: "Reports",
    description: "Generate and export system-wide governance audit reports",
    path: "/admin/reports",
    icon: FileBarChart,
    color: "from-violet-500/20 to-purple-500/20 text-violet-500",
  },
  {
    label: "User Management",
    description: "Manage citizens, authorities, officers, and account statuses",
    path: "/admin/users",
    icon: Users,
    color: "from-sky-500/20 to-blue-500/20 text-sky-500",
  },
];

const AdminDashboard: React.FC = () => {
  const [data, setData] = useState<AdminOverviewStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [dateRange, setDateRange] = useState<string>("allTime");
  const [selectedDept, setSelectedDept] = useState<string>("All Departments");

  const loadStats = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setLoadError(null);

    try {
      const stats = await adminApi.getOverviewStats({
        dateRange,
        department: selectedDept,
      });
      setData(stats);
    } catch (err) {
      setLoadError(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dateRange, selectedDept]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const metrics = data?.metrics;

  // The 10 required overview metrics
  const statCards: DashboardCardItem[] = [
    {
      label: "Total Complaints",
      value: metrics ? metrics.totalComplaints : "—",
      helper: "Total civic complaints across all departments",
      delta: `${metrics?.totalComplaints ?? 0} recorded`,
      icon: FileText,
    },
    {
      label: "Pending",
      value: metrics ? metrics.pendingComplaints : "—",
      helper: "Awaiting initial review and department assignment",
      delta: `${metrics?.pendingComplaints ?? 0} cases`,
      icon: AlertTriangle,
    },
    {
      label: "Assigned",
      value: metrics ? metrics.assignedComplaints : "—",
      helper: "Assigned to dedicated field officers",
      delta: `${metrics?.assignedComplaints ?? 0} assigned`,
      icon: ShieldCheck,
    },
    {
      label: "In Progress",
      value: metrics ? metrics.inProgressComplaints : "—",
      helper: "Active field remediation currently underway",
      delta: `${metrics?.inProgressComplaints ?? 0} active`,
      icon: Gauge,
    },
    {
      label: "Resolved",
      value: metrics ? metrics.resolvedComplaints : "—",
      helper: "Successfully closed with citizen feedback",
      delta: `${metrics?.resolvedComplaints ?? 0} closed`,
      icon: CheckCircle2,
    },
    {
      label: "Overdue",
      value: metrics ? metrics.overdueComplaints : "—",
      helper: "Unresolved complaints that exceeded SLA deadline",
      delta: metrics?.overdueComplaints ? "Requires intervention" : "0 overdue",
      icon: AlertTriangle,
    },
    {
      label: "Resolution Rate",
      value: metrics ? `${metrics.resolutionRate}%` : "—",
      helper: "Proportion of total complaints resolved",
      delta: `${metrics?.resolutionRate ?? 0}% achieved`,
      icon: TrendingUp,
    },
    {
      label: "Total Citizens",
      value: metrics ? metrics.totalCitizens : "—",
      helper: "Registered citizen portal accounts",
      delta: "Verified users",
      icon: Users,
    },
    {
      label: "Department Authorities",
      value: metrics ? metrics.totalAuthorities : "—",
      helper: "Supervisors managing department operations",
      delta: "4 departments",
      icon: Building2,
    },
    {
      label: "Total Officers",
      value: metrics ? metrics.totalOfficers : "—",
      helper: "Field officers assigned to civic remediation",
      delta: "Active roster",
      icon: UserCheck,
    },
  ];

  const trendData = (data?.monthlyTrend || []).map((t) => ({
    label: t.label,
    submitted: t.submitted,
    resolved: t.resolved,
  }));

  const statusData = (data?.statusDistribution || []).filter((s) => s.value > 0);

  return (
    <div className="space-y-8">
      {/* ── Top Header & Filter Controls ── */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary mb-2">
            <Compass className="h-3.5 w-3.5" />
            Admin Intelligence & Governance Center
          </div>
          <h1 className="text-3xl font-heading font-extrabold text-foreground tracking-tight">
            Admin Dashboard
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Authoritative, real-time database aggregation across all departments, authorities, and officers.
          </p>
        </div>

        {/* Filter controls */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Department Filter */}
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm shadow-sm">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <select
              aria-label="Filter by Department"
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="bg-transparent font-medium text-foreground outline-none cursor-pointer"
            >
              <option value="All Departments">All Departments</option>
              {DEPARTMENTS.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>

          {/* Date Range Filter */}
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm shadow-sm">
            <select
              aria-label="Filter by Date Range"
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="bg-transparent font-medium text-foreground outline-none cursor-pointer"
            >
              {DATE_RANGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Refresh Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadStats(true)}
            disabled={loading || refreshing}
            className="rounded-xl border-border bg-card shadow-sm hover:bg-muted"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* ── Error Banner if API fails ── */}
      {loadError && (
        <ApiErrorPanel
          error={loadError}
          onRetry={() => loadStats()}
        />
      )}

      {/* ── 1. Summary Cards (All 10 Database Aggregated Metrics) ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-heading font-semibold text-foreground">
            Overview Metrics
          </h2>
          <span className="text-xs text-muted-foreground">
            Live database aggregation · {selectedDept} · {DATE_RANGE_OPTIONS.find((o) => o.value === dateRange)?.label}
          </span>
        </div>
        <DashboardCards items={statCards} loading={loading} />
      </section>

      {/* ── 2. Admin Quick Navigation Hub ── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-heading font-semibold text-foreground">
              Admin Governance Modules
            </h2>
            <p className="text-xs text-muted-foreground">
              Direct access to all specialized administrative management, monitoring, and audit views
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {NAV_SHORTCUTS.map((item, idx) => {
            const Icon = item.icon;
            return (
              <motion.div
                key={item.path}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.04 }}
                whileHover={{ y: -3, transition: { duration: 0.2 } }}
              >
                <Link to={item.path} className="block h-full">
                  <Card className="glass-card h-full p-4 transition-all hover:border-primary/40 hover:shadow-lg dark:hover:shadow-primary/5">
                    <div className="flex items-start gap-3">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${item.color}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                          {item.label}
                        </h3>
                        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                          {item.description}
                        </p>
                      </div>
                    </div>
                  </Card>
                </Link>
              </motion.div>
              );
            })}
        </div>
      </section>

      {/* ── 3. Visualizations: Trends & Status Breakdown ── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-heading font-semibold text-foreground">
            Complaint Velocity & Status Breakdown
          </h2>
          <span className="text-xs text-muted-foreground">
            Six-month intake trajectory vs resolution output
          </span>
        </div>

        <Charts
          trendData={trendData}
          statusData={statusData}
          statusColors={STATUS_COLORS}
        />
      </section>

      {/* ── 4. Department Performance Breakdown Cards ── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-heading font-semibold text-foreground">
              Department Governance Breakdown
            </h2>
            <p className="text-xs text-muted-foreground">
              Real-time complaint allocation and resolution rate across all municipal departments
            </p>
          </div>
          <Link
            to="/admin/department-performance"
            className="text-xs font-semibold text-primary hover:underline"
          >
            View full performance details →
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {(data?.departmentBreakdown || []).map((dept, index) => {
            const hasComplaints = dept.total > 0;
            return (
              <motion.div
                key={dept.department}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card className="glass-card p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-foreground text-sm truncate">
                      {dept.department}
                    </h3>
                    <Badge variant={hasComplaints ? "secondary" : "outline"} className="text-xs">
                      {dept.total} {dept.total === 1 ? "case" : "cases"}
                    </Badge>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Resolution Rate</span>
                      <span className="font-semibold text-foreground">{dept.resolutionRate}%</span>
                    </div>

                    {/* Progress Bar */}
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-500 rounded-full"
                        style={{ width: `${dept.resolutionRate}%` }}
                      />
                    </div>

                    {/* Breakdown counts */}
                    <div className="grid grid-cols-4 gap-1 pt-2 text-center text-[11px]">
                      <div className="rounded bg-muted/40 p-1">
                        <p className="text-muted-foreground">Pend</p>
                        <p className="font-semibold text-foreground">{dept.pending}</p>
                      </div>
                      <div className="rounded bg-muted/40 p-1">
                        <p className="text-muted-foreground">Asgn</p>
                        <p className="font-semibold text-foreground">{dept.assigned}</p>
                      </div>
                      <div className="rounded bg-muted/40 p-1">
                        <p className="text-muted-foreground">Prog</p>
                        <p className="font-semibold text-foreground">{dept.inProgress}</p>
                      </div>
                      <div className="rounded bg-muted/40 p-1">
                        <p className="text-muted-foreground">Done</p>
                        <p className="font-semibold text-foreground">{dept.resolved}</p>
                      </div>
                    </div>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </section>
    </div>
  );
};

export default AdminDashboard;
