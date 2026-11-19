import React from "react";
import { Link } from "react-router-dom";
import { motion, useScroll, useTransform, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cpu,
  GitBranch,
  Globe2,
  LayoutDashboard,
  Menu,
  Shield,
  Sparkles,
  TrendingUp,
  Wifi,
  X,
  Zap,
} from "lucide-react";
import { ThemeToggle } from "@/components/shared/Themetoggle";
import { useTheme } from "@/contexts/ThemeContext";

/* ─── smooth float animation ─── */
const float = (delay = 0, amplitude = 10) => ({
  animate: {
    y: [0, -amplitude, 0],
    transition: {
      duration: 4 + delay * 0.4,
      repeat: Infinity,
      ease: "easeInOut" as const,
      delay,
    },
  },
});

/* ─── scroll reveal ─── */
const reveal = {
  hidden: { opacity: 0, y: 28 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: "easeOut" as const },
  },
};

/* ─── stagger container ─── */
const stagger = {
  show: { transition: { staggerChildren: 0.1 } },
};

/* ─── data ─── */
const navItems = [
  { label: "Platform", href: "#platform" },
  { label: "Features", href: "#features" },
  { label: "Workflow", href: "#workflow" },
  { label: "FAQ", href: "#faq" },
];

const features = [
  {
    icon: Cpu,
    title: "AI Triage Engine",
    body: "Auto-classifies and routes complaints to the right department with 91 % first-pass accuracy.",
  },
  {
    icon: GitBranch,
    title: "Intelligent Routing",
    body: "Multi-department coordination with private internal threads — residents only see what matters.",
  },
  {
    icon: TrendingUp,
    title: "Real-time Analytics",
    body: "Live dashboards for admins: SLA health, backlog trends, and ward-level resolution data.",
  },
  {
    icon: Shield,
    title: "Audit Trail",
    body: "Every action is logged. Immutable timelines from intake to resolution.",
  },
  {
    icon: Globe2,
    title: "Multi-ward Coverage",
    body: "Scales from a single ward to a full city network without configuration overhead.",
  },
  {
    icon: Wifi,
    title: "Live Status Feeds",
    body: "Citizens get push updates at every stage — no more chasing offices for status.",
  },
];

const stats = [
  { value: "23k+", label: "Complaint journeys tracked" },
  { value: "91 %", label: "Routing accuracy, first pass" },
  { value: "2.4×", label: "Faster department response" },
  { value: "$14B", label: "Municipal budgets supported" },
];

const workflow = [
  {
    step: "01",
    title: "Citizens raise issues",
    body: "Photo, location, and category capture — a 30-second mobile submission with live status tracking.",
    accent: true,
  },
  {
    step: "02",
    title: "AI routes instantly",
    body: "Triage engine classifies, prioritises, and assigns complaints in under 2 seconds — no dispatcher needed.",
    accent: false,
  },
  {
    step: "03",
    title: "Departments resolve",
    body: "Officers see a clean action queue. Internal notes stay private; updates flow automatically to citizens.",
    accent: false,
  },
  {
    step: "Impact",
    title: "Measurable outcomes",
    body: "Data-backed performance for every ward, every department — updated in real time.",
    accent: true,
  },
];

const faqs = [
  {
    q: "How does the platform route complaints?",
    a: "The AI engine tags category, location, urgency, and past patterns — auto-assigning the most likely department instantly.",
  },
  {
    q: "What do residents see after submitting?",
    a: "A live status trail with timestamps, assigned team, and follow-up notes so they always know what's happening.",
  },
  {
    q: "Can departments coordinate privately?",
    a: "Yes — internal threads stay hidden while resident-safe updates are published to the public timeline.",
  },
  {
    q: "Is this only for large city administrations?",
    a: "No. It works equally well for small wards, town councils, and district offices with minimal setup.",
  },
];

const footerLinks = [
  { title: "Platform", links: ["Complaint intake", "AI routing", "Analytics", "Feedback"] },
  { title: "Roles", links: ["Citizens", "Departments", "Admins", "Operators"] },
  { title: "Company", links: ["About", "Roadmap", "Security", "Support"] },
];

