import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { motion } from "framer-motion";
import { PlusCircle, FileText, AlertTriangle, CheckCircle, Clock, ArrowRight, Brain, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { complaintsApi, ComplaintRecord } from "@/services/complaintsApi";
import { ApiErrorPanel } from "@/components/shared/ApiErrorPanel";

const slaStatusClass: Record<string, string> = {
  "On Track": "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-400",
  "Due Soon": "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400",
  Overdue: "border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400",
  Resolved: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400",
  Unavailable: "border-slate-200 bg-slate-50 text-slate-500 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-400",
};

const CitizenDashboard: React.FC = () => {
  const { user } = useAuth();
  const [complaints, setComplaints] = React.useState<ComplaintRecord[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<unknown>(null);

  const load = React.useCallback(async () => {
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
    load().catch(() => setLoading(false));
  }, [load]);

  const active = complaints.filter((c) => !["resolved", "Resolved", "closed"].includes(c.status as string));
  const resolved = complaints.filter((c) => (c.status as string)?.toLowerCase() === "resolved");

  const stats = [
    { label: "Total Complaints", value: complaints.length, icon: FileText, color: "text-primary" },
    { label: "Active", value: active.length, icon: Clock, color: "text-warning" },
    { label: "Escalated", value: complaints.filter((c) => c.status === "escalated").length, icon: AlertTriangle, color: "text-destructive" },
    { label: "Resolved", value: resolved.length, icon: CheckCircle, color: "text-success" },
  ];

  const resolutionRate = complaints.length > 0 ? Math.round((resolved.length / complaints.length) * 100) : 0;

  if (loadError) return <ApiErrorPanel error={loadError} onRetry={() => void load()} />;

  return (
    <div className="space-y-6">
      {/* ══ Hero Header ══ */}
      <motion.section
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative overflow-hidden rounded-2xl border border-slate-200/80 dark:border-white/[0.07] bg-white/80 dark:bg-slate-900/80 backdrop-blur-md shadow-xl dark:shadow-none"
      >
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute top-0 left-0 w-64 h-64 rounded-full bg-blue-500/10 dark:bg-blue-500/15 blur-3xl -translate-x-1/2 -translate-y-1/2" />
          <div className="absolute bottom-0 right-0 w-48 h-48 rounded-full bg-sky-500/10 dark:bg-sky-500/15 blur-3xl translate-x-1/3 translate-y-1/3" />
        </div>

        <div className="relative px-5 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <div className="mb-4 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-blue-200 dark:border-blue-500/20 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 text-xs font-bold uppercase tracking-widest">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <TrendingUp className="h-3.5 w-3.5" />
                Personal Portal
              </div>
              <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white sm:text-4xl">
                Welcome,{" "}
                <span className="bg-gradient-to-r from-blue-600 to-blue-400 bg-clip-text text-transparent">
                  {user?.name?.split(" ")[0] || "Citizen"}
                </span>
              </h1>
              <p className="mt-3 max-w-[65ch] text-sm leading-6 text-slate-500 dark:text-slate-400 sm:text-base">
                Track and manage all your complaints in one unified dashboard. Monitor resolution progress and communicate directly with authorities.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                { label: "Total Filed", value: complaints.length },
                { label: "Resolution Rate", value: `${resolutionRate}%` },
                { label: "Active Cases", value: active.length },
              ].map((pill) => (
                <div key={pill.label} className="rounded-xl border border-slate-200/80 dark:border-white/[0.07] bg-slate-50/80 dark:bg-white/[0.04] backdrop-blur px-4 py-4">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">{pill.label}</p>
                  <p className="mt-2 text-base font-bold text-slate-900 dark:text-white">{pill.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.section>

      {/* ══ Stat Cards ══ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 20, rotateX: 6 }}
            animate={{ opacity: 1, y: 0, rotateX: 0 }}
            transition={{ delay: i * 0.07, duration: 0.45, ease: "easeOut" }}
            whileHover={{ y: -3, transition: { duration: 0.2 } }}
            style={{ transformStyle: "preserve-3d" }}
          >
            <div className="group relative overflow-hidden rounded-2xl border border-slate-200/80 dark:border-white/[0.07] bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-5 shadow-xl dark:shadow-none">
              <div className="pointer-events-none absolute -top-6 -right-6 w-20 h-20 rounded-full bg-blue-500/10 dark:bg-blue-500/15 blur-xl" />
              <div className="flex items-center justify-between mb-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-blue-100 dark:border-blue-500/20 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 transition-all duration-300 group-hover:bg-gradient-to-br group-hover:from-blue-600 group-hover:to-blue-400 group-hover:text-white group-hover:border-transparent group-hover:shadow-lg group-hover:shadow-blue-500/30">
                  <s.icon className="w-5 h-5" />
                </div>
              </div>
              <p className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">{s.value}</p>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mt-1">{s.label}</p>
              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-blue-600 via-blue-400 to-sky-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-b-2xl" />
            </div>
          </motion.div>
        ))}
      </div>

      <div className="flex flex-col gap-4 sm:flex-row">
        <Link to="/citizen/complaints" className="flex-1">
          <Button variant="outline" className="w-full">
            <FileText className="w-4 h-4 mr-2" />
            View All Complaints
          </Button>
        </Link>
        <Link to="/citizen/new" className="flex-1">
          <Button className="w-full">
            <PlusCircle className="w-4 h-4 mr-2" />
            File New Complaint
          </Button>
        </Link>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 dark:border-white/[0.07] bg-white/80 dark:bg-slate-900/80 backdrop-blur-md shadow-xl dark:shadow-none">
        <div className="pointer-events-none absolute -top-8 -right-8 w-24 h-24 rounded-full bg-blue-500/10 dark:bg-blue-500/15 blur-2xl" />
        <div className="relative flex items-center justify-between px-5 py-4 border-b border-slate-200/80 dark:border-white/[0.07]">
          <h2 className="font-extrabold tracking-tight text-slate-900 dark:text-white">Recent Complaints</h2>
          <div className="flex items-center gap-3">
            {loading && <span className="text-xs text-slate-400 dark:text-slate-500">Loading…</span>}
            <Link to="/citizen/complaints" className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-500 flex items-center gap-1">
              View All <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-white/[0.05]">
          {complaints.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400 dark:text-slate-500">
              <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p>No complaints filed yet.</p>
            </div>
          ) : (
            complaints.slice(0, 3).map((c) => (
              <Link
                key={c.id}
                to={`/citizen/complaints/${c.id}`}
                className="flex items-center justify-between p-4 hover:bg-blue-50/30 dark:hover:bg-blue-500/[0.04] transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-sm text-slate-900 dark:text-white truncate">{c.title}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{c.reference} · {c.category}</p>
                </div>
                <div className="flex items-center gap-3 ml-4">
                  {c.aiUrgencyScore && (
                    <div className="hidden sm:flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
                      <Brain className="w-3.5 h-3.5" />
                      {c.aiUrgencyScore}
                    </div>
                  )}
                  <StatusBadge status={c.status} />
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${slaStatusClass[c.sla.slaStatus] || slaStatusClass.Unavailable}`}>
                    SLA: {c.sla.slaStatus}
                  </span>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>

      <section className="grid gap-5 xl:grid-cols-2">
        {/* Status Overview */}
        <motion.article
          initial={{ opacity: 0, y: 20, rotateY: -4 }}
          animate={{ opacity: 1, y: 0, rotateY: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          whileHover={{ y: -6, scale: 1.01, transition: { duration: 0.25 } }}
          style={{ transformStyle: "preserve-3d" }}
          className="holographic-card relative overflow-hidden rounded-2xl border border-slate-200/80 dark:border-white/[0.07] bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-5 shadow-xl dark:shadow-none md:p-6"
        >
          <div className="pointer-events-none absolute -top-8 -right-8 w-24 h-24 rounded-full bg-blue-500/10 dark:bg-blue-500/15 blur-2xl" />
          <div className="relative flex items-center justify-between mb-5">
            <div>
              <h2 className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-white">Status Overview</h2>
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Current status of your submitted complaints.</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-blue-100 dark:border-blue-500/20 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <FileText className="h-5 w-5" />
            </div>
          </div>

          <div className="space-y-3">
            {complaints.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.02] px-4 py-8 text-center text-sm text-slate-400 dark:text-slate-500">
                No complaint data available yet.
              </div>
            ) : (
              [
                { name: "Active", count: active.length, color: "from-amber-600 to-amber-400" },
                { name: "Resolved", count: resolved.length, color: "from-emerald-600 to-emerald-400" },
              ].map((status, index) => (
                status.count > 0 && (
                  <motion.div
                    key={status.name}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.07 }}
                    className="holographic-card rounded-xl border border-slate-200/80 dark:border-white/[0.06] bg-slate-50/80 dark:bg-white/[0.04] backdrop-blur p-3.5 hover:-translate-y-0.5 transition-transform duration-200"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-slate-900 dark:text-white">{status.name}</p>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{status.count} complaint{status.count !== 1 ? "s" : ""}</p>
                      </div>
                      <span className="rounded-full border border-blue-200 dark:border-blue-500/20 bg-blue-50 dark:bg-blue-500/10 px-2.5 py-1 text-xs font-bold text-blue-700 dark:text-blue-400">
                        {complaints.length > 0 ? Math.round((status.count / complaints.length) * 100) : 0}%
                      </span>
                    </div>
                    <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-white/[0.07]">
                      <motion.div
                        className={`h-full rounded-full bg-gradient-to-r ${status.color}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${complaints.length > 0 ? Math.round((status.count / complaints.length) * 100) : 0}%` }}
                        transition={{ duration: 0.8, ease: "easeOut", delay: 0.3 + index * 0.1 }}
                      />
                    </div>
                  </motion.div>
                )
              ))
            )}
          </div>
        </motion.article>

        {/* Next Steps */}
        <motion.article
          initial={{ opacity: 0, y: 20, rotateY: 4 }}
          animate={{ opacity: 1, y: 0, rotateY: 0 }}
          transition={{ duration: 0.5, delay: 0.08, ease: "easeOut" }}
          whileHover={{ y: -6, scale: 1.01, transition: { duration: 0.25 } }}
          style={{ transformStyle: "preserve-3d" }}
          className="holographic-card relative overflow-hidden rounded-2xl border border-slate-200/80 dark:border-white/[0.07] bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-5 shadow-xl dark:shadow-none md:p-6"
        >
          <div className="pointer-events-none absolute -top-8 -right-8 w-24 h-24 rounded-full bg-sky-500/10 dark:bg-sky-500/15 blur-2xl" />
          <div className="relative flex items-center justify-between mb-5">
            <div>
              <h2 className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-white">Next Steps</h2>
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Recommended actions for complaint management.</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-blue-100 dark:border-blue-500/20 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <TrendingUp className="h-5 w-5" />
            </div>
          </div>

          <div className="space-y-3">
            <motion.div
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="holographic-card rounded-xl border border-slate-200/80 dark:border-white/[0.06] bg-slate-50/80 dark:bg-white/[0.04] backdrop-blur p-4 hover:-translate-y-0.5 transition-transform duration-200"
            >
              <p className="text-xs font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400">Quick Action</p>
              <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">
                {active.length > 0 ? (
                  <>Check the status of your {active.length} active complaint{active.length !== 1 ? "s" : ""} above.</>
                ) : (
                  <>All your complaints have been resolved. Thank you for using our service!</>
                )}
              </p>
              {active.length > 0 && (
                <Link to="/citizen/complaints" className="mt-3 inline-block">
                  <Button size="sm" variant="outline" className="border-slate-200 dark:border-white/[0.08] text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-500/10">
                    View Active <ArrowRight className="w-3.5 h-3.5 ml-2" />
                  </Button>
                </Link>
              )}
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.28 }}
              className="holographic-card rounded-xl border border-slate-200/80 dark:border-white/[0.06] bg-slate-50/80 dark:bg-white/[0.04] backdrop-blur p-4 hover:-translate-y-0.5 transition-transform duration-200"
            >
              <p className="text-xs font-bold uppercase tracking-widest text-sky-600 dark:text-sky-400">Stay Updated</p>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                Enable notifications to get real-time updates on complaint status changes and authority responses.
              </p>
            </motion.div>
          </div>
        </motion.article>
      </section>
    </div>
  );
};

export default CitizenDashboard;
