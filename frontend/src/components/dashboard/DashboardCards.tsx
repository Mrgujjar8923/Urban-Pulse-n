import React from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface DashboardCardItem {
  label: string;
  value: string | number;
  helper: string;
  delta: string;
  icon: React.ElementType;
}

export const DashboardCards: React.FC<{ items: DashboardCardItem[]; loading?: boolean }> = ({ items, loading }) => {
  return (
    <section className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item, index) => {
        const positive = !item.delta.trim().startsWith("-");
        const Icon = item.icon;

        return (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.06, duration: 0.4, ease: "easeOut" }}
            whileHover={{ y: -3, transition: { duration: 0.2 } }}
            className="group relative"
          >
            {/* ── ALL-SIDED glow: same bounding box as card, blurred → overflows all 4 edges ── */}
            <div
              className={cn(
                "pointer-events-none absolute inset-0 rounded-2xl -z-10",
                /* dark: strong visible blue glow */
                "hidden dark:block",
                "blur-xl opacity-0 group-hover:opacity-40 transition-opacity duration-400",
              )}
              style={{ background: "rgba(37,99,235,0.4)" }}
            />

            {/* light-mode subtle glow (softer, indigo-toned) */}
            <div
              className={cn(
                "pointer-events-none absolute inset-0 rounded-2xl -z-10",
                "dark:hidden",
                "blur-xl opacity-0 group-hover:opacity-30 transition-opacity duration-400",
              )}
              style={{ background: "rgba(99,102,241,0.25)" }}
            />

            {/* ── Card ── */}
            <article
              className={cn(
                "relative overflow-hidden rounded-2xl border p-4 transition-colors duration-200",
                // Dark mode
                "dark:bg-[#0d1b2e] dark:border-white/[0.07] dark:group-hover:border-blue-500/30",
                // Light mode
                "bg-white border-slate-200 group-hover:border-blue-300",
              )}
            >
              {/* Top row: icon + delta */}
              <div className="flex items-center justify-between mb-3">
                <div
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-xl border transition-colors duration-200",
                    "dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-400 dark:group-hover:bg-blue-500/20",
                    "border-blue-200 bg-blue-50 text-blue-600 group-hover:bg-blue-100",
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>

                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
                    positive
                      ? "bg-emerald-500/10 text-emerald-500 dark:text-emerald-400"
                      : "bg-rose-500/10 text-rose-500 dark:text-rose-400",
                  )}
                >
                  {positive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                  {item.delta}
                </span>
              </div>

              {/* Label */}
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">
                {item.label}
              </p>

              {/* Value */}
              <p className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                {loading ? (
                  <span className="inline-block h-7 w-12 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-700" />
                ) : (
                  item.value
                )}
              </p>

              {/* Helper */}
              <p className="mt-1 text-xs text-slate-400 dark:text-slate-500 leading-relaxed">{item.helper}</p>
            </article>
          </motion.div>
        );
      })}
    </section>
  );
};

export default DashboardCards;
