import React from "react";
import { Link } from "react-router-dom";
import { StatusBadge, PriorityBadge } from "@/components/shared/StatusBadge";
import { Brain, MapPin, Calendar } from "lucide-react";
import { motion } from "framer-motion";
import { complaintsApi } from "@/services/complaintsApi";
import { Card } from "@/components/ui/card";
import { ApiErrorPanel } from "@/components/shared/ApiErrorPanel";
import { ComplaintRecord } from "@/services/complaintsApi";

const slaStatusClass: Record<string, string> = {
  "On Track": "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-400",
  "Due Soon": "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400",
  Overdue: "border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400",
  Resolved: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400",
  Unavailable: "border-slate-200 bg-slate-50 text-slate-500 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-400",
};

const MyComplaints: React.FC = () => {
  const [complaints, setComplaints] = React.useState<ComplaintRecord[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<unknown>(null);

  const loadComplaints = React.useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const apiData = await complaintsApi.listMine();
      setComplaints(apiData);
    } catch (requestError) {
      setLoadError(requestError);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadComplaints().catch(() => setLoading(false));
  }, [loadComplaints]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">My Complaints</h1>
        <p className="text-muted-foreground text-sm mt-0.5">{complaints.length} complaints filed</p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading complaints...</p>
      ) : loadError ? (
        <ApiErrorPanel error={loadError} onRetry={() => void loadComplaints()} />
      ) : complaints.length === 0 ? (
        <p className="text-sm text-muted-foreground">You have not filed any complaints yet.</p>
      ) : null}

      {!loading && !loadError && complaints.length > 0 && <div className="space-y-3">
        {complaints.map((c, i) => (
          <motion.div key={c.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
            <Link to={`/citizen/complaints/${c.id}`}>
              <Card className="holographic-card rounded-3xl border border-border/60 bg-card p-0 shadow-[0_2px_6px_rgba(0,0,0,0.04)] transition-transform duration-200 hover:-translate-y-0.5">
                <div className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="text-xs font-mono text-muted-foreground">{c.reference}</span>
                        <StatusBadge status={c.status} />
                        {c.priority && <PriorityBadge priority={c.priority} />}
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${slaStatusClass[c.sla.slaStatus] || slaStatusClass.Unavailable}`}>
                          SLA: {c.sla.slaStatus}
                        </span>
                      </div>
                      <h3 className="font-medium text-foreground truncate">{c.title}</h3>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{c.location || "Location not provided"}</span>
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(c.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                    {c.aiUrgencyScore && (
                      <div className="flex flex-col items-center gap-0.5 shrink-0">
                        <Brain className="w-4 h-4 text-primary" />
                        <span className="text-xs font-bold text-foreground">{c.aiUrgencyScore}</span>
                        <span className="text-[10px] text-muted-foreground">Urgency</span>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </Link>
          </motion.div>
        ))}
      </div>}
    </div>
  );
};

export default MyComplaints;
