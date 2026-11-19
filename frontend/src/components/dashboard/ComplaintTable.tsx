import React from "react";
import { Filter, Search, SlidersHorizontal } from "lucide-react";
import { ComplaintRecord } from "@/services/complaintsApi";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface ComplaintTableProps {
  complaints: ComplaintRecord[];
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
}

const formatDate = (date: string) => new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
}).format(new Date(date));

export const ComplaintTable: React.FC<ComplaintTableProps> = ({
  complaints,
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
}) => {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-slate-200/80 dark:border-white/[0.07] bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-5 shadow-xl dark:shadow-none md:p-6">
      {/* Glow */}
      <div className="pointer-events-none absolute -top-10 -right-10 w-32 h-32 rounded-full bg-blue-500/10 dark:bg-blue-500/15 blur-3xl" />

      <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">Recent Activity</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Search and review the latest complaint activity across the system.</p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full sm:w-[280px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <Input
              aria-label="Search complaints"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search complaint, category..."
              className="h-11 rounded-xl border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.04] pl-10 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus-visible:ring-blue-500/40"
            />
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-slate-200/80 dark:border-white/[0.07] bg-slate-50 dark:bg-white/[0.04] px-3">
            <Filter className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <select
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(event) => onStatusFilterChange(event.target.value)}
              className="h-11 bg-transparent text-sm text-slate-700 dark:text-slate-200 outline-none"
            >
              <option value="All">All Statuses</option>
              <option value="Pending">Pending</option>
              <option value="Assigned">Assigned</option>
              <option value="In Progress">In Progress</option>
              <option value="Resolved">Resolved</option>
            </select>
          </div>

          <Button variant="outline" className="h-11 rounded-xl border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.04] text-slate-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-blue-500/10 px-4">
            <SlidersHorizontal className="mr-2 h-4 w-4" />
            Filter
          </Button>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200/80 dark:border-white/[0.07]">
        <Table>
          <TableHeader className="bg-slate-50/80 dark:bg-white/[0.03]">
            <TableRow className="border-slate-200 dark:border-white/[0.06] hover:bg-slate-100/50 dark:hover:bg-white/[0.04]">
              <TableHead className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Complaint ID</TableHead>
              <TableHead className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Title</TableHead>
              <TableHead className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Status</TableHead>
              <TableHead className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Category</TableHead>
              <TableHead className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {complaints.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">
                  No complaints match the current search and filter.
                </TableCell>
              </TableRow>
            ) : (
              complaints.map((complaint) => (
                <TableRow key={complaint.id} className="border-slate-100 dark:border-white/[0.05] bg-transparent transition hover:bg-blue-50/40 dark:hover:bg-blue-500/[0.05]">
                  <TableCell className="font-mono text-xs font-bold text-slate-500 dark:text-slate-400">{complaint.reference}</TableCell>
                  <TableCell>
                    <div className="max-w-[320px]">
                      <p className="truncate font-bold text-slate-900 dark:text-white">{complaint.title}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-400 dark:text-slate-500">{complaint.location || "Location not specified"}</p>
                    </div>
                  </TableCell>
                  <TableCell><StatusBadge status={complaint.status} /></TableCell>
                  <TableCell className="text-sm font-medium text-slate-700 dark:text-slate-300">{complaint.category}</TableCell>
                  <TableCell className="text-sm text-slate-500 dark:text-slate-400">{formatDate(complaint.createdAt)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
};

export default ComplaintTable;
