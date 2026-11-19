import React, { useEffect, useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Building2,
  Users,
  Search,
  X,
  Filter,
  RefreshCw,
  Link2,
  Unlink2,
  ShieldCheck,
  Mail,
  UserCheck,
  Eye,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ChevronRight,
  Info,
  PlusCircle,
  Check,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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
import { useToast } from "@/hooks/use-toast";
import { DEPARTMENTS, Department, DEPARTMENT_METADATA } from "@/config/departments";
import {
  membersApi,
  MemberRecord,
  LinkedUserRecord,
  EligibleUser,
} from "@/services/complaintsApi";
import { adminApi, AdminUserRecord } from "@/services/adminApi";
import { ApiErrorPanel } from "@/components/shared/ApiErrorPanel";

export interface DepartmentSummary {
  name: Department;
  authority: AdminUserRecord | null;
  members: MemberRecord[];
  totalMembers: number;
  linkedMembers: number;
  unlinkedMembers: number;
  officerUsers: AdminUserRecord[];
}

export const AdminDepartments: React.FC = () => {
  const { toast } = useToast();

  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<unknown>(null);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [mappingFilter, setMappingFilter] = useState<string>("all"); // "all" | "linked" | "unlinked"

  // Selected member for read-only details modal
  const [selectedMember, setSelectedMember] = useState<MemberRecord | null>(null);

  // ── Phase 5E.2 Modal States ──

  // Link Officer Modal
  const [linkingMember, setLinkingMember] = useState<MemberRecord | null>(null);
  const [eligibleUsers, setEligibleUsers] = useState<EligibleUser[]>([]);
  const [loadingEligible, setLoadingEligible] = useState<boolean>(false);
  const [selectedUserIdToLink, setSelectedUserIdToLink] = useState<string>("");
  const [linkingLoading, setLinkingLoading] = useState<boolean>(false);
  const [linkError, setLinkError] = useState<string>("");

  // Unlink Officer Modal
  const [unlinkingMember, setUnlinkingMember] = useState<MemberRecord | null>(null);
  const [unlinkingLoading, setUnlinkingLoading] = useState<boolean>(false);
  const [unlinkError, setUnlinkError] = useState<string>("");

  // Create Member Modal
  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
  const [newMemberName, setNewMemberName] = useState<string>("");
  const [newMemberDept, setNewMemberDept] = useState<Department>("Road & Infrastructure");
  const [newMemberOfficerId, setNewMemberOfficerId] = useState<string>("");
  const [createEligibleUsers, setCreateEligibleUsers] = useState<EligibleUser[]>([]);
  const [loadingCreateEligible, setLoadingCreateEligible] = useState<boolean>(false);
  const [creatingMember, setCreatingMember] = useState<boolean>(false);
  const [createError, setCreateError] = useState<string>("");

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setLoadError(null);

    try {
      const [membersData, usersData] = await Promise.all([
        membersApi.list(),
        adminApi.listUsers(),
      ]);
      setMembers(Array.isArray(membersData) ? membersData : []);
      const userList = Array.isArray(usersData)
        ? usersData
        : Array.isArray((usersData as unknown as { data?: AdminUserRecord[] })?.data)
        ? (usersData as unknown as { data: AdminUserRecord[] }).data
        : [];
      setUsers(userList);
    } catch (err) {
      setLoadError(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load eligible users when Create Member dialog opens or department changes
  useEffect(() => {
    if (isCreateOpen) {
      setLoadingCreateEligible(true);
      membersApi
        .listEligibleUsers(newMemberDept)
        .then((list) => setCreateEligibleUsers(list))
        .catch(() => setCreateEligibleUsers([]))
        .finally(() => setLoadingCreateEligible(false));
    }
  }, [isCreateOpen, newMemberDept]);

  // Aggregate department overview summaries across the four departments
  const departmentSummaries: DepartmentSummary[] = useMemo(() => {
    const userList = Array.isArray(users) ? users : [];
    const memberList = Array.isArray(members) ? members : [];
    return DEPARTMENTS.map((deptName) => {
      // Find assigned authority
      const authority =
        userList.find(
          (u) =>
            u.role === "department" &&
            u.departmentRole === "authority" &&
            u.department === deptName
        ) || null;

      // Find member records for this department
      const deptMembers = memberList.filter((m) => m.department === deptName);

      // Find officer user accounts for this department
      const deptOfficerUsers = userList.filter(
        (u) =>
          u.role === "department" &&
          u.departmentRole === "officer" &&
          u.department === deptName
      );

      const linkedMembers = deptMembers.filter(
        (m) => m.userId && typeof m.userId === "object"
      ).length;
      const unlinkedMembers = deptMembers.length - linkedMembers;

      return {
        name: deptName,
        authority,
        members: deptMembers,
        totalMembers: deptMembers.length,
        linkedMembers,
        unlinkedMembers,
        officerUsers: deptOfficerUsers,
      };
    });
  }, [members, users]);

  // Filtered members roster
  const filteredMembers = useMemo(() => {
    return members.filter((member) => {
      // Department filter
      if (departmentFilter !== "all" && member.department !== departmentFilter) {
        return false;
      }

      // Mapping filter
      const isLinked = Boolean(member.userId && typeof member.userId === "object");
      if (mappingFilter === "linked" && !isLinked) return false;
      if (mappingFilter === "unlinked" && isLinked) return false;

      // Search query (matches member name, officer user name, or officer user email)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const memberNameMatches = member.name.toLowerCase().includes(q);
        const departmentMatches = member.department.toLowerCase().includes(q);

        let userMatches = false;
        if (member.userId && typeof member.userId === "object") {
          const user = member.userId as LinkedUserRecord;
          userMatches =
            Boolean(user.name && user.name.toLowerCase().includes(q)) ||
            Boolean(user.email && user.email.toLowerCase().includes(q));
        }

        if (!memberNameMatches && !departmentMatches && !userMatches) {
          return false;
        }
      }

      return true;
    });
  }, [members, departmentFilter, mappingFilter, searchQuery]);

  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    departmentFilter !== "all" ||
    mappingFilter !== "all";

  const clearFilters = () => {
    setSearchQuery("");
    setDepartmentFilter("all");
    setMappingFilter("all");
  };

  const getLinkedUser = (member: MemberRecord): LinkedUserRecord | null => {
    if (member.userId && typeof member.userId === "object") {
      return member.userId as LinkedUserRecord;
    }
    return null;
  };

  // ── Action Handlers ──

  const openLinkModal = async (member: MemberRecord) => {
    setLinkingMember(member);
    setSelectedUserIdToLink("");
    setLinkError("");
    setLoadingEligible(true);

    try {
      const list = await membersApi.listEligibleUsers(member.department);
      setEligibleUsers(list);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load eligible officers.";
      setLinkError(message);
    } finally {
      setLoadingEligible(false);
    }
  };

  const handleConfirmLink = async () => {
    if (!linkingMember) return;
    if (!selectedUserIdToLink) {
      setLinkError("Please select an eligible officer to link.");
      return;
    }

    setLinkingLoading(true);
    setLinkError("");

    try {
      await membersApi.update(linkingMember.id, { userId: selectedUserIdToLink });
      toast({
        title: "Officer linked successfully",
        description: `Linked ${linkingMember.name} to the selected officer account.`,
      });
      setLinkingMember(null);
      await loadData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to link officer.";
      setLinkError(message);
    } finally {
      setLinkingLoading(false);
    }
  };

  const openUnlinkModal = (member: MemberRecord) => {
    setUnlinkingMember(member);
    setUnlinkError("");
  };

  const handleConfirmUnlink = async () => {
    if (!unlinkingMember) return;

    setUnlinkingLoading(true);
    setUnlinkError("");

    try {
      await membersApi.update(unlinkingMember.id, { unlinkUser: true });
      toast({
        title: "Officer unlinked",
        description: `Disconnected officer account from ${unlinkingMember.name}. The roster entry is now unassigned.`,
      });
      setUnlinkingMember(null);
      await loadData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to unlink officer.";
      setUnlinkError(message);
    } finally {
      setUnlinkingLoading(false);
    }
  };

  const openCreateModal = () => {
    setNewMemberName("");
    setNewMemberDept(departmentFilter !== "all" ? (departmentFilter as Department) : "Road & Infrastructure");
    setNewMemberOfficerId("");
    setCreateError("");
    setIsCreateOpen(true);
  };

  const handleCreateMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberName.trim()) {
      setCreateError("Member name is required.");
      return;
    }
    if (!newMemberDept) {
      setCreateError("Department is required.");
      return;
    }

    setCreatingMember(true);
    setCreateError("");

    try {
      await membersApi.create(
        newMemberName.trim(),
        newMemberOfficerId || null,
        newMemberDept
      );
      toast({
        title: "Department member created",
        description: `Added ${newMemberName.trim()} to the ${newMemberDept} roster.`,
      });
      setIsCreateOpen(false);
      setNewMemberName("");
      setNewMemberOfficerId("");
      await loadData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create department member.";
      setCreateError(message);
    } finally {
      setCreatingMember(false);
    }
  };

  return (
    <div className="space-y-8" data-testid="admin-departments-page">
      {/* ── Header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">
            Department &amp; Officer Management
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Unified governance of municipal departments, assigned authorities, and officer roster mappings.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={openCreateModal}
            className="rounded-xl shadow-sm text-xs font-semibold"
            data-testid="create-member-btn"
          >
            <PlusCircle className="h-4 w-4 mr-1.5" />
            Add Member
          </Button>

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
      </div>

      {loadError && <ApiErrorPanel error={loadError} onRetry={() => loadData()} />}

      {/* ── Section 1: Department Overview Cards (All 4 Departments) ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            Municipal Department Overviews
          </h2>
          <span className="text-xs text-muted-foreground">
            {DEPARTMENTS.length} Active Departments
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {departmentSummaries.map((summary, idx) => {
            const meta = DEPARTMENT_METADATA[summary.name];
            const isSelected = departmentFilter === summary.name;

            return (
              <motion.div
                key={summary.name}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
              >
                <Card
                  onClick={() =>
                    setDepartmentFilter(isSelected ? "all" : summary.name)
                  }
                  className={`cursor-pointer transition-all p-5 h-full flex flex-col justify-between border ${
                    isSelected
                      ? "ring-2 ring-primary border-primary bg-primary/5 shadow-md"
                      : "hover:border-primary/50 hover:shadow-sm bg-card"
                  }`}
                  data-testid={`department-card-${summary.name.replace(/\s+/g, "-").toLowerCase()}`}
                >
                  <div className="space-y-3">
                    {/* Header: Emoji/Icon & Department Name */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="text-xl" role="img" aria-label={summary.name}>
                          {meta?.emoji || "🏛️"}
                        </span>
                        <div>
                          <h3 className="text-sm font-semibold text-foreground leading-tight">
                            {summary.name}
                          </h3>
                        </div>
                      </div>
                      <Badge
                        variant="secondary"
                        className={`text-[10px] font-medium px-2 py-0.5 ${
                          isSelected ? "bg-primary text-primary-foreground" : ""
                        }`}
                      >
                        {isSelected ? "Filtered" : "Filter"}
                      </Badge>
                    </div>

                    {/* Assigned Authority */}
                    <div className="rounded-lg bg-muted/40 p-2.5 border border-border/50 text-xs space-y-1">
                      <div className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                        <UserCheck className="h-3 w-3 text-primary" />
                        Assigned Authority
                      </div>
                      {summary.authority ? (
                        <div>
                          <div className="font-semibold text-foreground truncate">
                            {summary.authority.name}
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate">
                            {summary.authority.email}
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground italic">
                          No authority assigned
                        </div>
                      )}
                    </div>

                    {/* Roster Metrics */}
                    <div className="grid grid-cols-3 gap-1 pt-1 text-center">
                      <div className="bg-muted/30 rounded p-1.5">
                        <div className="text-xs font-bold text-foreground">
                          {summary.totalMembers}
                        </div>
                        <div className="text-[10px] text-muted-foreground">Members</div>
                      </div>
                      <div className="bg-emerald-500/10 rounded p-1.5 border border-emerald-500/20">
                        <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                          {summary.linkedMembers}
                        </div>
                        <div className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80">Linked</div>
                      </div>
                      <div className="bg-amber-500/10 rounded p-1.5 border border-amber-500/20">
                        <div className="text-xs font-bold text-amber-600 dark:text-amber-400">
                          {summary.unlinkedMembers}
                        </div>
                        <div className="text-[10px] text-amber-600/80 dark:text-amber-400/80">Unlinked</div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 pt-2 border-t border-border/40 text-[11px] text-muted-foreground flex items-center justify-between">
                    <span>{summary.officerUsers.length} Officer account{summary.officerUsers.length !== 1 ? "s" : ""}</span>
                    <span className="text-primary hover:underline font-medium">View roster &rarr;</span>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* ── Section 2: Officer & Member Roster ── */}
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              Officer &amp; Member Roster
            </h2>
            <p className="text-xs text-muted-foreground">
              Mapping status of department Member records to officer authentication accounts.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Showing <strong>{filteredMembers.length}</strong> of {members.length} members
            </span>
          </div>
        </div>

        {/* ── Filter & Search Toolbar ── */}
        <Card className="p-4 space-y-3 bg-card border-border">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                aria-label="Search members and officers"
                placeholder="Search member, officer name, or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-8 h-9 text-xs"
                data-testid="department-roster-search"
              />
              {searchQuery && (
                <button
                  type="button"
                  aria-label="Clear member search"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Department Select */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Dept:</span>
                <select
                  aria-label="Filter by Department"
                  value={departmentFilter}
                  onChange={(e) => setDepartmentFilter(e.target.value)}
                  className="h-9 text-xs rounded-md border border-input bg-background px-2.5 py-1 text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  data-testid="department-filter-select"
                >
                  <option value="all">All Departments</option>
                  {DEPARTMENTS.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
              </div>

              {/* Mapping Status Select */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Status:</span>
                <select
                  aria-label="Filter by Mapping Status"
                  value={mappingFilter}
                  onChange={(e) => setMappingFilter(e.target.value)}
                  className="h-9 text-xs rounded-md border border-input bg-background px-2.5 py-1 text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  data-testid="mapping-filter-select"
                >
                  <option value="all">All Mappings</option>
                  <option value="linked">Linked Only</option>
                  <option value="unlinked">Unlinked Only</option>
                </select>
              </div>

              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="h-9 text-xs text-muted-foreground hover:text-foreground"
                  data-testid="clear-filters-button"
                >
                  <X className="h-3.5 w-3.5 mr-1" />
                  Clear
                </Button>
              )}
            </div>
          </div>
        </Card>

        {/* ── Roster Table ── */}
        <Card className="overflow-hidden border border-border">
          {loading ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-primary" />
              Loading department roster records...
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground" />
              <div className="text-sm font-semibold text-foreground">
                No matching department members found
              </div>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                {hasActiveFilters
                  ? "Try adjusting your search criteria or clearing active filters."
                  : "No member records exist in the database."}
              </p>
              {hasActiveFilters && (
                <Button variant="outline" size="sm" onClick={clearFilters} className="mt-2 text-xs">
                  Reset Filters
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/40 font-medium text-muted-foreground">
                    <th className="py-3 px-4">Member Name</th>
                    <th className="py-3 px-4">Department</th>
                    <th className="py-3 px-4">Mapping Status</th>
                    <th className="py-3 px-4">Linked User Account</th>
                    <th className="py-3 px-4">Officer Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredMembers.map((member) => {
                    const linkedUser = getLinkedUser(member);
                    const isLinked = Boolean(linkedUser);

                    return (
                      <tr
                        key={member.id}
                        className="hover:bg-muted/30 transition-colors"
                        data-testid={`member-row-${member.name.replace(/\s+/g, "-").toLowerCase()}`}
                      >
                        {/* Member Name */}
                        <td
                          className="py-3 px-4 font-semibold text-foreground cursor-pointer"
                          onClick={() => setSelectedMember(member)}
                        >
                          <div className="flex items-center gap-2">
                            <span className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                              {member.name.charAt(0)}
                            </span>
                            <span>{member.name}</span>
                          </div>
                        </td>

                        {/* Department */}
                        <td className="py-3 px-4 text-muted-foreground">
                          <Badge variant="outline" className="font-normal text-[11px]">
                            {member.department}
                          </Badge>
                        </td>

                        {/* Mapping Status Badge */}
                        <td className="py-3 px-4">
                          {isLinked ? (
                            <Badge
                              variant="outline"
                              className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 flex items-center gap-1 w-fit"
                            >
                              <Link2 className="h-3 w-3" />
                              Linked
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 flex items-center gap-1 w-fit"
                            >
                              <Unlink2 className="h-3 w-3" />
                              Unlinked
                            </Badge>
                          )}
                        </td>

                        {/* Linked User Account */}
                        <td className="py-3 px-4">
                          {isLinked && linkedUser ? (
                            <div className="space-y-0.5">
                              <div className="font-medium text-foreground">{linkedUser.name}</div>
                              <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                                <Mail className="h-2.5 w-2.5" />
                                {linkedUser.email}
                              </div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground italic text-[11px]">
                              No account linked
                            </span>
                          )}
                        </td>

                        {/* Officer Status */}
                        <td className="py-3 px-4">
                          {isLinked && linkedUser ? (
                            <Badge
                              variant="secondary"
                              className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] uppercase font-semibold tracking-wider"
                            >
                              {linkedUser.status || "Active"}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Inspect details */}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedMember(member)}
                              className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                              data-testid={`inspect-member-${member.name.replace(/\s+/g, "-").toLowerCase()}`}
                              title="Inspect Details"
                            >
                              <Eye className="h-3.5 w-3.5 mr-1" />
                              Inspect
                            </Button>

                            {/* Link or Unlink button */}
                            {isLinked ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openUnlinkModal(member)}
                                className="h-8 px-2.5 text-xs text-rose-600 dark:text-rose-400 border-rose-500/20 hover:bg-rose-500/10 hover:text-rose-700"
                                data-testid={`unlink-officer-${member.name.replace(/\s+/g, "-").toLowerCase()}`}
                              >
                                <Unlink2 className="h-3.5 w-3.5 mr-1" />
                                Unlink
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openLinkModal(member)}
                                className="h-8 px-2.5 text-xs text-emerald-600 dark:text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/10 hover:text-emerald-700"
                                data-testid={`link-officer-${member.name.replace(/\s+/g, "-").toLowerCase()}`}
                              >
                                <Link2 className="h-3.5 w-3.5 mr-1" />
                                Link Officer
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* ── Modal 1: Link Officer Dialog ── */}
      <Dialog open={Boolean(linkingMember)} onOpenChange={(open) => !open && setLinkingMember(null)}>
        <DialogContent className="max-w-md bg-card border-border sm:max-w-lg" data-testid="link-officer-dialog">
          {linkingMember && (
            <div className="space-y-4">
              <DialogHeader>
                <DialogTitle className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Link2 className="h-5 w-5 text-emerald-500" />
                  Link Officer to {linkingMember.name}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Connect an active, approved {linkingMember.department} field officer account to this member roster profile.
                </DialogDescription>
              </DialogHeader>

              {linkError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{linkError}</span>
                </div>
              )}

              <div className="rounded-xl border border-border/80 bg-muted/20 p-3.5 space-y-2 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-muted-foreground block text-[11px]">Member Name</span>
                    <span className="font-semibold text-foreground">{linkingMember.name}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[11px]">Department</span>
                    <Badge variant="outline" className="mt-0.5 text-xs">
                      {linkingMember.department}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Eligible Officer Selection */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground block">
                  Select Eligible Officer Account
                </label>

                {loadingEligible ? (
                  <div className="p-6 text-center text-xs text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin mx-auto mb-1 text-primary" />
                    Finding eligible officers in {linkingMember.department}...
                  </div>
                ) : eligibleUsers.length === 0 ? (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-center text-xs space-y-1">
                    <AlertTriangle className="h-5 w-5 mx-auto text-amber-500" />
                    <div className="font-medium text-foreground">No eligible officers found</div>
                    <p className="text-muted-foreground text-[11px]">
                      No active, unlinked officer accounts are currently available in {linkingMember.department}.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {eligibleUsers.map((user) => {
                      const isSelected = selectedUserIdToLink === user.id;
                      const isUnavailable = user.isLinked;

                      return (
                        <button
                          type="button"
                          key={user.id}
                          disabled={isUnavailable}
                          aria-pressed={isSelected}
                          aria-label={`Select officer ${user.name}${isUnavailable ? " (Already linked)" : ""}`}
                          onClick={() => {
                            if (!isUnavailable) setSelectedUserIdToLink(user.id);
                          }}
                          onKeyDown={(e) => {
                            if ((e.key === "Enter" || e.key === " ") && !isUnavailable) {
                              e.preventDefault();
                              setSelectedUserIdToLink(user.id);
                            }
                          }}
                          className={`w-full p-3 rounded-lg border text-xs flex items-center justify-between text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-background ${
                            isUnavailable
                              ? "opacity-50 cursor-not-allowed bg-muted/20 border-border/40"
                              : isSelected
                              ? "border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-500/5 cursor-pointer"
                              : "border-border hover:border-primary/50 cursor-pointer bg-card"
                          }`}
                          data-testid={`eligible-officer-${user.id}`}
                        >
                          <div className="space-y-0.5">
                            <div className="font-semibold text-foreground flex items-center gap-1.5">
                              {user.name}
                              {isUnavailable && (
                                <Badge variant="outline" className="text-[10px] text-muted-foreground py-0">
                                  Already linked to {user.linkedMember?.memberName || "another"}
                                </Badge>
                              )}
                            </div>
                            <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                              <Mail className="h-2.5 w-2.5" />
                              {user.email}
                            </div>
                          </div>

                          <div className="shrink-0 ml-2">
                            {isSelected ? (
                              <div className="h-5 w-5 rounded-full bg-emerald-500 text-white flex items-center justify-center">
                                <Check className="h-3 w-3" />
                              </div>
                            ) : (
                              <div className="h-4 w-4 rounded-full border border-border" />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <DialogFooter className="pt-2 flex items-center justify-end gap-2 border-t border-border">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLinkingMember(null)}
                  disabled={linkingLoading}
                  className="text-xs"
                  data-testid="cancel-link-officer-btn"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleConfirmLink}
                  disabled={!selectedUserIdToLink || linkingLoading}
                  className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                  data-testid="confirm-link-officer-btn"
                >
                  {linkingLoading ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      Linking...
                    </>
                  ) : (
                    "Confirm Link"
                  )}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Modal 2: Unlink Confirmation Dialog ── */}
      <Dialog open={Boolean(unlinkingMember)} onOpenChange={(open) => !open && setUnlinkingMember(null)}>
        <DialogContent className="max-w-md bg-card border-border" data-testid="unlink-confirmation-dialog">
          {unlinkingMember && (
            <div className="space-y-4">
              <DialogHeader>
                <DialogTitle className="text-lg font-bold text-foreground flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  Confirm Officer Disconnection
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Disconnect the officer login account from this municipal roster record.
                </DialogDescription>
              </DialogHeader>

              {unlinkError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{unlinkError}</span>
                </div>
              )}

              <div className="rounded-xl border border-border/80 bg-muted/20 p-4 space-y-3 text-xs">
                <div className="space-y-1">
                  <span className="text-[11px] text-muted-foreground block">Member Roster Entry</span>
                  <div className="font-semibold text-foreground text-sm">{unlinkingMember.name}</div>
                  <Badge variant="outline" className="text-[11px] font-normal">
                    {unlinkingMember.department}
                  </Badge>
                </div>

                <div className="pt-2 border-t border-border/60 space-y-1">
                  <span className="text-[11px] text-muted-foreground block">Currently Linked Account</span>
                  {(() => {
                    const linkedUser = getLinkedUser(unlinkingMember);
                    return linkedUser ? (
                      <div className="font-medium text-foreground">
                        {linkedUser.name}{" "}
                        <span className="text-muted-foreground text-[11px]">({linkedUser.email})</span>
                      </div>
                    ) : (
                      <span className="italic text-muted-foreground">Unknown user</span>
                    );
                  })()}
                </div>
              </div>

              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-600 dark:text-amber-400">
                <strong>Note:</strong> Unlinking will remove active assignment access for this officer until mapped to another roster entry. The member record and officer account will <em>not</em> be deleted.
              </div>

              <DialogFooter className="pt-2 flex items-center justify-end gap-2 border-t border-border">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setUnlinkingMember(null)}
                  disabled={unlinkingLoading}
                  className="text-xs"
                  data-testid="cancel-unlink-officer-btn"
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleConfirmUnlink}
                  disabled={unlinkingLoading}
                  className="text-xs"
                  data-testid="confirm-unlink-officer-btn"
                >
                  {unlinkingLoading ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      Unlinking...
                    </>
                  ) : (
                    "Confirm Unlink"
                  )}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Modal 3: Create Member Dialog ── */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-md bg-card border-border sm:max-w-lg" data-testid="create-member-dialog">
          <form onSubmit={handleCreateMember} className="space-y-4">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-foreground flex items-center gap-2">
                <PlusCircle className="h-5 w-5 text-primary" />
                Add Department Member
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Create a new field officer roster entry for municipal complaint assignments.
              </DialogDescription>
            </DialogHeader>

            {createError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{createError}</span>
              </div>
            )}

            <div className="space-y-3 text-xs">
              {/* Member Name */}
              <div className="space-y-1.5">
                <label htmlFor="new-member-name" className="font-semibold text-foreground block">
                  Member / Officer Display Name <span className="text-rose-500">*</span>
                </label>
                <Input
                  id="new-member-name"
                  placeholder="e.g. Officer Suresh"
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  className="h-9 text-xs"
                  data-testid="new-member-name-input"
                  required
                />
              </div>

              {/* Department Select */}
              <div className="space-y-1.5">
                <label htmlFor="new-member-dept" className="font-semibold text-foreground block">
                  Department <span className="text-rose-500">*</span>
                </label>
                <select
                  id="new-member-dept"
                  aria-label="Department"
                  value={newMemberDept}
                  onChange={(e) => {
                    setNewMemberDept(e.target.value as Department);
                    setNewMemberOfficerId("");
                  }}
                  className="w-full h-9 text-xs rounded-md border border-input bg-background px-3 py-1 text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  data-testid="new-member-department-select"
                >
                  {DEPARTMENTS.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
              </div>

              {/* Optional Officer Account Mapping */}
              <div className="space-y-1.5 pt-1">
                <label htmlFor="new-member-officer" className="font-semibold text-foreground block">
                  Officer Account Link <span className="text-muted-foreground font-normal">(Optional)</span>
                </label>
                {loadingCreateEligible ? (
                  <div className="p-2 text-xs text-muted-foreground flex items-center gap-1.5">
                    <Loader2 className="h-3 w-3 animate-spin text-primary" />
                    Checking available accounts...
                  </div>
                ) : (
                  <select
                    id="new-member-officer"
                    aria-label="Officer Account Link"
                    value={newMemberOfficerId}
                    onChange={(e) => setNewMemberOfficerId(e.target.value)}
                    className="w-full h-9 text-xs rounded-md border border-input bg-background px-3 py-1 text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    data-testid="new-member-officer-select"
                  >
                    <option value="">None (Keep unlinked for now)</option>
                    {createEligibleUsers
                      .filter((u) => !u.isLinked)
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.email})
                        </option>
                      ))}
                  </select>
                )}
                <span className="text-[11px] text-muted-foreground block">
                  You can map an unlinked officer user immediately, or leave it unassigned to link later.
                </span>
              </div>
            </div>

            <DialogFooter className="pt-2 flex items-center justify-end gap-2 border-t border-border">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsCreateOpen(false)}
                disabled={creatingMember}
                className="text-xs"
                data-testid="cancel-create-member-btn"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={creatingMember || !newMemberName.trim()}
                className="text-xs"
                data-testid="submit-create-member-btn"
              >
                {creatingMember ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Member"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Modal 4: Read-Only Member Details Dialog ── */}
      <Dialog open={Boolean(selectedMember)} onOpenChange={(open) => !open && setSelectedMember(null)}>
        <DialogContent className="max-w-md bg-card border-border sm:max-w-lg" data-testid="member-details-dialog">
          {selectedMember && (
            <div className="space-y-5">
              <DialogHeader>
                <div className="flex items-center justify-between">
                  <DialogTitle className="text-lg font-bold text-foreground flex items-center gap-2">
                    <UserCheck className="h-5 w-5 text-primary" />
                    Member Profile Details
                  </DialogTitle>
                  {selectedMember.userId && typeof selectedMember.userId === "object" ? (
                    <Badge
                      variant="outline"
                      className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                    >
                      <Link2 className="h-3 w-3 mr-1" />
                      Linked Officer
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                    >
                      <Unlink2 className="h-3 w-3 mr-1" />
                      Unlinked Member
                    </Badge>
                  )}
                </div>
                <DialogDescription className="text-xs text-muted-foreground">
                  Read-only administrative inspection of member and officer account linkage.
                </DialogDescription>
              </DialogHeader>

              {/* Member Core Attributes */}
              <div className="rounded-xl border border-border/80 bg-muted/20 p-4 space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-primary" />
                  Roster Member Information
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-muted-foreground block text-[11px]">Member ID</span>
                    <span className="font-mono text-foreground">{selectedMember.id}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[11px]">Member Name</span>
                    <span className="font-semibold text-foreground">{selectedMember.name}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[11px]">Department</span>
                    <Badge variant="outline" className="text-xs mt-0.5">
                      {selectedMember.department}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[11px]">Mapping Status</span>
                    <span className="font-medium text-foreground">
                      {selectedMember.userId && typeof selectedMember.userId === "object"
                        ? "Linked to Account"
                        : "Unlinked / Available"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Linked Account Details (if linked) */}
              {selectedMember.userId && typeof selectedMember.userId === "object" ? (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Linked Officer Account
                  </div>

                  {(() => {
                    const user = selectedMember.userId as LinkedUserRecord;
                    return (
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <span className="text-muted-foreground block text-[11px]">Account ID</span>
                          <span className="font-mono text-foreground">{user.id}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block text-[11px]">Account Name</span>
                          <span className="font-semibold text-foreground">{user.name}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block text-[11px]">Officer Email</span>
                          <span className="text-foreground">{user.email}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block text-[11px]">Account Status</span>
                          <Badge
                            variant="secondary"
                            className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] uppercase font-bold mt-0.5"
                          >
                            {user.status || "Active"}
                          </Badge>
                        </div>
                        <div>
                          <span className="text-muted-foreground block text-[11px]">System Role</span>
                          <span className="capitalize text-foreground font-medium">
                            {user.role || "department"}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block text-[11px]">Department Role</span>
                          <span className="capitalize text-foreground font-medium">
                            {user.departmentRole || "officer"}
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-2">
                  <div className="text-xs font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                    <Info className="h-4 w-4" />
                    Unlinked Member Profile
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    This Member record has not been linked to an active department officer account. You can link an eligible officer from the roster actions.
                  </p>
                </div>
              )}

              {/* Safety notice & Close */}
              <div className="pt-2 flex items-center justify-between border-t border-border">
                <span className="text-[11px] text-muted-foreground italic flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3 text-primary" />
                  Read-only Administrative View
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedMember(null)}
                  className="text-xs"
                  data-testid="close-member-details-dialog"
                >
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminDepartments;
