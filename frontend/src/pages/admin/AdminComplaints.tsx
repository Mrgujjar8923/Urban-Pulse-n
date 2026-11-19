import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ClipboardList,
  Clock,
  ExternalLink,
  Eye,
  FileText,
  Filter,
  Layers,
  MapPin,
  MessageSquare,
  RefreshCw,
  Search,
  Shield,
  Star,
  Timer,
  User,
  X,
  Zap,
} from "lucide-react";
import { complaintsApi, type ComplaintRecord } from "@/services/complaintsApi";
import { DEPARTMENTS } from "@/config/departments";
import { ApiErrorPanel } from "@/components/shared/ApiErrorPanel";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

const STATUS_FILTERS = ["All", "Pending", "Assigned", "In Progress", "Resolved"] as const;
const PRIORITY_FILTERS = ["All", "Critical", "High", "Medium", "Low", "Unknown"] as const;
const PAGE_SIZE_OPTIONS = [5, 10, 20, 50];

type SortField = "createdAt" | "reference" | "priority" | "deadline";
type SortOrder = "asc" | "desc";

const PRIORITY_COLORS: Record<string, string> = {
  Critical: "border-rose-500/30 bg-rose-500/10 text-rose-500",
  High: "border-orange-500/30 bg-orange-500/10 text-orange-500",
  Medium: "border-blue-500/30 bg-blue-500/10 text-blue-500",
  Low: "border-emerald-500/30 bg-emerald-500/10 text-emerald-500",
  Unknown: "border-muted-foreground/30 bg-muted/20 text-muted-foreground",
};

const PRIORITY_WEIGHTS: Record<string, number> = {
  Critical: 4,
  High: 3,
  Medium: 2,
  Low: 1,
  Unknown: 0,
};

