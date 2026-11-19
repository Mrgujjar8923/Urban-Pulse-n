import React, { useEffect, useState, useMemo } from "react";
import {
  Download,
  FileBarChart,
  FileText,
  Clock,
  RefreshCw,
  XCircle,
  AlertCircle,
  AlertTriangle,
  Calendar,
  Building2,
  CheckCircle2,
} from "lucide-react";
import { adminApi, AdminOverviewStats, DepartmentPerformanceRecord } from "@/services/adminApi";
import { complaintsApi, ComplaintRecord } from "@/services/complaintsApi";
import { DEPARTMENTS } from "@/config/departments";
import { ApiErrorPanel } from "@/components/shared/ApiErrorPanel";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const DATE_RANGES = [
  "All Time",
  "Last 7 Days",
  "Last 30 Days",
  "Last 6 Months",
  "This Year",
  "Custom Range",
] as const;

export type DateRangeOption = (typeof DATE_RANGES)[number];

export const STATUS_OPTIONS = [
  "All Statuses",
  "Pending",
  "Assigned",
  "In Progress",
  "Resolved",
] as const;

export type StatusOption = (typeof STATUS_OPTIONS)[number];

export const PRIORITY_OPTIONS = [
  "All Priorities",
  "Critical",
  "High",
  "Medium",
  "Low",
] as const;

export type PriorityOption = (typeof PRIORITY_OPTIONS)[number];

/**
 * Sanitizes a CSV cell against Formula Injection (CWE-1236)
 * while correctly escaping commas, quotes, and newlines.
 */
export const sanitizeCsvCell = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "";
  }
  let str = String(value);

  // Check if string starts with formula triggers (=, +, -, @, \t, \r)
  const trimmed = str.trimStart();
  if (/^[=+\-@\t\r]/.test(trimmed)) {
    // Exclude standalone numbers from formula escaping (e.g. -5, +42, -12.5)
    const isPureNumber =
      !isNaN(Number(trimmed)) &&
      !trimmed.startsWith("=") &&
      !trimmed.startsWith("@");
    if (!isPureNumber) {
      str = `'${str}`;
    }
  }

  // If cell contains comma, double quote, newline, or carriage return, escape quotes and wrap in quotes
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

const getCutoffDate = (range: DateRangeOption): Date | null => {
  const now = new Date();
  if (range === "All Time" || range === "Custom Range") return null;
  const next = new Date(now);
  if (range === "Last 7 Days") next.setDate(now.getDate() - 7);
  if (range === "Last 30 Days") next.setDate(now.getDate() - 30);
  if (range === "Last 6 Months") next.setMonth(now.getMonth() - 6);
  if (range === "This Year") next.setMonth(0, 1);
  next.setHours(0, 0, 0, 0);
  return next;
};

