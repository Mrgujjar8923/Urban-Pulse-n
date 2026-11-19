import React from "react";
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3, PieChart as PieChartIcon } from "lucide-react";
import { motion } from "framer-motion";

interface TrendPoint {
  label: string;
  submitted: number;
  resolved: number;
}

interface StatusPoint {
  name: string;
  value: number;
}

interface ChartsProps {
  trendData: TrendPoint[];
  statusData: StatusPoint[];
  statusColors: Record<string, string>;
}

export const Charts: React.FC<ChartsProps> = ({ trendData, statusData, statusColors }) => {
  const fallbackData = statusData.length ? statusData : [{ name: "No data", value: 1 }];

  return (
    <section className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">

      {/* ── Trend Line Chart ── */}
      <motion.article
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        whileHover={{ y: -4, transition: { duration: 0.25 } }}
        className="relative overflow-hidden rounded-2xl border border-slate-200/80 dark:border-white/[0.07] bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-5 shadow-xl dark:shadow-none md:p-6"
      >
        {/* Glow */}
        <div className="pointer-events-none absolute -top-12 -right-12 w-40 h-40 rounded-full bg-blue-500/10 dark:bg-blue-500/15 blur-3xl" />

        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 dark:border-blue-500/20 bg-blue-50 dark:bg-blue-500/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-blue-700 dark:text-blue-400">
              <BarChart3 className="h-3.5 w-3.5" />
              Complaint Trends
            </div>
            <h2 className="mt-3 text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              Complaint volume over time
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
              Submitted versus resolved complaints across the selected reporting window.
            </p>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 shrink-0">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-blue-600" />
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Submitted</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-sky-400" />
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Resolved</span>
            </div>
          </div>
        </div>

        <div className="mt-6 h-[320px] md:h-[360px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData} margin={{ top: 10, right: 16, left: -12, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="rgba(148,163,184,0.15)" />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "currentColor", fontSize: 12, opacity: 0.6 }}
              />
              <YAxis
                allowDecimals={false}
                axisLine={false}
                tickLine={false}
                tick={{ fill: "currentColor", fontSize: 12, opacity: 0.6 }}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 16,
                  border: "1px solid rgba(59,130,246,0.2)",
                  background: "rgba(15,23,42,0.92)",
                  color: "#f1f5f9",
                  backdropFilter: "blur(12px)",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
                }}
                labelStyle={{ color: "#94a3b8", fontSize: 11, fontWeight: 600, letterSpacing: "0.05em" }}
              />
              <Line
                type="monotone"
                dataKey="submitted"
                stroke="#2563eb"
                strokeWidth={3}
                dot={{ r: 0 }}
                activeDot={{ r: 7, fill: "#2563eb", stroke: "#fff", strokeWidth: 2 }}
                name="Submitted"
              />
              <Line
                type="monotone"
                dataKey="resolved"
                stroke="#38bdf8"
                strokeWidth={3}
                dot={{ r: 0 }}
                activeDot={{ r: 7, fill: "#38bdf8", stroke: "#fff", strokeWidth: 2 }}
                name="Resolved"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </motion.article>

      {/* ── Status Pie Chart ── */}
      <motion.article
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
        whileHover={{ y: -4, transition: { duration: 0.25 } }}
        className="relative overflow-hidden rounded-2xl border border-slate-200/80 dark:border-white/[0.07] bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-5 shadow-xl dark:shadow-none md:p-6"
      >
        {/* Corner glow */}
        <div className="pointer-events-none absolute -bottom-8 -left-8 w-32 h-32 rounded-full bg-sky-500/10 dark:bg-sky-500/15 blur-3xl" />

        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 dark:border-blue-500/20 bg-blue-50 dark:bg-blue-500/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-blue-700 dark:text-blue-400">
            <PieChartIcon className="h-3.5 w-3.5" />
            Status Distribution
          </div>
          <h2 className="mt-3 text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Current complaint status mix
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
            A quick view of pending, active, and resolved complaint share.
          </p>

          <div className="mt-6 h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={fallbackData}
                  dataKey="value"
                  innerRadius={64}
                  outerRadius={96}
                  paddingAngle={3}
                  stroke="transparent"
                >
                  {fallbackData.map((entry) => (
                    <Cell key={entry.name} fill={statusColors[entry.name] || "#94a3b8"} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    borderRadius: 16,
                    border: "1px solid rgba(59,130,246,0.2)",
                    background: "rgba(15,23,42,0.92)",
                    color: "#f1f5f9",
                    backdropFilter: "blur(12px)",
                    boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="grid gap-2.5 mt-4">
            {statusData.map((item) => (
              <div
                key={item.name}
                className="flex items-center justify-between rounded-xl border border-slate-200/80 dark:border-white/[0.06] bg-slate-50/80 dark:bg-white/[0.04] backdrop-blur px-4 py-2.5 hover:border-blue-200 dark:hover:border-blue-500/20 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: statusColors[item.name] }}
                  />
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{item.name}</span>
                </div>
                <span className="text-sm font-bold text-slate-900 dark:text-white">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </motion.article>
    </section>
  );
};

export default Charts;
