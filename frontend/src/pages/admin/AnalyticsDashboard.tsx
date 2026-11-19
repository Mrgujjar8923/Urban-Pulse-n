import React from "react";
import { motion } from "framer-motion";
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  Filter,
  Layers,
  Minus,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Timer,
  TrendingUp,
  Zap,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DEPARTMENTS } from "@/config/departments";
import {
  adminApi,
  type AdminAnalyticsResponse,
  type AnalyticsDepartmentItem,
  type AnalyticsPriorityItem,
  type AnalyticsTrendPoint,
} from "@/services/adminApi";
import { ApiErrorPanel } from "@/components/shared/ApiErrorPanel";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const DATE_RANGE_OPTIONS = [
  { label: "All Time", value: "allTime" },
  { label: "Last 7 Days", value: "last7Days" },
  { label: "Last 30 Days", value: "last30Days" },
  { label: "Last 6 Months", value: "last6Months" },
  { label: "This Year", value: "thisYear" },
];

const INTERVAL_OPTIONS = [
  { label: "Daily", value: "daily" },
  { label: "Weekly", value: "weekly" },
  { label: "Monthly", value: "monthly" },
];

const PRIORITY_COLORS: Record<string, string> = {
  Critical: "#ef4444",
  High: "#f97316",
  Medium: "#3b82f6",
  Low: "#10b981",
  Unknown: "#64748b",
};

