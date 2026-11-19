import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users,
  Search,
  X,
  Filter,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Link2,
  Unlink2,
  Calendar,
  Mail,
  Shield,
  Building,
  FileText,
  CheckCircle,
  Clock,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { adminApi, type AdminUserRecord } from "@/services/adminApi";
import { ApiErrorPanel } from "@/components/shared/ApiErrorPanel";

const ROLE_COLORS: Record<AdminUserRecord["role"], string> = {
  citizen: "bg-info/10 text-info border-info/20",
  department: "bg-warning/10 text-warning border-warning/20",
  admin: "bg-primary/10 text-primary border-primary/20",
};

const ROLE_LABELS: Record<AdminUserRecord["role"], string> = {
  citizen: "Citizen",
  department: "Department",
  admin: "Admin",
};

const STATUS_LABELS: Record<AdminUserRecord["status"], string> = {
  active: "Active",
  pending: "Pending",
  rejected: "Rejected",
};

const STATUS_COLORS: Record<AdminUserRecord["status"], string> = {
  active: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
  pending: "text-amber-500 bg-amber-500/10 border-amber-500/20",
  rejected: "text-rose-500 bg-rose-500/10 border-rose-500/20",
};

const DEPARTMENTS = [
  "Road & Infrastructure",
  "Water Supply",
  "Electricity",
  "Environment",
];

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50];