export const AdminReports: React.FC = () => {
  const [stats, setStats] = useState<AdminOverviewStats | null>(null);
  const [, setDepartments] = useState<DepartmentPerformanceRecord[]>([]);
  const [complaints, setComplaints] = useState<ComplaintRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  // ── Filter State ──
  const [selectedDept, setSelectedDept] = useState<string>("All Departments");
  const [selectedStatus, setSelectedStatus] = useState<StatusOption>("All Statuses");
  const [selectedPriority, setSelectedPriority] = useState<PriorityOption>("All Priorities");
  const [selectedDateRange, setSelectedDateRange] = useState<DateRangeOption>("All Time");
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");

  const loadAllReportData = async () => {
    setLoading(true);
    setError(null);
    setExportError(null);
    try {
      const [overviewStats, deptStats, allComplaints] = await Promise.all([
        adminApi.getOverviewStats(),
        adminApi.getDepartmentPerformance(),
        complaintsApi.listAll(),
      ]);
      setStats(overviewStats);
      setDepartments(deptStats);
      setComplaints(allComplaints);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllReportData();
  }, []);

  // Validation: Check if custom date range is invalid (end date < start date)
  const isInvalidDateRange = useMemo(() => {
    if (selectedDateRange === "Custom Range" && customStartDate && customEndDate) {
      return new Date(customStartDate) > new Date(customEndDate);
    }
    return false;
  }, [selectedDateRange, customStartDate, customEndDate]);

  const isFiltered =
    selectedDept !== "All Departments" ||
    selectedStatus !== "All Statuses" ||
    selectedPriority !== "All Priorities" ||
    selectedDateRange !== "All Time" ||
    Boolean(customStartDate || customEndDate);

  const clearFilters = () => {
    setSelectedDept("All Departments");
    setSelectedStatus("All Statuses");
    setSelectedPriority("All Priorities");
    setSelectedDateRange("All Time");
    setCustomStartDate("");
    setCustomEndDate("");
    setExportError(null);
  };

  // ── Filtered Complaints ──
  const filteredComplaints = useMemo(() => {
    if (isInvalidDateRange) {
      return [];
    }

    let startCutoff: Date | null = null;
    let endCutoff: Date | null = null;

    if (selectedDateRange === "Custom Range") {
      if (customStartDate) {
        startCutoff = new Date(customStartDate);
        startCutoff.setHours(0, 0, 0, 0);
      }
      if (customEndDate) {
        endCutoff = new Date(customEndDate);
        endCutoff.setHours(23, 59, 59, 999);
      }
    } else {
      startCutoff = getCutoffDate(selectedDateRange);
    }

    return complaints.filter((c) => {
      const matchDept = selectedDept === "All Departments" || c.category === selectedDept;
      const matchStatus = selectedStatus === "All Statuses" || c.status === selectedStatus;

      const compPriority = (c.priority || c.aiAnalysis?.priority || "Medium").toLowerCase();
      const matchPriority =
        selectedPriority === "All Priorities" ||
        compPriority === selectedPriority.toLowerCase();

      const createdTime = new Date(c.createdAt).getTime();
      const matchStart = !startCutoff || createdTime >= startCutoff.getTime();
      const matchEnd = !endCutoff || createdTime <= endCutoff.getTime();

      return matchDept && matchStatus && matchPriority && matchStart && matchEnd;
    });
  }, [
    complaints,
    selectedDept,
    selectedStatus,
    selectedPriority,
    selectedDateRange,
    customStartDate,
    customEndDate,
    isInvalidDateRange,
  ]);

  // ── Filtered Department Matrix ──
  const filteredDepartmentMatrix = useMemo(() => {
    const now = new Date();
    const deptsToShow = selectedDept === "All Departments" ? DEPARTMENTS : [selectedDept];

    return deptsToShow.map((deptName) => {
      const deptComplaints = filteredComplaints.filter((c) => c.category === deptName);
      const totalCases = deptComplaints.length;
      const resolved = deptComplaints.filter((c) => c.status === "Resolved").length;
      const overdue = deptComplaints.filter((c) => (
        c.status !== "Resolved" &&
        c.sla?.deadline &&
        new Date(c.sla.deadline) < now
      )).length;
      const resolutionRate = totalCases > 0 ? Number(((resolved / totalCases) * 100).toFixed(1)) : 0;

      const resolvedWithTimes = deptComplaints.filter((c) => (
        c.status === "Resolved" && c.sla?.startedAt && c.sla?.resolvedAt
      ));
      const avgResolutionHours = resolvedWithTimes.length > 0
        ? Number((resolvedWithTimes.reduce((sum, c) => {
            const diff = (new Date(c.sla!.resolvedAt!).getTime() - new Date(c.sla!.startedAt!).getTime()) / (1000 * 60 * 60);
            return sum + Math.max(0, diff);
          }, 0) / resolvedWithTimes.length).toFixed(1))
        : 0;

      // Filtered citizen rating calculation using complaints in active scope
      const complaintsWithFeedback = deptComplaints.filter(
        (c) => c.feedback && typeof c.feedback.rating === "number" && c.feedback.rating > 0
      );
      const citizenRating = complaintsWithFeedback.length > 0
        ? `${(complaintsWithFeedback.reduce((sum, c) => sum + c.feedback!.rating, 0) / complaintsWithFeedback.length).toFixed(1)} / 5`
        : "—";

      return {
        department: deptName,
        total: totalCases,
        resolved,
        overdue,
        resolutionRate,
        avgResolutionHours,
        citizenRating,
      };
    });
  }, [filteredComplaints, selectedDept]);

  // Helper for export download suffix
  const filterSuffix = isFiltered ? "_filtered" : "";

  // ── CSV Export 1: Complaints Master (Enriched & Sanitized) ──
  const exportComplaintsCsv = () => {
    setExportError(null);
    try {
      const headers = [
        "ID",
        "Reference",
        "Title",
        "Department",
        "Status",
        "Priority",
        "Created By",
        "Assigned To",
        "Created At",
        "SLA Deadline",
        "SLA Status",
        "Location",
        "AI Urgency Score",
        "Resolved At",
        "Actual Resolution Duration (Hours)",
        "Citizen Rating",
        "Feedback Comments",
      ];

      const rows = filteredComplaints.map((c) => {
        const priority = c.priority || c.aiAnalysis?.priority || "Medium";
        const urgencyScore =
          c.aiUrgencyScore != null
            ? c.aiUrgencyScore
            : c.aiAnalysis?.urgencyScore != null
            ? c.aiAnalysis.urgencyScore
            : "N/A";
        const resolvedAt =
          c.sla?.resolvedAt ||
          (c.status === "Resolved" && c.updatedAt ? c.updatedAt : "N/A");

        let durationHours = "N/A";
        if (c.sla?.startedAt && c.sla?.resolvedAt) {
          const diff =
            (new Date(c.sla.resolvedAt).getTime() -
              new Date(c.sla.startedAt).getTime()) /
            (1000 * 60 * 60);
          durationHours = String(Number(Math.max(0, diff).toFixed(1)));
        }

        const citizenRating =
          c.feedback?.rating != null ? `${c.feedback.rating} / 5` : "N/A";
        const feedbackComment = c.feedback?.comment ? c.feedback.comment : "N/A";

        return [
          sanitizeCsvCell(c.id),
          sanitizeCsvCell(c.reference),
          sanitizeCsvCell(c.title),
          sanitizeCsvCell(c.category),
          sanitizeCsvCell(c.status),
          sanitizeCsvCell(priority),
          sanitizeCsvCell(c.createdBy?.name || "Citizen"),
          sanitizeCsvCell(c.assignedTo?.name || "Unassigned"),
          sanitizeCsvCell(c.createdAt),
          sanitizeCsvCell(c.sla?.deadline || "N/A"),
          sanitizeCsvCell(c.sla?.slaStatus || "Unavailable"),
          sanitizeCsvCell(c.location || "N/A"),
          sanitizeCsvCell(urgencyScore),
          sanitizeCsvCell(resolvedAt),
          sanitizeCsvCell(durationHours),
          sanitizeCsvCell(citizenRating),
          sanitizeCsvCell(feedbackComment),
        ];
      });

      const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute(
        "download",
        `govai_complaints_report${filterSuffix}_${new Date().toISOString().slice(0, 10)}.csv`
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[Reports] CSV Export failed", err);
      setExportError("Failed to generate CSV export. Please retry.");
    }
  };

  // ── CSV Export 2: Department Compliance Summary (Sanitized) ──
  const exportDepartmentSummaryCsv = () => {
    setExportError(null);
    try {
      const headers = [
        "Department",
        "Total Cases",
        "Resolved",
        "Overdue",
        "Resolution Rate",
        "Average Resolution Hours",
        "Average Citizen Rating",
      ];

      const rows = filteredDepartmentMatrix.map((dept) => [
        sanitizeCsvCell(dept.department),
        sanitizeCsvCell(dept.total),
        sanitizeCsvCell(dept.resolved),
        sanitizeCsvCell(dept.overdue),
        sanitizeCsvCell(`${dept.resolutionRate}%`),
        sanitizeCsvCell(`${dept.avgResolutionHours}h`),
        sanitizeCsvCell(dept.citizenRating),
      ]);

      const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute(
        "download",
        `govai_department_compliance_summary${filterSuffix}_${new Date().toISOString().slice(0, 10)}.csv`
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[Reports] Department Summary CSV Export failed", err);
      setExportError("Failed to generate Department Summary CSV export. Please retry.");
    }
  };

  // ── JSON Export: Department Audit Package (Respects Filters) ──
  const exportDepartmentJson = () => {
    setExportError(null);
    try {
      const jsonContent = JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          activeFilters: {
            department: selectedDept,
            status: selectedStatus,
            priority: selectedPriority,
            dateRange: selectedDateRange,
            customStartDate: selectedDateRange === "Custom Range" ? customStartDate || null : null,
            customEndDate: selectedDateRange === "Custom Range" ? customEndDate || null : null,
          },
          totalRecords: filteredComplaints.length,
          systemMetrics: stats?.metrics || {},
          departments: filteredDepartmentMatrix,
          complaints: filteredComplaints,
        },
        null,
        2
      );
      const blob = new Blob([jsonContent], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute(
        "download",
        `govai_department_audit${filterSuffix}_${new Date().toISOString().slice(0, 10)}.json`
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[Reports] JSON Export failed", err);
      setExportError("Failed to generate JSON export. Please retry.");
    }
  };

  return (
    <div className="space-y-6" data-testid="admin-reports-page">
      {/* ── Header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">
            Governance &amp; Audit Reports
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Exportable regulatory summaries, SLA compliance matrices, and departmental audits.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={loadAllReportData}
          disabled={loading}
          className="rounded-xl border-border bg-card shadow-sm hover:bg-muted"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error && <ApiErrorPanel error={error} onRetry={loadAllReportData} />}

      {exportError && (
        <Card className="glass-card border-destructive/40 bg-destructive/10 p-4">
          <div className="flex items-center gap-3 text-destructive text-sm">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <p>{exportError}</p>
          </div>
        </Card>
      )}

      {/* ── Interactive Filters ── */}
      <Card className="glass-card p-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              {/* Department Filter */}
              <div className="flex items-center gap-2 rounded-xl border border-border bg-background/50 px-3 py-1.5 text-xs">
                <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                <select
                  aria-label="Department Filter"
                  data-testid="department-filter-select"
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

              {/* Status Filter */}
              <div className="flex items-center gap-2 rounded-xl border border-border bg-background/50 px-3 py-1.5 text-xs">
                <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
                <select
                  aria-label="Status Filter"
                  data-testid="status-filter-select"
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value as StatusOption)}
                  className="bg-transparent font-medium text-foreground outline-none cursor-pointer"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              {/* Priority Filter */}
              <div className="flex items-center gap-2 rounded-xl border border-border bg-background/50 px-3 py-1.5 text-xs">
                <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground" />
                <select
                  aria-label="Priority Filter"
                  data-testid="priority-filter-select"
                  value={selectedPriority}
                  onChange={(e) => setSelectedPriority(e.target.value as PriorityOption)}
                  className="bg-transparent font-medium text-foreground outline-none cursor-pointer"
                >
                  {PRIORITY_OPTIONS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date Range Filter */}
              <div className="flex items-center gap-2 rounded-xl border border-border bg-background/50 px-3 py-1.5 text-xs">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                <select
                  aria-label="Date Range Filter"
                  data-testid="date-range-filter-select"
                  value={selectedDateRange}
                  onChange={(e) => {
                    const newRange = e.target.value as DateRangeOption;
                    setSelectedDateRange(newRange);
                    if (newRange !== "Custom Range") {
                      setCustomStartDate("");
                      setCustomEndDate("");
                    }
                  }}
                  className="bg-transparent font-medium text-foreground outline-none cursor-pointer"
                >
                  {DATE_RANGES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              {/* Clear Filters Button */}
              {isFiltered && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                  data-testid="clear-filters-btn"
                >
                  <XCircle className="h-3.5 w-3.5 mr-1" />
                  Clear filters
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs font-normal">
                {filteredComplaints.length} records matching
              </Badge>
            </div>
          </div>

          {/* Custom Date Range Row */}
          {selectedDateRange === "Custom Range" && (
            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border/40 text-xs">
              <span className="font-semibold text-muted-foreground">Custom Date Range:</span>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">From</span>
                <input
                  type="date"
                  aria-label="Start Date"
                  data-testid="custom-start-date-input"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="rounded-lg border border-border bg-background/50 px-2.5 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">To</span>
                <input
                  type="date"
                  aria-label="End Date"
                  data-testid="custom-end-date-input"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="rounded-lg border border-border bg-background/50 px-2.5 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              {isInvalidDateRange && (
                <span className="text-xs font-medium text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5" />
                  End Date cannot be earlier than Start Date
                </span>
              )}
            </div>
          )}

          {/* Active Filter Criteria Summary */}
          {isFiltered && (
            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/40 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Active Filter:</span>
              {selectedDept !== "All Departments" && (
                <span className="rounded-md bg-primary/10 px-2 py-0.5 text-primary">
                  Dept: {selectedDept}
                </span>
              )}
              {selectedStatus !== "All Statuses" && (
                <span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-amber-600 dark:text-amber-400">
                  Status: {selectedStatus}
                </span>
              )}
              {selectedPriority !== "All Priorities" && (
                <span className="rounded-md bg-purple-500/10 px-2 py-0.5 text-purple-600 dark:text-purple-400">
                  Priority: {selectedPriority}
                </span>
              )}
              {selectedDateRange !== "All Time" && (
                <span className="rounded-md bg-blue-500/10 px-2 py-0.5 text-blue-600 dark:text-blue-400">
                  {selectedDateRange === "Custom Range"
                    ? `Date: ${customStartDate || "Start"} to ${customEndDate || "End"}`
                    : `Date: ${selectedDateRange}`}
                </span>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* ── Export Actions ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="glass-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <FileText className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground text-sm">Complaints Master Export</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  CSV export matching active filter criteria ({filteredComplaints.length} complaints with location, resolution &amp; feedback details)
                </p>
              </div>
            </div>
            <Button
              size="sm"
              onClick={exportComplaintsCsv}
              disabled={loading || isInvalidDateRange}
              className="rounded-xl"
              data-testid="export-complaints-csv-btn"
            >
              <Download className="h-4 w-4 mr-1.5" />
              Export CSV
            </Button>
          </div>
        </Card>

        <Card className="glass-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500">
                <FileBarChart className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground text-sm">Department Audit Package</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  JSON package matching active filter criteria ({filteredDepartmentMatrix.length} department benchmarks)
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={exportDepartmentJson}
              disabled={loading || isInvalidDateRange}
              className="rounded-xl"
              data-testid="export-department-json-btn"
            >
              <Download className="h-4 w-4 mr-1.5" />
              Export JSON
            </Button>
          </div>
        </Card>
      </div>

      {/* ── Empty Filter Notice ── */}
      {!loading && filteredComplaints.length === 0 && (
        <Card className="glass-card p-8 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
          <h3 className="text-sm font-semibold text-foreground">
            {isInvalidDateRange ? "Invalid Date Range Specified" : "No complaints match active criteria"}
          </h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            {isInvalidDateRange
              ? "Ensure the End Date is not earlier than the Start Date."
              : "Try adjusting or clearing your department, status, priority, or date range filters to view records."}
          </p>
          <Button variant="outline" size="sm" onClick={clearFilters} className="mt-4 rounded-xl">
            Clear all filters
          </Button>
        </Card>
      )}

      {/* ── SLA Compliance Matrix ── */}
      <Card className="glass-card overflow-hidden">
        <div className="border-b border-border/60 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            <div>
              <h3 className="font-heading font-semibold text-sm text-foreground">
                Departmental SLA Compliance &amp; Resolution Matrix
              </h3>
              <p className="text-xs text-muted-foreground">
                {isFiltered ? "Filtered dataset metrics" : "Authoritative backend database metrics"}
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={exportDepartmentSummaryCsv}
            disabled={loading || isInvalidDateRange}
            className="rounded-xl border-border bg-card shadow-sm hover:bg-muted text-xs shrink-0"
            data-testid="export-dept-summary-csv-btn"
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Export Summary CSV
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/30 text-xs text-muted-foreground">
              <tr>
                <th className="p-3 font-semibold">Department</th>
                <th className="p-3 font-semibold text-center">Total Cases</th>
                <th className="p-3 font-semibold text-center">Resolved</th>
                <th className="p-3 font-semibold text-center">Overdue</th>
                <th className="p-3 font-semibold text-center">Resolution Rate</th>
                <th className="p-3 font-semibold text-center">Avg Resolution (hrs)</th>
                <th className="p-3 font-semibold text-center">Citizen Rating</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filteredDepartmentMatrix.map((dept) => (
                <tr key={dept.department} className="hover:bg-muted/20 transition-colors">
                  <td className="p-3 font-medium text-foreground">
                    {dept.department}
                  </td>
                  <td className="p-3 text-center">{dept.total}</td>
                  <td className="p-3 text-center text-success font-semibold">{dept.resolved}</td>
                  <td className={`p-3 text-center font-semibold ${dept.overdue > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                    {dept.overdue}
                  </td>
                  <td className="p-3 text-center font-bold text-foreground">
                    {dept.resolutionRate}%
                  </td>
                  <td className="p-3 text-center">{dept.avgResolutionHours}h</td>
                  <td className="p-3 text-center">
                    {dept.citizenRating}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default AdminReports;