/* ═══════════════════════════════════════════════
   MOUSE PARALLAX HOOK
═══════════════════════════════════════════════ */
function useMouseParallax(strength = 1) {
  const [pos, setPos] = React.useState({ x: 0, y: 0 });
  React.useEffect(() => {
    const h = (e: MouseEvent) => {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      setPos({ x: ((e.clientX - cx) / cx) * strength, y: ((e.clientY - cy) / cy) * strength });
    };
    window.addEventListener("mousemove", h);
    return () => window.removeEventListener("mousemove", h);
  }, [strength]);
  return pos;
}

/* ═══════════════════════════════════════════════
   PARTICLE
═══════════════════════════════════════════════ */
const Particle: React.FC<{ x: string; y: string; delay: number }> = ({ x, y, delay }) => (
  <motion.div
    className="absolute w-1 h-1 rounded-full bg-blue-400 dark:bg-blue-500 pointer-events-none"
    style={{ left: x, top: y }}
    animate={{ opacity: [0.08, 0.6, 0.08], scale: [1, 1.8, 1] }}
    transition={{ duration: 3 + delay, repeat: Infinity, delay, ease: "easeInOut" }}
  />
);

/* ═══════════════════════════════════════════════
   FLOATING CARD WRAPPER (3D tilt + float)
═══════════════════════════════════════════════ */
interface FloatProps {
  children: React.ReactNode;
  delay?: number;
  amplitude?: number;
  mx: number; /* mouse x -1..1 */
  my: number; /* mouse y -1..1 */
  factor?: number; /* parallax factor */
  className?: string;
}
const FloatCard: React.FC<FloatProps> = ({
  children, delay = 0, amplitude = 10,
  mx, my, factor = 1, className = "",
}) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{
      opacity: 1,
      y: [0, -amplitude, 0],
      rotateX: my * 5 * factor,
      rotateY: mx * -5 * factor,
      x: mx * 8 * factor,
    }}
    transition={{
      opacity: { duration: 0.7, delay },
      y: { duration: 4 + delay * 0.5, repeat: Infinity, ease: "easeInOut", delay },
      rotateX: { duration: 0.5 },
      rotateY: { duration: 0.5 },
      x: { duration: 0.5 },
    }}
    whileHover={{ scale: 1.04, rotateX: 0, rotateY: 0, transition: { duration: 0.25 } }}
    style={{ transformStyle: "preserve-3d", willChange: "transform" }}
    className={className}
  >
    {children}
  </motion.div>
);

/* ═══════════════════════════════════════════════
   SECTION REVEAL
═══════════════════════════════════════════════ */
const Reveal: React.FC<{ children: React.ReactNode; delay?: number; className?: string }> = ({
  children, delay = 0, className = "",
}) => (
  <motion.div
    variants={{ ...reveal, show: { ...reveal.show, transition: { ...reveal.show.transition, delay } } }}
    initial="hidden"
    whileInView="show"
    viewport={{ once: true, amount: 0.18 }}
    className={className}
  >
    {children}
  </motion.div>
);