const AnalyticsDashboard: React.FC = () => {
  const [analytics, setAnalytics] = React.useState<AdminAnalyticsResponse | null>(null);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [loadError, setLoadError] = React.useState<unknown>(null);

  // Filters
  const [department, setDepartment] = React.useState<string>("All Departments");
  const [dateRange, setDateRange] = React.useState<string>("allTime");
  const [interval, setInterval] = React.useState<string>("monthly");

  const loadData = React.useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const data = await adminApi.getAnalytics({
        department: department === "All Departments" ? undefined : department,
        dateRange,
        interval,
      });
      setAnalytics(data);
    } catch (err) {
      console.error("Failed to load admin analytics", err);
      setLoadError(err);
    } finally {
      setLoading(false);
    }
  }, [department, dateRange, interval]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const handleClearFilters = () => {
    setDepartment("All Departments");
    setDateRange("allTime");
    setInterval("monthly");
  };

  const hasActiveFilters = department !== "All Departments" || dateRange !== "allTime" || interval !== "monthly";

  const summary = analytics?.summary;
  const trends = analytics?.trends;
  const departments = React.useMemo(() => analytics?.departments || [], [analytics?.departments]);
  const resolution = analytics?.resolution;
  const sla = analytics?.sla;
  const priority = analytics?.priority;

  // Format trend data for recharts
  const trendData = React.useMemo(() => {
    if (!trends?.points) return [];
    return trends.points.map((p: AnalyticsTrendPoint) => ({
      ...p,
      name: p.period,
    }));
  }, [trends]);

  // Format department data for bar chart
  const departmentChartData = React.useMemo(() => {
    return departments.map((d: AnalyticsDepartmentItem) => ({
      name: d.department,
      Total: d.total,
      Resolved: d.resolved,
      Overdue: d.overdue,
      Pending: d.pending,
    }));
  }, [departments]);

  // Priority pie chart data
  const priorityChartData = React.useMemo(() => {
    if (!priority?.breakdown) return [];
    return priority.breakdown
      .filter((p: AnalyticsPriorityItem) => p.count > 0)
      .map((p: AnalyticsPriorityItem) => ({
        name: p.priority,
        value: p.count,
        color: PRIORITY_COLORS[p.priority] || "#64748b",
      }));
  }, [priority]);

  if (loadError) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-heading font-bold text-foreground">Advanced Admin Analytics</h1>
          <button
            onClick={() => loadData()}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </button>
        </div>
        <ApiErrorPanel error={loadError} onRetry={() => loadData()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Header & Controls */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-heading font-bold text-foreground">Advanced Analytics & Governance Intelligence</h1>
            <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/20">
              Live Database
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Complaint trajectory, departmental resolution efficiency, SLA compliance, and urgency distribution.
          </p>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Department selector */}
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground shadow-sm">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <select
              aria-label="Filter by Department"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="cursor-pointer bg-transparent text-xs text-foreground outline-none font-medium"
            >
              <option value="All Departments">All Departments</option>
              {DEPARTMENTS.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>

          {/* Date Range selector */}
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground shadow-sm">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            <select
              aria-label="Filter by Date Range"
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="cursor-pointer bg-transparent text-xs text-foreground outline-none font-medium"
            >
              {DATE_RANGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Trend Interval selector */}
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground shadow-sm">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <select
              aria-label="Trend Time Interval"
              value={interval}
              onChange={(e) => setInterval(e.target.value)}
              className="cursor-pointer bg-transparent text-xs text-foreground outline-none font-medium"
            >
              {INTERVAL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label} Trend
                </option>
              ))}
            </select>
          </div>

          {/* Clear Filters */}
          {hasActiveFilters && (
            <button
              onClick={handleClearFilters}
              className="flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition"
              title="Reset all filters to default"
            >
              <RotateCcw className="h-3 w-3" /> Clear
            </button>
          )}

          {/* Refresh button */}
          <button
            onClick={() => loadData()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-primary" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Active Filter Badges */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground font-medium">Active Filters:</span>
          {department !== "All Departments" && (
            <Badge variant="secondary" className="gap-1 bg-primary/10 text-primary border-primary/20">
              Department: {department}
            </Badge>
          )}
          {dateRange !== "allTime" && (
            <Badge variant="secondary" className="gap-1 bg-info/10 text-info border-info/20">
              Range: {DATE_RANGE_OPTIONS.find((o) => o.value === dateRange)?.label}
            </Badge>
          )}
          {interval !== "monthly" && (
            <Badge variant="secondary" className="gap-1 bg-amber-500/10 text-amber-500 border-amber-500/20">
              Interval: {INTERVAL_OPTIONS.find((o) => o.value === interval)?.label}
            </Badge>
          )}
        </div>
      )}

      {/* Loading state indicator */}
      {loading && !analytics ? (
        <Card className="glass-card p-12 text-center">
          <RefreshCw className="mx-auto h-8 w-8 animate-spin text-primary opacity-80" />
          <p className="mt-4 text-sm text-muted-foreground">Aggregating live administrative intelligence...</p>
        </Card>
      ) : summary?.totalComplaints === 0 ? (
        <Card className="glass-card p-12 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-muted-foreground opacity-60" />
          <h3 className="mt-3 text-base font-semibold text-foreground">No complaints match the selected filters</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Try adjusting your department or date range filter to view analytics records.
          </p>
          <button
            onClick={handleClearFilters}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset Filters
          </button>
        </Card>
      ) : (
        <>
          {/* 2. Primary KPI Summary Cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {/* Card 1: Total Complaints */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
              <Card className="glass-card p-4 hover:border-primary/40 transition">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Total Complaints</span>
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <FileText className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-bold font-heading text-foreground">{summary?.totalComplaints ?? 0}</span>
                </div>
                <div className="mt-1 flex items-center text-xs text-muted-foreground">
                  {trends?.comparison ? (
                    <span
                      className={`inline-flex items-center gap-0.5 font-medium ${
                        trends.comparison.trendDirection === "up"
                          ? "text-emerald-500"
                          : trends.comparison.trendDirection === "down"
                          ? "text-rose-500"
                          : "text-muted-foreground"
                      }`}
                    >
                      {trends.comparison.trendDirection === "up" ? (
                        <ArrowUpRight className="h-3 w-3" />
                      ) : trends.comparison.trendDirection === "down" ? (
                        <ArrowDownRight className="h-3 w-3" />
                      ) : (
                        <Minus className="h-3 w-3" />
                      )}
                      {trends.comparison.percentChange > 0 ? `+${trends.comparison.percentChange}%` : `${trends.comparison.percentChange}%`}
                      <span className="text-[10px] text-muted-foreground ml-1">vs prev</span>
                    </span>
                  ) : (
                    <span>All-time database count</span>
                  )}
                </div>
              </Card>
            </motion.div>

            {/* Card 2: Resolution Rate */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05 }}>
              <Card className="glass-card p-4 hover:border-emerald-500/40 transition">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Resolution Rate</span>
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-bold font-heading text-foreground">{summary?.resolutionRate ?? 0}%</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {summary?.resolvedCount ?? 0} of {summary?.totalComplaints ?? 0} resolved
                </p>
              </Card>
            </motion.div>

            {/* Card 3: SLA Compliance */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
              <Card className="glass-card p-4 hover:border-amber-500/40 transition">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">SLA Compliance</span>
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
                    <Timer className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-bold font-heading text-foreground">{summary?.slaComplianceRate ?? 100}%</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {sla?.compliantWithSla ?? 0} of {sla?.totalTracked ?? 0} on target
                </p>
              </Card>
            </motion.div>

            {/* Card 4: Avg Resolution Time */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.15 }}>
              <Card className="glass-card p-4 hover:border-blue-500/40 transition">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Avg Resolution</span>
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
                    <Clock className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-2xl font-bold font-heading text-foreground">
                    {summary?.avgResolutionHours && summary.avgResolutionHours > 0
                      ? `${summary.avgResolutionHours}h`
                      : summary?.resolvedCount && summary.resolvedCount > 0
                      ? "< 1h"
                      : "0h"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Median: {summary?.medianResolutionHours ? `${summary.medianResolutionHours}h` : "< 1h"}
                </p>
              </Card>
            </motion.div>

            {/* Card 5: Active Backlog */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.2 }}>
              <Card className="glass-card p-4 hover:border-sky-500/40 transition">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Active Backlog</span>
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/10 text-sky-500">
                    <Layers className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-bold font-heading text-foreground">{summary?.activeBacklog ?? 0}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {summary?.pendingCount ?? 0} Pending · {summary?.assignedCount ?? 0} Assigned · {summary?.inProgressCount ?? 0} In Progress
                </p>
              </Card>
            </motion.div>

            {/* Card 6: Critical & Overdue */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.25 }}>
              <Card className="glass-card p-4 hover:border-rose-500/40 transition">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Critical & Overdue</span>
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-500/10 text-rose-500">
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-bold font-heading text-foreground">{summary?.criticalCount ?? 0}</span>
                  <span className="text-xs text-rose-500 font-semibold">Critical</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  <span className="font-semibold text-amber-500">{summary?.overdueCount ?? 0}</span> overdue open items
                </p>
              </Card>
            </motion.div>
          </div>

          {/* 3. Complaint Trends Over Time */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.2 }}>
            <Card className="glass-card p-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 gap-2">
                <div>
                  <h3 className="flex items-center gap-2 text-base font-heading font-semibold text-foreground">
                    <TrendingUp className="h-4 w-4 text-primary" /> Complaint Volume & Lifecycle Trajectory
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Aggregated by {interval} interval. Displays new submissions against closed resolutions.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {/* Interval pill buttons */}
                  <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5 text-xs">
                    {INTERVAL_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setInterval(opt.value)}
                        className={`rounded-md px-2.5 py-1 font-medium transition ${
                          interval === opt.value
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {trendData.length === 0 ? (
                <div className="py-12 text-center text-xs text-muted-foreground">
                  No historical trend points recorded for the current scope.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={trendData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        borderColor: "hsl(var(--border))",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                    />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                    <Line
                      type="monotone"
                      dataKey="submitted"
                      stroke="#38bdf8"
                      strokeWidth={2.5}
                      dot={{ r: 4, fill: "#38bdf8" }}
                      activeDot={{ r: 6 }}
                      name="Submitted"
                    />
                    <Line
                      type="monotone"
                      dataKey="resolved"
                      stroke="#10b981"
                      strokeWidth={2.5}
                      dot={{ r: 4, fill: "#10b981" }}
                      activeDot={{ r: 6 }}
                      name="Resolved"
                    />
                    <Line
                      type="monotone"
                      dataKey="pending"
                      stroke="#f59e0b"
                      strokeWidth={1.5}
                      strokeDasharray="4 4"
                      dot={{ r: 3, fill: "#f59e0b" }}
                      name="Pending"
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </Card>
          </motion.div>

          {/* 4. Department Comparison & Workload Matrix */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Department Bar Chart */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.25 }}>
              <Card className="glass-card p-5 h-full flex flex-col justify-between">
                <div>
                  <h3 className="flex items-center gap-2 text-base font-heading font-semibold text-foreground">
                    <Layers className="h-4 w-4 text-primary" /> Department Workload & Backlog Comparison
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Categorized volume across civic departments, contrasting resolved vs overdue items.
                  </p>
                </div>
                <div className="py-4">
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={departmentChartData} margin={{ top: 10, right: 10, left: -10, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                        angle={-15}
                        textAnchor="end"
                      />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          borderColor: "hsl(var(--border))",
                          borderRadius: "8px",
                          fontSize: "12px",
                        }}
                      />
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                      <Bar dataKey="Total" fill="#38bdf8" radius={[4, 4, 0, 0]} name="Total" />
                      <Bar dataKey="Resolved" fill="#10b981" radius={[4, 4, 0, 0]} name="Resolved" />
                      <Bar dataKey="Overdue" fill="#ef4444" radius={[4, 4, 0, 0]} name="Overdue" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </motion.div>

            {/* Department Efficiency Table */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.3 }}>
              <Card className="glass-card p-5 h-full flex flex-col justify-between">
                <div>
                  <h3 className="flex items-center gap-2 text-base font-heading font-semibold text-foreground">
                    <Zap className="h-4 w-4 text-amber-500" /> Departmental Efficiency & SLA Scorecard
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Real-time completion percentage, SLA adherence, and systemic workload share.
                  </p>
                </div>

                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground">
                        <th className="py-2 font-medium">Department</th>
                        <th className="py-2 text-center font-medium">Total</th>
                        <th className="py-2 text-center font-medium">Resolution</th>
                        <th className="py-2 text-center font-medium">SLA Adherence</th>
                        <th className="py-2 text-right font-medium">Share</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {departments.map((dept: AnalyticsDepartmentItem) => (
                        <tr key={dept.department} className="hover:bg-muted/30">
                          <td className="py-2.5 font-medium text-foreground">{dept.department}</td>
                          <td className="py-2.5 text-center font-mono">{dept.total}</td>
                          <td className="py-2.5 text-center">
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                dept.resolutionRate >= 50
                                  ? "bg-emerald-500/10 text-emerald-500"
                                  : dept.resolutionRate > 0
                                  ? "bg-amber-500/10 text-amber-500"
                                  : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {dept.resolutionRate}%
                            </span>
                          </td>
                          <td className="py-2.5 text-center">
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                dept.slaComplianceRate >= 80
                                  ? "bg-emerald-500/10 text-emerald-500"
                                  : dept.slaComplianceRate >= 50
                                  ? "bg-amber-500/10 text-amber-500"
                                  : "bg-rose-500/10 text-rose-500"
                              }`}
                            >
                              {dept.slaComplianceRate}%
                            </span>
                          </td>
                          <td className="py-2.5 text-right font-mono text-muted-foreground">{dept.workloadShare}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </motion.div>
          </div>

          {/* 5. Resolution Efficiency & Ageing Analysis */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Resolution Efficiency Card */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.35 }}>
              <Card className="glass-card p-5">
                <h3 className="flex items-center gap-2 text-base font-heading font-semibold text-foreground">
                  <Clock className="h-4 w-4 text-blue-500" /> Resolution Velocity & Department Benchmark
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Resolution timeline metrics computed across closed complaints.
                </p>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-border bg-card/60 p-3">
                    <span className="text-[11px] text-muted-foreground">Average Resolution Time</span>
                    <p className="mt-1 text-xl font-bold font-heading text-foreground">
                      {resolution?.avgResolutionHours && resolution.avgResolutionHours > 0
                        ? `${resolution.avgResolutionHours} hrs`
                        : summary?.resolvedCount && summary.resolvedCount > 0
                        ? "< 1 hr"
                        : "N/A"}
                    </p>
                    <span className="text-[10px] text-muted-foreground">From start to resolution</span>
                  </div>

                  <div className="rounded-lg border border-border bg-card/60 p-3">
                    <span className="text-[11px] text-muted-foreground">Median Resolution Time</span>
                    <p className="mt-1 text-xl font-bold font-heading text-foreground">
                      {resolution?.medianResolutionHours && resolution.medianResolutionHours > 0
                        ? `${resolution.medianResolutionHours} hrs`
                        : summary?.resolvedCount && summary.resolvedCount > 0
                        ? "< 1 hr"
                        : "N/A"}
                    </p>
                    <span className="text-[10px] text-muted-foreground">50th percentile metric</span>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2 text-xs">
                    <span className="text-muted-foreground">Fastest Department:</span>
                    <span className="font-semibold text-foreground">
                      {resolution?.fastestDepartment
                        ? `${resolution.fastestDepartment.department} (${resolution.fastestDepartment.avgHours}h)`
                        : "No resolutions recorded"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2 text-xs">
                    <span className="text-muted-foreground">Slowest Department:</span>
                    <span className="font-semibold text-foreground">
                      {resolution?.slowestDepartment
                        ? `${resolution.slowestDepartment.department} (${resolution.slowestDepartment.avgHours}h)`
                        : "No resolutions recorded"}
                    </span>
                  </div>
                </div>
              </Card>
            </motion.div>

            {/* Unresolved Complaints Ageing */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.4 }}>
              <Card className="glass-card p-5">
                <div className="flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-base font-heading font-semibold text-foreground">
                    <Timer className="h-4 w-4 text-amber-500" /> Open Complaints Ageing Breakdown
                  </h3>
                  <Badge variant="outline" className="text-xs">
                    {resolution?.unresolvedCount ?? 0} Open
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Age of unresolved backlog items since initial citizen filing.
                </p>

                <div className="mt-4 space-y-3">
                  {(resolution?.ageingBuckets || []).map((bucket) => (
                    <div key={bucket.range} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-foreground">{bucket.range}</span>
                        <span className="font-mono text-muted-foreground">
                          {bucket.count} items ({bucket.percentage}%)
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            bucket.range === "< 24 Hours"
                              ? "bg-emerald-500"
                              : bucket.range === "1 - 3 Days"
                              ? "bg-blue-500"
                              : bucket.range === "3 - 7 Days"
                              ? "bg-amber-500"
                              : "bg-rose-500"
                          }`}
                          style={{ width: `${bucket.percentage}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </motion.div>
          </div>

          {/* 6. SLA Compliance & Escalations + Priority Distribution */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* SLA Compliance & Escalations */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.45 }}>
              <Card className="glass-card p-5">
                <div className="flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-base font-heading font-semibold text-foreground">
                    <ShieldAlert className="h-4 w-4 text-rose-500" /> SLA Compliance & Escalation Analysis
                  </h3>
                  <Badge
                    variant="outline"
                    className={`text-xs ${
                      (sla?.complianceRate ?? 100) >= 80
                        ? "text-emerald-500 border-emerald-500/20"
                        : "text-rose-500 border-rose-500/20"
                    }`}
                  >
                    {sla?.complianceRate ?? 100}% Health
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Contractual resolution SLA tracking against dynamic urgency timers.
                </p>

                <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-lg border border-border bg-emerald-500/5 p-3">
                    <span className="text-[11px] font-medium text-muted-foreground">Within SLA</span>
                    <p className="mt-1 text-2xl font-bold font-heading text-emerald-500">{sla?.compliantWithSla ?? 0}</p>
                    <span className="text-[10px] text-muted-foreground">On target</span>
                  </div>
                  <div className="rounded-lg border border-border bg-rose-500/5 p-3">
                    <span className="text-[11px] font-medium text-muted-foreground">Breached / Overdue</span>
                    <p className="mt-1 text-2xl font-bold font-heading text-rose-500">{sla?.breached ?? 0}</p>
                    <span className="text-[10px] text-muted-foreground">Deadline passed</span>
                  </div>
                  <div className="rounded-lg border border-border bg-amber-500/5 p-3">
                    <span className="text-[11px] font-medium text-muted-foreground">Escalations</span>
                    <p className="mt-1 text-2xl font-bold font-heading text-amber-500">{sla?.totalEscalations ?? 0}</p>
                    <span className="text-[10px] text-muted-foreground">Triggered events</span>
                  </div>
                </div>

                <div className="mt-4 rounded-lg bg-muted/30 p-3 text-xs text-muted-foreground">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
                    <div>
                      <p className="font-semibold text-foreground">SLA Breach Governance Notice</p>
                      <p className="mt-0.5">
                        Overdue complaints automatically trigger timeline escalation events notifying department authorities.
                        {sla?.breached ? ` Currently, ${sla.breached} items have exceeded their allotted resolution window.` : " All complaints are currently operating within allotted SLA boundaries."}
                      </p>
                    </div>
                  </div>
                </div>
              </Card>
            </motion.div>

            {/* Priority & Urgency Distribution */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.5 }}>
              <Card className="glass-card p-5">
                <div className="flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-base font-heading font-semibold text-foreground">
                    <Zap className="h-4 w-4 text-primary" /> AI Priority & Urgency Distribution
                  </h3>
                  <Badge variant="outline" className="text-xs">
                    Avg Urgency: {summary?.avgUrgencyScore ?? 0} / 10
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Severity classification assigned by Gemini AI and manual assessment.
                </p>

                <div className="mt-3 flex flex-col sm:flex-row items-center gap-4">
                  {/* Pie chart */}
                  <div className="w-44 h-44 shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={priorityChartData}
                          cx="50%"
                          cy="50%"
                          innerRadius={45}
                          outerRadius={70}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {priorityChartData.map((entry) => (
                            <Cell key={entry.name} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            borderColor: "hsl(var(--border))",
                            borderRadius: "8px",
                            fontSize: "12px",
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Priority breakdown legend & table */}
                  <div className="flex-1 w-full space-y-2">
                    {(priority?.breakdown || []).map((item: AnalyticsPriorityItem) => (
                      <div key={item.priority} className="flex items-center justify-between text-xs py-1 border-b border-border/50">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: PRIORITY_COLORS[item.priority] || "#64748b" }}
                          />
                          <span className="font-medium text-foreground">{item.priority}</span>
                        </div>
                        <div className="flex items-center gap-3 font-mono">
                          <span className="text-foreground">{item.count}</span>
                          <span className="text-muted-foreground text-[11px] w-12 text-right">{item.percentage}%</span>
                          {item.overdue > 0 && (
                            <span className="text-rose-500 font-semibold text-[11px]">{item.overdue} overdue</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            </motion.div>
          </div>
        </>
      )}
    </div>
  );
};

export default AnalyticsDashboard;