const UserManagement: React.FC = () => {
  const [users, setUsers] = React.useState<AdminUserRecord[]>([]);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [loadError, setLoadError] = React.useState<unknown>(null);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = React.useState<string>("");
  const [roleFilter, setRoleFilter] = React.useState<string>("all");
  const [departmentFilter, setDepartmentFilter] = React.useState<string>("all");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");

  // Pagination state
  const [currentPage, setCurrentPage] = React.useState<number>(1);
  const [pageSize, setPageSize] = React.useState<number>(10);

  // User detail dialog state
  const [selectedUser, setSelectedUser] = React.useState<AdminUserRecord | null>(null);

  const loadUsers = React.useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const data = await adminApi.listUsers();
      setUsers(data);
    } catch (error) {
      setLoadError(error);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // Reset pagination when search or filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, roleFilter, departmentFilter, statusFilter, pageSize]);

  // Combined Filtering and Search logic
  const filteredUsers = React.useMemo(() => {
    return users.filter((user) => {
      // 1. Search by name or email (case-insensitive)
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesName = user.name?.toLowerCase().includes(query);
        const matchesEmail = user.email?.toLowerCase().includes(query);
        if (!matchesName && !matchesEmail) {
          return false;
        }
      }

      // 2. Role filter
      if (roleFilter !== "all" && user.role !== roleFilter) {
        return false;
      }

      // 3. Department filter
      if (departmentFilter !== "all" && user.department !== departmentFilter) {
        return false;
      }

      // 4. Status filter
      if (statusFilter !== "all" && user.status !== statusFilter) {
        return false;
      }

      return true;
    });
  }, [users, searchQuery, roleFilter, departmentFilter, statusFilter]);

  // Pagination calculations
  const totalRecords = filteredUsers.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedUsers = filteredUsers.slice(startIndex, startIndex + pageSize);

  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    roleFilter !== "all" ||
    departmentFilter !== "all" ||
    statusFilter !== "all";

  const handleClearFilters = () => {
    setSearchQuery("");
    setRoleFilter("all");
    setDepartmentFilter("all");
    setStatusFilter("all");
    setCurrentPage(1);
  };

  return (
    <div className="space-y-6">
      {/* 1. Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">User Management</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {loading ? "Loading registered accounts..." : `${totalRecords} users found (${users.length} total registered)`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => loadUsers()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition disabled:opacity-50"
            title="Refresh user list"
            aria-label="Refresh user list"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-primary" : ""}`} />
            Refresh
          </button>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5 text-primary" />
            <span>Live directory</span>
          </div>
        </div>
      </div>

      {/* 2. Error State */}
      {loadError && (
        <div className="space-y-4">
          <ApiErrorPanel error={loadError} />
          <div className="flex justify-end">
            <button
              onClick={() => loadUsers()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Retry Fetching Users
            </button>
          </div>
        </div>
      )}

      {/* 3. Search & Filters Bar */}
      {!loadError && (
        <Card className="glass-card p-4 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* Search Input */}
            <div className="relative flex items-center">
              <Search className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search name or email..."
                aria-label="Search users"
                className="w-full rounded-lg border border-border bg-card pl-9 pr-8 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                  title="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Role Filter */}
            <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs shadow-sm">
              <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                aria-label="Filter by Role"
                className="w-full cursor-pointer bg-transparent text-xs text-foreground outline-none font-medium"
              >
                <option value="all">All Roles</option>
                <option value="citizen">Citizen</option>
                <option value="department">Department</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            {/* Department Filter */}
            <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs shadow-sm">
              <Building className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                aria-label="Filter by Department"
                className="w-full cursor-pointer bg-transparent text-xs text-foreground outline-none font-medium"
              >
                <option value="all">All Departments</option>
                {DEPARTMENTS.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs shadow-sm">
              <Shield className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                aria-label="Filter by Status"
                className="w-full cursor-pointer bg-transparent text-xs text-foreground outline-none font-medium"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="pending">Pending</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
          </div>

          {/* Active filter badges & Clear button */}
          {hasActiveFilters && (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border/50 text-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-muted-foreground font-medium">Active:</span>
                {searchQuery.trim() && (
                  <Badge variant="secondary" className="gap-1 bg-primary/10 text-primary border-primary/20">
                    Search: "{searchQuery.trim()}"
                  </Badge>
                )}
                {roleFilter !== "all" && (
                  <Badge variant="secondary" className="gap-1 bg-info/10 text-info border-info/20">
                    Role: {roleFilter}
                  </Badge>
                )}
                {departmentFilter !== "all" && (
                  <Badge variant="secondary" className="gap-1 bg-amber-500/10 text-amber-500 border-amber-500/20">
                    Dept: {departmentFilter}
                  </Badge>
                )}
                {statusFilter !== "all" && (
                  <Badge variant="secondary" className="gap-1 bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                    Status: {statusFilter}
                  </Badge>
                )}
              </div>
              <button
                onClick={handleClearFilters}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground font-medium transition"
              >
                <X className="h-3 w-3" /> Clear filters
              </button>
            </div>
          )}
        </Card>
      )}

      {/* 4. Users Table */}
      {!loadError && (
        <Card className="glass-card">
          <div className="p-0">
            {loading ? (
              <div className="flex flex-col items-center justify-center p-12 text-center text-sm text-muted-foreground">
                <RefreshCw className="h-7 w-7 animate-spin text-primary opacity-80" />
                <p className="mt-3">Loading directory accounts...</p>
              </div>
            ) : totalRecords === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-center">
                <Users className="h-10 w-10 text-muted-foreground/60" />
                <h3 className="mt-3 text-base font-semibold text-foreground">No users match your criteria</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Try adjusting your search query or relaxing your filter selections.
                </p>
                {hasActiveFilters && (
                  <button
                    onClick={handleClearFilters}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition"
                  >
                    Reset All Filters
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/20">
                        <th className="p-4 text-left font-medium text-muted-foreground">User</th>
                        <th className="p-4 text-left font-medium text-muted-foreground">Role</th>
                        <th className="hidden p-4 text-left font-medium text-muted-foreground md:table-cell">Status</th>
                        <th className="hidden p-4 text-left font-medium text-muted-foreground lg:table-cell">Department</th>
                        <th className="p-4 text-left font-medium text-muted-foreground">Officer Link</th>
                        <th className="p-4 text-right font-medium text-muted-foreground">Complaints</th>
                        <th className="p-4 text-center font-medium text-muted-foreground">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {paginatedUsers.map((user, index) => {
                        const isOfficer = user.role === "department" && user.departmentRole === "officer";
                        return (
                          <motion.tr
                            key={user.id}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: index * 0.02 }}
                            tabIndex={0}
                            role="button"
                            aria-label={`View details for ${user.name}`}
                            onClick={() => setSelectedUser(user)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setSelectedUser(user);
                              }
                            }}
                            className="cursor-pointer transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
                            title="Click to view user details"
                          >
                            <td className="p-4">
                              <div className="flex items-center gap-3">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full gradient-primary text-xs font-bold text-primary-foreground">
                                  {user.name.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <p className="font-medium text-foreground hover:text-primary transition">
                                    {user.name}
                                  </p>
                                  <p className="text-xs text-muted-foreground">{user.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="p-4">
                              <div className="flex flex-col gap-1 items-start">
                                <Badge variant="outline" className={`text-xs ${ROLE_COLORS[user.role]}`}>
                                  {ROLE_LABELS[user.role]}
                                </Badge>
                                {user.departmentRole && (
                                  <span className="text-[10px] font-mono capitalize text-muted-foreground">
                                    {user.departmentRole}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="hidden p-4 md:table-cell">
                              <Badge variant="outline" className={`text-xs ${STATUS_COLORS[user.status]}`}>
                                {STATUS_LABELS[user.status]}
                              </Badge>
                            </td>
                            <td className="hidden p-4 text-muted-foreground lg:table-cell text-xs">
                              {user.department || "—"}
                            </td>
                            <td className="p-4 text-xs">
                              {isOfficer ? (
                                user.memberLinked ? (
                                  <Badge
                                    variant="outline"
                                    className="gap-1 bg-emerald-500/10 text-emerald-500 border-emerald-500/20 font-medium"
                                  >
                                    <Link2 className="h-3 w-3" /> Linked
                                    {user.memberName && (
                                      <span className="text-[10px] text-muted-foreground ml-0.5">
                                        ({user.memberName})
                                      </span>
                                    )}
                                  </Badge>
                                ) : (
                                  <Badge
                                    variant="outline"
                                    className="gap-1 bg-amber-500/10 text-amber-500 border-amber-500/20 font-medium"
                                  >
                                    <Unlink2 className="h-3 w-3" /> Not Linked
                                  </Badge>
                                )
                              ) : (
                                <span className="text-muted-foreground/60">—</span>
                              )}
                            </td>
                            <td className="p-4 text-right font-medium text-foreground">
                              {user.complaintsCount}
                            </td>
                            <td className="p-4 text-center">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedUser(user);
                                }}
                                aria-label={`View details for ${user.name}`}
                                className="h-8 px-2 text-xs text-primary hover:text-primary hover:bg-primary/10"
                              >
                                View Details
                              </Button>
                            </td>
                          </motion.tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* 5. Pagination Bar */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 border-t border-border text-xs">
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <span>
                      Showing <strong className="text-foreground">{Math.min(startIndex + 1, totalRecords)}</strong> to{" "}
                      <strong className="text-foreground">{Math.min(startIndex + pageSize, totalRecords)}</strong> of{" "}
                      <strong className="text-foreground">{totalRecords}</strong> records
                    </span>
                    <div className="flex items-center gap-1.5 ml-2">
                      <span>Rows:</span>
                      <select
                        aria-label="Select rows per page"
                        value={pageSize}
                        onChange={(e) => setPageSize(Number(e.target.value))}
                        className="rounded border border-border bg-card px-2 py-1 text-xs text-foreground outline-none font-medium"
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
                    <button
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage <= 1}
                      aria-label="Previous Page"
                      className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" /> Prev
                    </button>
                    <button
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage >= totalPages}
                      aria-label="Next Page"
                      className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition"
                    >
                      Next <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </Card>
      )}

      {/* 6. User Details Dialog */}
      <Dialog open={!!selectedUser} onOpenChange={(open) => !open && setSelectedUser(null)}>
        {selectedUser && (
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            {/* Dialog Header */}
            <DialogHeader className="pb-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full gradient-primary text-base font-bold text-primary-foreground">
                  {selectedUser.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <DialogTitle className="text-lg font-heading font-bold text-foreground">{selectedUser.name}</DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground">{selectedUser.email}</DialogDescription>
                </div>
              </div>
            </DialogHeader>

            {/* Details Grid */}
            <div className="mt-4 grid grid-cols-2 gap-3.5 text-xs">
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Shield className="h-3 w-3 text-primary" /> Role & Permission
                </span>
                <div className="flex items-center gap-2 pt-0.5">
                  <Badge variant="outline" className={`text-xs ${ROLE_COLORS[selectedUser.role]}`}>
                    {ROLE_LABELS[selectedUser.role]}
                  </Badge>
                  {selectedUser.departmentRole && (
                    <span className="text-[11px] font-mono capitalize text-foreground font-semibold">
                      ({selectedUser.departmentRole})
                    </span>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1">
                <span className="text-muted-foreground flex items-center gap-1">
                  <CheckCircle className="h-3 w-3 text-emerald-500" /> Account Status
                </span>
                <div className="pt-0.5">
                  <Badge variant="outline" className={`text-xs ${STATUS_COLORS[selectedUser.status]}`}>
                    {STATUS_LABELS[selectedUser.status]}
                  </Badge>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Building className="h-3 w-3 text-amber-500" /> Department
                </span>
                <p className="font-medium text-foreground pt-0.5">
                  {selectedUser.department || "Not assigned"}
                </p>
              </div>

              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1">
                <span className="text-muted-foreground flex items-center gap-1">
                  <FileText className="h-3 w-3 text-blue-500" /> Total Complaints
                </span>
                <p className="font-semibold font-mono text-foreground text-sm pt-0.5">
                  {selectedUser.complaintsCount} submitted
                </p>
              </div>

              <div className="col-span-2 rounded-lg border border-border bg-muted/30 p-3 space-y-1">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3 text-sky-500" /> Registration Date
                </span>
                <p className="font-medium text-foreground pt-0.5">
                  {selectedUser.createdAt
                    ? new Date(selectedUser.createdAt).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })
                    : "Not recorded"}
                </p>
              </div>

              {/* Officer Member Mapping Section */}
              {selectedUser.role === "department" && selectedUser.departmentRole === "officer" && (
                <div className="col-span-2 rounded-lg border border-border bg-muted/30 p-3 space-y-1.5">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Link2 className="h-3 w-3 text-indigo-500" /> Member Mapping Assignment
                  </span>
                  <div className="flex items-center justify-between pt-0.5">
                    {selectedUser.memberLinked ? (
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                          Linked
                        </Badge>
                        <span className="font-medium text-foreground">
                          Assigned to member: <strong className="text-primary">{selectedUser.memberName}</strong>
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20">
                          Unlinked
                        </Badge>
                        <span className="text-muted-foreground">
                          Account not currently mapped to an operational department member.
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Dialog Footer */}
            <DialogFooter className="mt-5 pt-3 border-t border-border">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setSelectedUser(null)}
                className="text-xs"
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
};

export default UserManagement;