const formatRemainingTime = (remainingMs: number | null, isOverdue: boolean) => {
  if (remainingMs === null || remainingMs === undefined) return null;
  if (isOverdue || remainingMs <= 0) return "Overdue";

  const totalMinutes = Math.floor(remainingMs / (1000 * 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d remaining`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m left`;
  }
  return `${minutes}m left`;
};

const AdminComplaints: React.FC = () => {
  const [complaints, setComplaints] = useState<ComplaintRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<unknown>(null);

  // Filters & Search
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [selectedDept, setSelectedDept] = useState<string>("All Departments");
  const [priorityFilter, setPriorityFilter] = useState<string>("All");

  // Sorting state
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  // Pagination state
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Inspection modal state
  const [selectedComplaint, setSelectedComplaint] = useState<ComplaintRecord | null>(null);

  const loadData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const data = await complaintsApi.listAll();
      setComplaints(data);
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

  // Reset pagination when search, filter or page size changes
  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, selectedDept, priorityFilter, pageSize]);

  const handleClearFilters = () => {
    setSearch("");
    setStatusFilter("All");
    setSelectedDept("All Departments");
    setPriorityFilter("All");
    setCurrentPage(1);
  };

  const hasActiveFilters =
    search.trim() !== "" ||
    statusFilter !== "All" ||
    selectedDept !== "All Departments" ||
    priorityFilter !== "All";

  // Filtered complaints
  const filtered = useMemo(() => {
    return complaints.filter((c) => {
      const p = c.priority || c.aiAnalysis?.priority || "Unknown";

      const matchesSearch =
        !search ||
        c.title.toLowerCase().includes(search.toLowerCase()) ||
        c.reference.toLowerCase().includes(search.toLowerCase()) ||
        c.category.toLowerCase().includes(search.toLowerCase()) ||
        (c.createdBy?.name || "").toLowerCase().includes(search.toLowerCase()) ||
        (c.location || "").toLowerCase().includes(search.toLowerCase());

      const matchesStatus = statusFilter === "All" || c.status === statusFilter;
      const matchesDept = selectedDept === "All Departments" || c.category === selectedDept;
      const matchesPriority = priorityFilter === "All" || p === priorityFilter;

      return matchesSearch && matchesStatus && matchesDept && matchesPriority;
    });
  }, [complaints, search, statusFilter, selectedDept, priorityFilter]);

  // Sorted complaints
  const sorted = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      let comparison = 0;
      if (sortField === "createdAt") {
        const timeA = new Date(a.createdAt).getTime() || 0;
        const timeB = new Date(b.createdAt).getTime() || 0;
        comparison = timeA - timeB;
      } else if (sortField === "reference") {
        comparison = (a.reference || "").localeCompare(b.reference || "");
      } else if (sortField === "priority") {
        const prioA = PRIORITY_WEIGHTS[a.priority || a.aiAnalysis?.priority || "Unknown"] || 0;
        const prioB = PRIORITY_WEIGHTS[b.priority || b.aiAnalysis?.priority || "Unknown"] || 0;
        comparison = prioA - prioB;
      } else if (sortField === "deadline") {
        const deadA = a.sla?.deadline ? new Date(a.sla.deadline).getTime() : Infinity;
        const deadB = b.sla?.deadline ? new Date(b.sla.deadline).getTime() : Infinity;
        comparison = deadA - deadB;
      }
      return sortOrder === "asc" ? comparison : -comparison;
    });
    return list;
  }, [filtered, sortField, sortOrder]);

  // Pagination calculation
  const totalRecords = sorted.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedComplaints = sorted.slice(startIndex, startIndex + pageSize);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const getAriaSort = (field: SortField): "ascending" | "descending" | "none" => {
    if (sortField !== field) return "none";
    return sortOrder === "asc" ? "ascending" : "descending";
  };

  const counts = useMemo(
    () => ({
      total: complaints.length,
      pending: complaints.filter((c) => c.status === "Pending").length,
      inProgress: complaints.filter((c) => c.status === "In Progress" || c.status === "Assigned").length,
      resolved: complaints.filter((c) => c.status === "Resolved").length,
    }),
    [complaints]
  );

  return (
    <div className="space-y-6">
      {/* ── 1. Header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">
            Complaint Management
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {loading
              ? "Loading complaints registry..."
              : `System-wide complaint monitoring · ${totalRecords} matching (${complaints.length} total recorded)`}
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => loadData(true)}
          disabled={loading || refreshing}
          className="rounded-xl border-border bg-card shadow-sm hover:bg-muted"
          aria-label="Refresh complaint list"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error && <ApiErrorPanel error={error} onRetry={() => loadData()} />}

      {/* ── 2. Status Counts ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total Complaints", value: counts.total, icon: FileText, color: "text-foreground" },
          { label: "Pending Review", value: counts.pending, icon: AlertTriangle, color: "text-warning" },
          { label: "Active Remediation", value: counts.inProgress, icon: Building2, color: "text-primary" },
          { label: "Resolved", value: counts.resolved, icon: CheckCircle2, color: "text-success" },
        ].map((item) => (
          <Card key={item.label} className="glass-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className={`text-2xl font-heading font-bold ${item.color}`}>
                  {loading ? "..." : item.value}
                </p>
              </div>
              <item.icon className={`h-5 w-5 ${item.color} opacity-70`} />
            </div>
          </Card>
        ))}
      </div>

      {/* ── 3. Filter & Search Bar ── */}
      <Card className="glass-card p-4 space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* Search Input */}
          <div className="relative flex items-center">
            <Search className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search reference, title, location, or citizen..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search complaints"
              className="pl-9 pr-8 bg-background/50 rounded-xl text-xs"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 text-muted-foreground hover:text-foreground"
                aria-label="Clear search text"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Department Filter */}
          <div className="flex items-center gap-1.5 rounded-xl border border-border bg-background/50 px-3 py-1.5 text-xs shadow-sm">
            <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              aria-label="Filter by Department"
              className="w-full bg-transparent font-medium text-foreground outline-none cursor-pointer text-xs"
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
          <div className="flex items-center gap-1.5 rounded-xl border border-border bg-background/50 px-3 py-1.5 text-xs shadow-sm">
            <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by Status"
              className="w-full bg-transparent font-medium text-foreground outline-none cursor-pointer text-xs"
            >
              {STATUS_FILTERS.map((s) => (
                <option key={s} value={s}>
                  {s === "All" ? "All Statuses" : s}
                </option>
              ))}
            </select>
          </div>

          {/* Priority Filter */}
          <div className="flex items-center gap-1.5 rounded-xl border border-border bg-background/50 px-3 py-1.5 text-xs shadow-sm">
            <Zap className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              aria-label="Filter by Priority"
              className="w-full bg-transparent font-medium text-foreground outline-none cursor-pointer text-xs"
            >
              {PRIORITY_FILTERS.map((p) => (
                <option key={p} value={p}>
                  {p === "All" ? "All Priorities" : `${p} Priority`}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Active filter badges */}
        {hasActiveFilters && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/50 text-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-muted-foreground font-medium">Active:</span>
              {search.trim() && (
                <Badge variant="secondary" className="gap-1 bg-primary/10 text-primary border-primary/20">
                  Search: "{search.trim()}"
                </Badge>
              )}
              {selectedDept !== "All Departments" && (
                <Badge variant="secondary" className="gap-1 bg-blue-500/10 text-blue-500 border-blue-500/20">
                  Dept: {selectedDept}
                </Badge>
              )}
              {statusFilter !== "All" && (
                <Badge variant="secondary" className="gap-1 bg-warning/10 text-warning border-warning/20">
                  Status: {statusFilter}
                </Badge>
              )}
              {priorityFilter !== "All" && (
                <Badge variant="secondary" className="gap-1 bg-rose-500/10 text-rose-500 border-rose-500/20">
                  Priority: {priorityFilter}
                </Badge>
              )}
            </div>
            <button
              onClick={handleClearFilters}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground font-medium transition"
              aria-label="Clear all active filters"
            >
              <X className="h-3 w-3" /> Clear filters
            </button>
          </div>
        )}
      </Card>

      {/* ── 4. Complaints Table ── */}
      <Card className="glass-card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-primary opacity-80" />
            Loading complaints registry...
          </div>
        ) : sorted.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            <ClipboardList className="h-8 w-8 mx-auto mb-2 text-muted-foreground/60" />
            <p className="font-semibold text-foreground">No complaints match active criteria</p>
            <p className="text-xs text-muted-foreground mt-1">
              Try adjusting your search terms or clearing applied filters.
            </p>
            {hasActiveFilters && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleClearFilters}
                className="mt-3 text-xs"
              >
                Reset Filters
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/30 text-xs text-muted-foreground">
                <tr>
                  <th
                    scope="col"
                    aria-sort={getAriaSort("reference")}
                    className="p-3 font-semibold"
                  >
                    <button
                      type="button"
                      onClick={() => handleSort("reference")}
                      className="flex items-center gap-1 font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded px-1 -mx-1 transition select-none"
                    >
                      <span>Reference</span>
                      {sortField === "reference" && (
                        sortOrder === "asc" ? (
                          <ChevronUp className="h-3 w-3" aria-hidden="true" />
                        ) : (
                          <ChevronDown className="h-3 w-3" aria-hidden="true" />
                        )
                      )}
                    </button>
                  </th>
                  <th scope="col" className="p-3 font-semibold">Title</th>
                  <th scope="col" className="p-3 font-semibold">Department</th>
                  <th
                    scope="col"
                    aria-sort={getAriaSort("priority")}
                    className="p-3 font-semibold"
                  >
                    <button
                      type="button"
                      onClick={() => handleSort("priority")}
                      className="flex items-center gap-1 font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded px-1 -mx-1 transition select-none"
                    >
                      <span>Priority</span>
                      {sortField === "priority" && (
                        sortOrder === "asc" ? (
                          <ChevronUp className="h-3 w-3" aria-hidden="true" />
                        ) : (
                          <ChevronDown className="h-3 w-3" aria-hidden="true" />
                        )
                      )}
                    </button>
                  </th>
                  <th scope="col" className="p-3 font-semibold">Status</th>
                  <th scope="col" className="p-3 font-semibold">Citizen</th>
                  <th scope="col" className="p-3 font-semibold">Assigned Officer</th>
                  <th
                    scope="col"
                    aria-sort={getAriaSort("deadline")}
                    className="p-3 font-semibold"
                  >
                    <button
                      type="button"
                      onClick={() => handleSort("deadline")}
                      className="flex items-center gap-1 font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded px-1 -mx-1 transition select-none"
                    >
                      <span>SLA & Deadline</span>
                      {sortField === "deadline" && (
                        sortOrder === "asc" ? (
                          <ChevronUp className="h-3 w-3" aria-hidden="true" />
                        ) : (
                          <ChevronDown className="h-3 w-3" aria-hidden="true" />
                        )
                      )}
                    </button>
                  </th>
                  <th
                    scope="col"
                    aria-sort={getAriaSort("createdAt")}
                    className="p-3 font-semibold text-right"
                  >
                    <button
                      type="button"
                      onClick={() => handleSort("createdAt")}
                      className="inline-flex items-center justify-end gap-1 font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded px-1 -mx-1 transition select-none ml-auto"
                    >
                      <span>Submitted</span>
                      {sortField === "createdAt" && (
                        sortOrder === "asc" ? (
                          <ChevronUp className="h-3 w-3" aria-hidden="true" />
                        ) : (
                          <ChevronDown className="h-3 w-3" aria-hidden="true" />
                        )
                      )}
                    </button>
                  </th>
                  <th scope="col" className="p-3 font-semibold text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {paginatedComplaints.map((complaint) => {
                  const prio = complaint.priority || complaint.aiAnalysis?.priority || "Unknown";
                  const remainingText = formatRemainingTime(complaint.sla?.remainingMs, complaint.sla?.isOverdue);

                  return (
                    <tr
                      key={complaint.id}
                      tabIndex={0}
                      role="button"
                      aria-label={`Inspect complaint ${complaint.reference}`}
                      onClick={() => setSelectedComplaint(complaint)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedComplaint(complaint);
                        }
                      }}
                      className="hover:bg-muted/30 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
                      title="Click row to inspect complete complaint dossier"
                    >
                      <td className="p-3 font-mono text-xs font-semibold text-primary">
                        {complaint.reference}
                      </td>
                      <td className="p-3 font-medium text-foreground max-w-[220px] truncate">
                        {complaint.title}
                      </td>
                      <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                        {complaint.category}
                      </td>
                      <td className="p-3">
                        <Badge variant="outline" className={`text-xs ${PRIORITY_COLORS[prio] || PRIORITY_COLORS.Unknown}`}>
                          {prio}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <Badge
                          variant="outline"
                          className={
                            complaint.status === "Resolved"
                              ? "border-success/30 bg-success/10 text-success text-xs"
                              : complaint.status === "In Progress"
                              ? "border-primary/30 bg-primary/10 text-primary text-xs"
                              : complaint.status === "Assigned"
                              ? "border-blue-500/30 bg-blue-500/10 text-blue-500 text-xs"
                              : "border-warning/30 bg-warning/10 text-warning text-xs"
                          }
                        >
                          {complaint.status}
                        </Badge>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {complaint.createdBy?.name || "Citizen"}
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {complaint.assignedTo?.name || "—"}
                      </td>
                      <td className="p-3">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                                complaint.sla?.slaStatus === "Overdue"
                                    ? "bg-destructive/10 text-destructive font-semibold"
                                  : complaint.sla?.slaStatus === "Due Soon"
                                  ? "bg-warning/10 text-warning"
                                  : complaint.sla?.slaStatus === "Resolved"
                                  ? "bg-success/10 text-success"
                                  : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {complaint.sla?.slaStatus || "On Track"}
                            </span>
                            {remainingText && (
                              <span className="text-[10px] text-muted-foreground">
                                {remainingText}
                              </span>
                            )}
                          </div>
                          {complaint.sla?.deadline && (
                            <span className="text-[10px] text-muted-foreground font-mono">
                              {new Date(complaint.sla.deadline).toLocaleString(undefined, {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-right text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(complaint.createdAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </td>
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedComplaint(complaint);
                          }}
                          aria-label={`Inspect complaint ${complaint.reference}`}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80 transition p-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                          title="View complaint dossier"
                        >
                          <Eye className="h-3.5 w-3.5" /> Inspect
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── 5. Pagination Bar ── */}
        {!loading && sorted.length > 0 && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 border-t border-border text-xs">
            <div className="flex items-center gap-3 text-muted-foreground">
              <span>
                Showing <strong className="text-foreground">{startIndex + 1}</strong> to{" "}
                <strong className="text-foreground">{Math.min(startIndex + pageSize, totalRecords)}</strong> of{" "}
                <strong className="text-foreground">{totalRecords}</strong> records
              </span>
              <div className="flex items-center gap-1.5 ml-2">
                <span>Rows:</span>
                <select
                  aria-label="Rows per page"
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="rounded border border-border bg-card px-2 py-1 text-xs text-foreground outline-none font-medium cursor-pointer"
                >
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-muted-foreground mr-1">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                aria-label="Previous Page"
                className="h-8 px-2 text-xs"
              >
                <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                aria-label="Next Page"
                className="h-8 px-2 text-xs"
              >
                Next <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* ── 6. Admin Complaint Inspection Modal ── */}
      <Dialog open={!!selectedComplaint} onOpenChange={(open) => !open && setSelectedComplaint(null)}>
        {selectedComplaint && (
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <DialogHeader className="flex flex-col gap-1 pb-4 border-b border-border text-left">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs font-bold text-primary px-2 py-0.5 rounded bg-primary/10">
                  {selectedComplaint.reference}
                </span>
                <Badge variant="outline" className="text-xs">
                  {selectedComplaint.category}
                </Badge>
                <Badge
                  variant="outline"
                  className={`text-xs ${
                    PRIORITY_COLORS[selectedComplaint.priority || selectedComplaint.aiAnalysis?.priority || "Unknown"]
                  }`}
                >
                  {selectedComplaint.priority || selectedComplaint.aiAnalysis?.priority || "Unknown"} Priority
                </Badge>
                <Badge
                  variant="outline"
                  className={
                    selectedComplaint.status === "Resolved"
                      ? "border-success/30 bg-success/10 text-success text-xs"
                      : "border-warning/30 bg-warning/10 text-warning text-xs"
                  }
                >
                  {selectedComplaint.status}
                </Badge>
              </div>
              <DialogTitle className="text-lg font-heading font-bold text-foreground mt-2">
                {selectedComplaint.title}
              </DialogTitle>
              <DialogDescription className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  Submitted: {new Date(selectedComplaint.createdAt).toLocaleString()}
                </span>
                {selectedComplaint.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 text-rose-500" />
                    {selectedComplaint.location}
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>

              {/* Modal Content Sections */}
              <div className="mt-4 space-y-4 text-xs">
                {/* Description */}
                <div className="rounded-lg border border-border bg-muted/20 p-3">
                  <span className="font-semibold text-foreground block mb-1">Description</span>
                  <p className="text-muted-foreground whitespace-pre-wrap leading-relaxed">
                    {selectedComplaint.description}
                  </p>
                </div>

                {/* Stakeholder Details Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Citizen Info */}
                  <div className="rounded-lg border border-border bg-card p-3 space-y-1">
                    <span className="font-semibold text-foreground flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5 text-primary" /> Citizen Information
                    </span>
                    <p className="font-medium text-foreground">
                      {selectedComplaint.createdBy?.name || "Anonymous Citizen"}
                    </p>
                    <p className="text-muted-foreground">
                      {selectedComplaint.createdBy?.email || "No email provided"}
                    </p>
                  </div>

                  {/* Assigned Officer */}
                  <div className="rounded-lg border border-border bg-card p-3 space-y-1">
                    <span className="font-semibold text-foreground flex items-center gap-1.5">
                      <Shield className="h-3.5 w-3.5 text-emerald-500" /> Assigned Department Officer
                    </span>
                    <p className="font-medium text-foreground">
                      {selectedComplaint.assignedTo?.name || "Unassigned"}
                    </p>
                    <p className="text-muted-foreground">
                      Department: {selectedComplaint.assignedTo?.department || selectedComplaint.category}
                    </p>
                  </div>
                </div>

                {/* SLA Compliance Section */}
                <div className="rounded-lg border border-border bg-card p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground flex items-center gap-1.5">
                      <Timer className="h-3.5 w-3.5 text-amber-500" /> SLA & Resolution Timeline
                    </span>
                    <Badge
                      variant="outline"
                      className={
                        selectedComplaint.sla?.slaStatus === "Overdue"
                          ? "bg-destructive/10 text-destructive border-destructive/20"
                          : selectedComplaint.sla?.slaStatus === "Resolved"
                          ? "bg-success/10 text-success border-success/20"
                          : "bg-muted text-muted-foreground"
                      }
                    >
                      {selectedComplaint.sla?.slaStatus || "On Track"}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] pt-1">
                    <div className="bg-muted/30 p-2 rounded">
                      <span className="text-muted-foreground block">Started At</span>
                      <span className="font-mono text-foreground">
                        {selectedComplaint.sla?.startedAt
                          ? new Date(selectedComplaint.sla.startedAt).toLocaleString()
                          : new Date(selectedComplaint.createdAt).toLocaleString()}
                      </span>
                    </div>

                    <div className="bg-muted/30 p-2 rounded">
                      <span className="text-muted-foreground block">Target Deadline</span>
                      <span className="font-mono text-foreground font-semibold">
                        {selectedComplaint.sla?.deadline
                          ? new Date(selectedComplaint.sla.deadline).toLocaleString()
                          : "Not scheduled"}
                      </span>
                    </div>

                    <div className="bg-muted/30 p-2 rounded col-span-2 sm:col-span-1">
                      <span className="text-muted-foreground block">Resolved Timestamp</span>
                      <span className="font-mono text-foreground">
                        {selectedComplaint.sla?.resolvedAt
                          ? new Date(selectedComplaint.sla.resolvedAt).toLocaleString()
                          : selectedComplaint.status === "Resolved"
                          ? new Date(selectedComplaint.updatedAt || selectedComplaint.createdAt).toLocaleString()
                          : "Pending Resolution"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* AI Analysis Dossier */}
                <div className="rounded-lg border border-border bg-card p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground flex items-center gap-1.5">
                      <Zap className="h-3.5 w-3.5 text-primary" /> AI Classification & Urgency Assessment
                    </span>
                    {selectedComplaint.aiAnalysis?.urgencyScore !== undefined && (
                      <Badge variant="outline" className="text-xs bg-primary/10 text-primary">
                        Score: {selectedComplaint.aiAnalysis.urgencyScore} / 10
                      </Badge>
                    )}
                  </div>

                  {selectedComplaint.aiAnalysis ? (
                    <div className="space-y-2 text-[11px] text-muted-foreground pt-1">
                      {selectedComplaint.aiAnalysis.detectedLanguage && (
                        <div>
                          <strong className="text-foreground">Detected Language: </strong>
                          <span>{selectedComplaint.aiAnalysis.detectedLanguage}</span>
                        </div>
                      )}
                      {selectedComplaint.aiAnalysis.englishTranslation && (
                        <div>
                          <strong className="text-foreground block">English Translation:</strong>
                          <p className="whitespace-pre-wrap">{selectedComplaint.aiAnalysis.englishTranslation}</p>
                        </div>
                      )}
                      {selectedComplaint.aiAnalysis.reasoning && (
                        <div>
                          <strong className="text-foreground block">Reasoning:</strong>
                          <p>{selectedComplaint.aiAnalysis.reasoning}</p>
                        </div>
                      )}
                      {selectedComplaint.aiAnalysis.detectedIssue && (
                        <div>
                          <strong className="text-foreground">Detected Issue: </strong>
                          <span>{selectedComplaint.aiAnalysis.detectedIssue}</span>
                        </div>
                      )}
                      {selectedComplaint.aiAnalysis.recommendedAction && (
                        <div>
                          <strong className="text-foreground">Recommended Action: </strong>
                          <span>{selectedComplaint.aiAnalysis.recommendedAction}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-muted-foreground italic text-[11px]">
                      No automated AI assessment metadata recorded for this complaint.
                    </p>
                  )}
                </div>

                {/* Citizen Feedback (if resolved and feedback submitted) */}
                {selectedComplaint.feedback && (
                  <div className="rounded-lg border border-border bg-card p-3 space-y-1.5">
                    <span className="font-semibold text-foreground flex items-center gap-1.5">
                      <MessageSquare className="h-3.5 w-3.5 text-emerald-500" /> Citizen Resolution Feedback
                    </span>
                    <div className="flex items-center gap-1 text-amber-500 pt-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={`h-3.5 w-3.5 ${
                            i < (selectedComplaint.feedback?.rating || 0)
                              ? "fill-amber-500 text-amber-500"
                              : "text-muted-foreground/30"
                          }`}
                        />
                      ))}
                      <span className="text-xs font-semibold ml-1 text-foreground">
                        {selectedComplaint.feedback.rating} / 5
                      </span>
                    </div>
                    {selectedComplaint.feedback.comment && (
                      <p className="text-muted-foreground text-xs italic mt-1">
                        "{selectedComplaint.feedback.comment}"
                      </p>
                    )}
                  </div>
                )}

                {/* Complaint History & Lifecycle Timeline */}
                <div className="rounded-lg border border-border bg-card p-3 space-y-2">
                  <span className="font-semibold text-foreground flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-blue-500" /> Complete Status & Event Timeline
                  </span>

                  {selectedComplaint.timeline && selectedComplaint.timeline.length > 0 ? (
                    <div className="space-y-2 pt-1 border-l-2 border-primary/30 ml-2 pl-3">
                      {selectedComplaint.timeline.map((evt, idx) => (
                        <div key={idx} className="relative space-y-0.5">
                          <div className="absolute -left-[19px] top-1 h-2 w-2 rounded-full bg-primary" />
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-semibold text-foreground">
                              {evt.label || evt.eventType || "Event logged"}
                            </span>
                            <span className="text-muted-foreground font-mono">
                              {evt.timestamp
                                ? new Date(evt.timestamp).toLocaleString(undefined, {
                                    dateStyle: "short",
                                    timeStyle: "short",
                                  })
                                : ""}
                            </span>
                          </div>
                          {evt.note && (
                            <p className="text-[11px] text-muted-foreground">{evt.note}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground italic text-[11px]">
                      No event log entries found.
                    </p>
                  )}
                </div>
              </div>

              {/* Modal Footer */}
              <DialogFooter className="mt-5 pt-3 border-t border-border">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setSelectedComplaint(null)}
                  className="text-xs"
                >
                  Close Dossier
                </Button>
              </DialogFooter>
            </DialogContent>
          )}
        </Dialog>
    </div>
  );
};

export default AdminComplaints;