/* ═══════════════════════════════════════════════
   MAIN
═══════════════════════════════════════════════ */
const Landing: React.FC = () => {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [openFaq, setOpenFaq] = React.useState<number | null>(null);
  const { theme } = useTheme();
  const mouse = useMouseParallax(0.6);
  const { scrollY } = useScroll();
  const heroParallax = useTransform(scrollY, [0, 500], [0, -60]);
  const isDark = theme === "dark";

  const particles = React.useMemo(
    () =>
      Array.from({ length: 24 }, (_, i) => ({
        id: i,
        x: `${(i * 4.3) % 100}%`,
        y: `${(i * 7.7) % 100}%`,
        delay: (i * 0.37) % 4,
      })),
    []
  );

  return (
    <div className="min-h-screen bg-white dark:bg-[#020617] text-slate-900 dark:text-white transition-colors duration-300">

      {/* ══════════════════ NAVBAR ══════════════════ */}
      <header className="fixed inset-x-0 top-0 z-50 px-4 pt-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="flex items-center justify-between rounded-2xl border border-slate-200/80 dark:border-white/[0.06] bg-white/80 dark:bg-slate-900/80 px-5 py-3 shadow-sm dark:shadow-none backdrop-blur-xl">
            {/* Brand */}
            <Link to="/" className="flex items-center gap-2.5 shrink-0">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-blue-500 shadow-lg shadow-blue-500/25">
                <Shield className="h-4.5 w-4.5 text-white" size={18} />
              </div>
              <div className="leading-none">
                <p className="text-[0.72rem] font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400">GovAI</p>
                <p className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-white leading-none">Resolve</p>
              </div>
            </Link>

            {/* Desktop nav */}
            <nav className="hidden lg:flex items-center gap-8">
              {navItems.map(item => (
                <a
                  key={item.label}
                  href={item.href}
                  className="text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  {item.label}
                </a>
              ))}
            </nav>

            {/* Desktop CTA */}
            <div className="hidden lg:flex items-center gap-3">
              <ThemeToggle />
              <Link
                to="/login"
                className="text-sm font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white px-4 py-2 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white/50 dark:bg-white/[0.04] hover:bg-slate-50 dark:hover:bg-white/[0.08] transition-all"
              >
                Sign in
              </Link>
              <Link
                to="/signup"
                className="flex items-center gap-1.5 text-sm font-semibold text-white px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-600/30 hover:shadow-blue-500/40 transition-all hover:-translate-y-px"
              >
                Get started <ArrowRight size={14} />
              </Link>
            </div>

            {/* Mobile toggle */}
            <div className="flex items-center gap-2 lg:hidden">
              <ThemeToggle />
              <button
                className="flex items-center justify-center h-9 w-9 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white/50 dark:bg-white/[0.04] text-slate-500 dark:text-slate-400"
                onClick={() => setMenuOpen(o => !o)}
              >
                {menuOpen ? <X size={18} /> : <Menu size={18} />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="mx-auto mt-2 max-w-7xl overflow-hidden rounded-2xl border border-slate-200/80 dark:border-white/[0.06] bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl p-4 shadow-xl"
            >
              <div className="flex flex-col gap-1">
                {navItems.map(item => (
                  <a
                    key={item.label}
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    className="px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06] hover:text-slate-900 dark:hover:text-white transition-all"
                  >
                    {item.label}
                  </a>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-slate-200 dark:border-white/[0.06] flex gap-2">
                <Link to="/login" onClick={() => setMenuOpen(false)} className="flex-1 text-center text-sm font-semibold py-2.5 rounded-xl border border-slate-200 dark:border-white/[0.08] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-all">
                  Sign in
                </Link>
                <Link to="/signup" onClick={() => setMenuOpen(false)} className="flex-1 text-center text-sm font-semibold py-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-500 transition-all shadow-lg shadow-blue-600/25">
                  Get started
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* ══════════════════ HERO ══════════════════ */}
      <section className="relative min-h-screen flex items-center overflow-hidden pt-24 pb-16">
        {/* BG gradients */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-blue-50/40 to-white dark:from-[#020617] dark:via-[#0B1220] dark:to-[#0F172A] transition-colors duration-500" />
        <div className="absolute inset-0 pointer-events-none">
          {/* Light mode: soft radial */}
          <div className="absolute top-0 left-1/4 w-96 h-96 rounded-full bg-blue-100/60 dark:bg-blue-950/30 blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-80 h-80 rounded-full bg-indigo-100/40 dark:bg-blue-900/20 blur-3xl" />
        </div>

        {/* Grid lines — dark only */}
        <div
          className="absolute inset-0 pointer-events-none opacity-0 dark:opacity-100 transition-opacity"
          style={{
            backgroundImage: "linear-gradient(rgba(59,130,246,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.05) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
            maskImage: "radial-gradient(ellipse 80% 80% at 50% 50%, black, transparent)",
          }}
        />

        {/* Particles — dark only */}
        <div className="absolute inset-0 pointer-events-none hidden dark:block">
          {particles.map(p => <Particle key={p.id} x={p.x} y={p.y} delay={p.delay} />)}
        </div>

        {/* Hero content */}
        <div className="relative z-10 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">

            {/* LEFT — copy */}
            <motion.div
              style={{ y: heroParallax }}
              initial={{ opacity: 0, x: -32 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            >
              {/* Badge */}
              <div className="mb-6 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-blue-200 dark:border-blue-500/20 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 text-xs font-bold uppercase tracking-widest">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                AI-Powered · Civic Platform · v2.0
              </div>

              <h1 className="text-5xl lg:text-6xl xl:text-7xl font-black tracking-tight leading-[1.03] mb-5 text-slate-900 dark:text-white">
                Smarter{" "}
                <span className="bg-gradient-to-r from-blue-600 to-blue-400 bg-clip-text text-transparent">
                  Civic
                </span>
                <br />
                Operations.
              </h1>

              <p className="text-lg text-slate-500 dark:text-slate-400 leading-relaxed max-w-lg mb-8">
                AI-powered complaint resolution with intelligent routing and
                real-time tracking — built for modern governance.
              </p>

              <div className="flex flex-wrap gap-3 mb-8">
                <Link
                  to="/signup"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-600/30 hover:shadow-blue-500/40 transition-all hover:-translate-y-0.5 active:scale-95"
                >
                  <Zap size={16} /> Launch Platform
                </Link>
                <Link
                  to="/login"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/[0.1] bg-white/60 dark:bg-white/[0.05] hover:bg-white dark:hover:bg-white/[0.1] backdrop-blur transition-all hover:-translate-y-0.5"
                >
                  <LayoutDashboard size={16} /> Explore Dashboard
                </Link>
              </div>

              <div className="flex flex-wrap gap-5">
                {["Citizen-first tracking", "Dept-aware routing", "GDPR-compliant"].map(t => (
                  <div key={t} className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
                    <BadgeCheck size={15} className="text-emerald-500" /> {t}
                  </div>
                ))}
              </div>
            </motion.div>

            {/* RIGHT — 3D Floating Cards Grid */}
            <div
              className="hidden lg:flex flex-col gap-4"
              style={{ perspective: "1000px" }}
            >

              {/* Card A — main analytics */}
              <FloatCard delay={0} amplitude={8} mx={mouse.x} my={mouse.y} factor={1}>
                <div className="rounded-2xl border border-slate-200/80 dark:border-white/[0.07] bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-4 shadow-xl dark:shadow-none">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Complaint Overview</p>
                    <span className="flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 px-2 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live
                    </span>
                  </div>
                  {/* bar chart */}
                  <div className="flex items-end gap-1.5 h-14 mb-3">
                    {[40, 65, 50, 80, 95, 62, 78].map((h, i) => (
                      <div
                        key={i}
                        className="flex-1 rounded-t bg-gradient-to-t from-blue-600 to-blue-400 opacity-80"
                        style={{ height: `${h}%` }}
                      />
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-slate-50 dark:bg-white/[0.04] rounded-xl p-2.5">
                      <p className="text-lg font-extrabold text-slate-900 dark:text-white leading-none">2,840</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Active cases</p>
                    </div>
                    <div className="bg-slate-50 dark:bg-white/[0.04] rounded-xl p-2.5">
                      <p className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400 leading-none">91 %</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Routed correctly</p>
                    </div>
                  </div>
                </div>
              </FloatCard>

              {/* Bottom row — 3 cards side by side */}
              <div className="grid grid-cols-3 gap-3">
                {/* Card B — AI insight */}
                <FloatCard delay={0.4} amplitude={12} mx={mouse.x} my={mouse.y} factor={0.7} className="h-full">
                  <div className="rounded-2xl border border-slate-200/80 dark:border-white/[0.07] bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-3.5 shadow-xl dark:shadow-none h-full">
                    <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-blue-600 mb-2.5 shadow-lg shadow-violet-500/25">
                      <Sparkles size={16} className="text-white" />
                    </div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white mb-1">AI Triage</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 leading-snug">Routes by category, urgency & location in &lt;2s</p>
                    <div className="mt-2.5 flex items-center justify-between bg-blue-50 dark:bg-blue-500/10 rounded-lg px-2 py-1.5">
                      <span className="text-sm font-extrabold text-blue-600 dark:text-blue-400">94.2 %</span>
                      <TrendingUp size={13} className="text-blue-500" />
                    </div>
                  </div>
                </FloatCard>

                {/* Card C — complaint list */}
                <FloatCard delay={0.2} amplitude={10} mx={mouse.x} my={mouse.y} factor={0.9}>
                  <div className="rounded-2xl border border-slate-200/80 dark:border-white/[0.07] bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-3.5 shadow-xl dark:shadow-none">
                    {[
                      { title: "Pothole — MG Rd", st: "In Progress", color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-500/10" },
                      { title: "Water supply", st: "Resolved", color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-500/10" },
                      { title: "Street light", st: "Pending", color: "text-slate-500 dark:text-slate-400", bg: "bg-slate-100 dark:bg-white/[0.05]" },
                    ].map((item, i) => (
                      <div key={i} className={`flex items-center justify-between gap-2 py-1.5 ${i < 2 ? "border-b border-slate-100 dark:border-white/[0.05]" : ""}`}>
                        <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">{item.title}</p>
                        <span className={`text-[0.6rem] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap ${item.color} ${item.bg}`}>{item.st}</span>
                      </div>
                    ))}
                  </div>
                </FloatCard>

                {/* Card D — dept score ring */}
                <FloatCard delay={0.6} amplitude={9} mx={mouse.x} my={mouse.y} factor={1.1}>
                  <div className="rounded-2xl border border-slate-200/80 dark:border-white/[0.07] bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-3.5 shadow-xl dark:shadow-none">
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">Dept. Score</p>
                    <div className="flex items-center justify-center my-2">
                      <div
                        className="w-14 h-14 rounded-full flex items-center justify-center"
                        style={{
                          background: `conic-gradient(#3B82F6 82%, ${isDark ? "rgba(255,255,255,0.06)" : "#e2e8f0"} 82%)`,
                        }}
                      >
                        <div className="w-10 h-10 rounded-full bg-white dark:bg-slate-900 flex items-center justify-center">
                          <span className="text-xs font-extrabold text-blue-600 dark:text-blue-400">82 %</span>
                        </div>
                      </div>
                    </div>
                    {[{ l: "Roads", v: "78 %" }, { l: "Water", v: "91 %" }].map(r => (
                      <div key={r.l} className="flex justify-between text-xs mt-1">
                        <span className="text-slate-400 dark:text-slate-500">{r.l}</span>
                        <span className="font-bold text-blue-600 dark:text-blue-400">{r.v}</span>
                      </div>
                    ))}
                  </div>
                </FloatCard>
              </div>
            </div>
          </div>
        </div>

        {/* Scroll cue */}
        <motion.a
          href="#platform"
          className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 text-slate-400 dark:text-slate-600 z-10"
          animate={{ y: [0, 6, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          <span className="text-[0.6rem] uppercase tracking-widest">Scroll</span>
          <ChevronDown size={14} />
        </motion.a>
      </section>

      {/* ══════════════════ STATS STRIP ══════════════════ */}
      <div className="border-y border-slate-200 dark:border-white/[0.06] bg-slate-50/80 dark:bg-white/[0.02]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {stats.map((s, i) => (
              <Reveal key={s.label} delay={i * 0.08} className="text-center">
                <p className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">{s.value}</p>
                <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">{s.label}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </div>

      {/* ══════════════════ FEATURES ══════════════════ */}
      <section id="features" className="py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal className="text-center mb-14">
            <p className="text-xs font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400 mb-3">Platform Capabilities</p>
            <h2 className="text-4xl lg:text-5xl font-black tracking-tight text-slate-900 dark:text-white mb-4">
              Built for real governance
            </h2>
            <p className="text-lg text-slate-500 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed">
              Every feature is designed around actual civic workflows — from street-level intake to city-wide analytics.
            </p>
          </Reveal>

          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.15 }}
            className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5"
            id="platform"
          >
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                variants={reveal}
                custom={i}
                className="group p-6 rounded-2xl border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-slate-900/60 hover:border-blue-200 dark:hover:border-blue-500/30 hover:bg-blue-50/40 dark:hover:bg-blue-500/[0.05] transition-all duration-300 hover:-translate-y-1 hover:shadow-lg dark:hover:shadow-none cursor-default"
              >
                <div className="flex items-center justify-center w-11 h-11 rounded-xl border border-blue-100 dark:border-blue-500/20 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 mb-4 group-hover:scale-110 transition-transform">
                  <f.icon size={20} />
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">{f.title}</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{f.body}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ══════════════════ WORKFLOW ══════════════════ */}
      <section id="workflow" className="py-20 bg-slate-50 dark:bg-white/[0.015] border-y border-slate-200 dark:border-white/[0.04]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal className="mb-14">
            <p className="text-xs font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400 mb-3">How It Works</p>
            <h2 className="text-4xl lg:text-5xl font-black tracking-tight text-slate-900 dark:text-white mb-4">
              From intake to resolution
            </h2>
            <p className="text-lg text-slate-500 dark:text-slate-400 max-w-xl leading-relaxed">
              A seamless flow that removes friction for citizens and bottlenecks for departments.
            </p>
          </Reveal>

          <div className="grid sm:grid-cols-2 gap-5">
            {workflow.map((card, i) => (
              <Reveal key={card.title} delay={i * 0.08}>
                <div
                  className={`rounded-2xl p-7 h-full min-h-[200px] flex flex-col justify-between
                    ${card.accent
                      ? "bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-xl shadow-blue-600/20"
                      : "bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/[0.07] text-slate-900 dark:text-white"
                    }`}
                >
                  <div>
                    <p className={`text-xs font-bold uppercase tracking-widest mb-3 ${card.accent ? "text-blue-200" : "text-blue-600 dark:text-blue-400"}`}>
                      Step {card.step}
                    </p>
                    <h3 className="text-xl font-extrabold tracking-tight mb-2">{card.title}</h3>
                    <p className={`text-sm leading-relaxed ${card.accent ? "text-blue-100" : "text-slate-500 dark:text-slate-400"}`}>
                      {card.body}
                    </p>
                  </div>
                  {card.step === "Impact" && (
                    <div className="grid grid-cols-2 gap-3 mt-5">
                      {[{ v: "18 %", l: "Backlog down" }, { v: "2.4×", l: "Faster response" }].map(item => (
                        <div key={item.l} className="bg-white/10 rounded-xl p-3">
                          <p className="text-xl font-black">{item.v}</p>
                          <p className="text-xs text-blue-200 mt-0.5">{item.l}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════ CTA BAND ══════════════════ */}
      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-700 px-8 py-14 lg:px-14 text-center shadow-2xl shadow-blue-700/30">
              {/* bg decorations */}
              <div className="absolute top-0 left-0 w-72 h-72 rounded-full bg-white/5 blur-3xl -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
              <div className="absolute bottom-0 right-0 w-72 h-72 rounded-full bg-indigo-500/20 blur-3xl translate-x-1/2 translate-y-1/2 pointer-events-none" />

              <div className="relative z-10">
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 border border-white/20 text-white/80 text-xs font-bold uppercase tracking-widest mb-6">
                  <Sparkles size={12} /> Ready to modernise governance
                </div>
                <h2 className="text-4xl lg:text-5xl font-black tracking-tight text-white mb-4">
                  Change the way your city resolves issues
                </h2>
                <p className="text-blue-100 text-lg max-w-2xl mx-auto mb-8 leading-relaxed">
                  Join hundreds of civic bodies using GovAI Resolve to cut response times and build public trust.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3 mb-8">
                  <Link
                    to="/signup"
                    className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl font-bold text-blue-700 bg-white hover:bg-blue-50 shadow-lg transition-all hover:-translate-y-0.5"
                  >
                    <Zap size={16} /> Get started free
                  </Link>
                  <Link
                    to="/login"
                    className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl font-semibold text-white border border-white/25 bg-white/10 hover:bg-white/20 backdrop-blur transition-all hover:-translate-y-0.5"
                  >
                    <Building2 size={16} /> View department portal
                  </Link>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-6">
                  {["No credit card required", "Setup in 10 minutes", "Free for municipalities"].map(t => (
                    <div key={t} className="flex items-center gap-1.5 text-sm text-blue-100">
                      <CheckCircle2 size={14} className="text-emerald-300" /> {t}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ══════════════════ FAQ ══════════════════ */}
      <section id="faq" className="py-20 bg-slate-50 dark:bg-white/[0.015] border-t border-slate-200 dark:border-white/[0.04]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-[1fr_1.5fr] gap-12 lg:gap-20 items-start">
            <Reveal>
              <p className="text-xs font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400 mb-3">Support</p>
              <h2 className="text-4xl font-black tracking-tight text-slate-900 dark:text-white mb-4">
                Frequently asked questions
              </h2>
              <p className="text-slate-500 dark:text-slate-400 leading-relaxed mb-7">
                Quick answers to what civic teams ask most before adopting the platform.
              </p>
              <Link
                to="/signup"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-600/25 transition-all hover:-translate-y-0.5"
              >
                Start free <ArrowRight size={14} />
              </Link>
            </Reveal>

            <Reveal delay={0.1}>
              <div className="flex flex-col gap-2">
                {faqs.map((faq, i) => (
                  <div
                    key={i}
                    className={`rounded-2xl border overflow-hidden transition-all ${
                      openFaq === i
                        ? "border-blue-200 dark:border-blue-500/30 bg-blue-50/50 dark:bg-blue-500/[0.07]"
                        : "border-slate-200 dark:border-white/[0.07] bg-white dark:bg-slate-900/60"
                    }`}
                  >
                    <button
                      className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left"
                      onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    >
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">{faq.q}</span>
                      {openFaq === i
                        ? <ChevronUp size={16} className="text-blue-500 shrink-0" />
                        : <ChevronDown size={16} className="text-slate-400 shrink-0" />
                      }
                    </button>
                    <AnimatePresence>
                      {openFaq === i && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.22 }}
                        >
                          <p className="px-5 pb-4 text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{faq.a}</p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ══════════════════ FOOTER ══════════════════ */}
      <footer className="border-t border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#020617]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr] gap-10 mb-10">
            <div>
              <div className="flex items-center gap-2.5 mb-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-blue-500 shadow">
                  <Shield size={15} className="text-white" />
                </div>
                <p className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-white">GovAI Resolve</p>
              </div>
              <p className="text-sm text-slate-400 dark:text-slate-500 leading-relaxed max-w-xs">
                AI-powered complaint resolution for transparent, efficient public service delivery.
              </p>
            </div>
            {footerLinks.map(col => (
              <div key={col.title}>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-4">{col.title}</p>
                <ul className="space-y-2.5">
                  {col.links.map(l => (
                    <li key={l} className="text-sm text-slate-500 dark:text-slate-500 hover:text-slate-900 dark:hover:text-slate-300 cursor-pointer transition-colors">{l}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="pt-6 border-t border-slate-200 dark:border-white/[0.05] flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-xs text-slate-400 dark:text-slate-600">© 2026 GovAI Resolve. Built for transparent public-service operations.</p>
            <div className="flex gap-5 text-xs text-slate-400 dark:text-slate-600">
              {["Privacy", "Terms", "Security"].map(l => (
                <span key={l} className="hover:text-slate-700 dark:hover:text-slate-400 cursor-pointer transition-colors">{l}</span>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
