import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Card } from "@/components/ui/card";
import { MapPin, Calendar, ChevronDown, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { complaintsApi, ComplaintRecord } from "@/services/complaintsApi";
import { ApiErrorPanel } from "@/components/shared/ApiErrorPanel";
import { ResolveComplaintDialog } from "@/components/shared/ResolveComplaintDialog";

const FILTERS = ["Assigned", "Pending", "In Progress", "Resolved"] as const;
type StatusOption = (typeof FILTERS)[number];

// ─── Per-complaint status row ────────────────────────────────────────────────
interface StatusRowProps {
  complaint: ComplaintRecord;
  onUpdated: (updated: ComplaintRecord) => void;
  onRequestResolve: (complaint: ComplaintRecord) => void;
}

const StatusRow: React.FC<StatusRowProps> = ({ complaint, onUpdated, onRequestResolve }) => {
  const [selected, setSelected] = useState<string>(complaint.status);
  const [updating, setUpdating] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep local selected in sync when parent list refreshes from outside
  useEffect(() => {
    setSelected(complaint.status);
  }, [complaint.status]);

  const isDirty = selected !== complaint.status;

  const handleUpdate = async () => {
    if (!isDirty || updating) return;

    if (selected === "Resolved") {
      onRequestResolve(complaint);
      return;
    }

    setUpdating(true);
    setMessage(null);
    try {
      const updated = await complaintsApi.updateStatus(complaint.id, selected);
      onUpdated(updated);
      setMessage({ kind: "success", text: "Status updated successfully." });
    } catch {
      // Revert selection to saved status on failure
      setSelected(complaint.status);
      setMessage({ kind: "error", text: "Failed to update status. Please try again." });
    } finally {
      setUpdating(false);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setMessage(null), 3000);
    }
  };

  return (
    <div className="w-full lg:w-56 flex flex-col gap-2">
      <select
        value={selected}
        disabled={updating}
        onChange={(e) => setSelected(e.target.value)}
        className="w-full rounded-md border border-border bg-card px-2 py-2 text-sm text-foreground disabled:opacity-60"
      >
        {FILTERS.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      <AnimatePresence>
        {isDirty && (
          <motion.button
            key="update-btn"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            onClick={handleUpdate}
            disabled={updating}
            className="flex items-center justify-center gap-1.5 w-full rounded-md bg-destructive px-3 py-1.5 text-xs font-semibold text-destructive-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {updating ? (
              <><Loader2 className="w-3 h-3 animate-spin" /> Updating…</>
            ) : selected === "Resolved" ? (
              "Resolve Complaint…"
            ) : (
              "Update Status"
            )}
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {message && (
          <motion.p
            key="msg"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={`text-xs ${message.kind === "success" ? "text-green-600 dark:text-green-400" : "text-destructive"}`}
          >
            {message.text}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
};

// ─── Main page ────────────────────────────────────────────────────────────────
const AssignedComplaints: React.FC = () => {
  const [complaints, setComplaints] = useState<ComplaintRecord[]>([]);
  const [activeOfficer, setActiveOfficer] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusOption>("Assigned");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [resolvingComplaint, setResolvingComplaint] = useState<ComplaintRecord | null>(null);

  const loadComplaints = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await complaintsApi.listDepartment();
      setComplaints(data);
    } catch (error) {
      setLoadError(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadComplaints();
  }, [loadComplaints]);

  const groupedByOfficer = useMemo(() => {
    const grouped: Record<string, ComplaintRecord[]> = {};
    complaints.forEach((complaint) => {
      const officer = complaint.assignedTo?.name;
      if (!officer) return;
      if (!grouped[officer]) grouped[officer] = [];
      grouped[officer].push(complaint);
    });
    return grouped;
  }, [complaints]);

  const officers = Object.keys(groupedByOfficer);

  useEffect(() => {
    if (!activeOfficer && officers.length) {
      setActiveOfficer(officers[0]);
    }
  }, [officers, activeOfficer]);

  /** Replace a single complaint in the list with the API-returned updated record */
  const handleComplaintUpdated = (updated: ComplaintRecord) => {
    setComplaints((prev) =>
      prev.map((c) => (c.id === updated.id ? updated : c))
    );
  };

  const officerComplaints = activeOfficer ? groupedByOfficer[activeOfficer] || [] : [];
  const filteredComplaints = officerComplaints.filter((c) => c.status === filter);

  if (loading) return <Card className="glass-card"><div className="p-4 text-sm text-muted-foreground">Loading complaints…</div></Card>;
  if (loadError) return <ApiErrorPanel error={loadError} onRetry={() => void loadComplaints()} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">Complaints</h1>
        <p className="text-muted-foreground text-sm">Officer-based complaint management</p>
      </div>

      {officers.length === 0 && (
        <Card className="glass-card">
          <div className="p-4 text-sm text-muted-foreground">No assigned complaints yet.</div>
        </Card>
      )}

      <div className="space-y-3">
        {officers.map((officer) => {
          const list = groupedByOfficer[officer] || [];
          return (
            <Card key={officer} className="glass-card">
              <button
                className="w-full flex items-center justify-between px-4 py-3 text-left"
                onClick={() => setActiveOfficer(officer)}
              >
                <div>
                  <p className="text-sm font-semibold text-foreground">{officer}</p>
                  <p className="text-xs text-muted-foreground">{list.length} complaints</p>
                </div>
                <ChevronDown
                  className={`w-4 h-4 text-muted-foreground transition-transform ${
                    activeOfficer === officer ? "rotate-180" : ""
                  }`}
                />
              </button>

              {activeOfficer === officer && (
                <div className="border-t border-border p-4 space-y-3">
                  {/* Status filter tabs */}
                  <div className="flex flex-wrap items-center gap-2">
                    {FILTERS.map((value) => (
                      <button
                        key={value}
                        onClick={() => setFilter(value)}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                          filter === value
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-card border-border text-foreground"
                        }`}
                      >
                        {value}
                      </button>
                    ))}
                  </div>

                  {filteredComplaints.length === 0 ? (
                    <div className="text-sm text-muted-foreground">
                      No complaints for this officer in the selected status.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {filteredComplaints.map((complaint, index) => (
                        <motion.div
                          key={complaint.id}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.03 }}
                          className="p-4 rounded-lg border border-border bg-card/80"
                        >
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                            {/* Complaint info */}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <Link
                                  to={`/department/complaints/${complaint.id}`}
                                  className="text-xs font-mono text-muted-foreground hover:text-primary hover:underline"
                                >
                                  {complaint.reference}
                                </Link>
                                <StatusBadge status={complaint.status} />
                              </div>
                              <h3 className="font-medium text-foreground text-sm">{complaint.title}</h3>
                              <p className="text-xs text-muted-foreground mt-1">{complaint.description}</p>
                              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4 mt-2 text-xs text-muted-foreground">
                                {complaint.location && (
                                  <span className="flex items-center gap-1">
                                    <MapPin className="w-3 h-3" />
                                    {complaint.location}
                                  </span>
                                )}
                                <span className="flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  {new Date(complaint.createdAt).toLocaleDateString()}
                                </span>
                                <span>Category: {complaint.category}</span>
                              </div>
                            </div>

                            {/* Status dropdown + Update button */}
                            <StatusRow
                              complaint={complaint}
                              onUpdated={handleComplaintUpdated}
                              onRequestResolve={(c) => setResolvingComplaint(c)}
                            />
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {resolvingComplaint && (
        <ResolveComplaintDialog
          open={Boolean(resolvingComplaint)}
          onOpenChange={(isOpen) => {
            if (!isOpen) setResolvingComplaint(null);
          }}
          complaintId={resolvingComplaint.id}
          complaintReference={resolvingComplaint.reference || ""}
          complaintTitle={resolvingComplaint.title}
          onSuccess={(updated) => {
            handleComplaintUpdated(updated);
            setResolvingComplaint(null);
          }}
        />
      )}
    </div>
  );
};

export default AssignedComplaints;
