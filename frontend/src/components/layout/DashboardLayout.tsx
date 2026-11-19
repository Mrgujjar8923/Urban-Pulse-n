import React, { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Bell,
  Brain,
  Building2,
  ClipboardList,
  FileText,
  LayoutDashboard,
  MapPin,
  MessageSquareText,
  PlusCircle,
  Users,
  UserCheck,
  TrendingUp,
} from "lucide-react";
import { motion } from "framer-motion";
import { useAuth, UserRole } from "@/contexts/AuthContext";
import { ThemeToggle } from "@/components/shared/Themetoggle";
import { NotificationDropdown } from "@/components/shared/NotificationDropdown";
import Navbar, { DashboardNavItem } from "@/components/dashboard/Navbar";
import { cn } from "@/lib/utils";
import { departmentDashboardForRole } from "@/lib/departmentAccess";

const NAV_ITEMS: Record<UserRole, DashboardNavItem[]> = {
  citizen: [
    { label: "Dashboard", path: "/citizen", icon: LayoutDashboard },
    { label: "Complaints", path: "/citizen/complaints", icon: FileText },
    { label: "Raise", path: "/citizen/new", icon: PlusCircle },
    { label: "Assistant", path: "/citizen/assistant", icon: MessageSquareText },
  ],
  authority: [
    { label: "Dashboard", path: "/department", icon: LayoutDashboard },
    { label: "Complaints & workload", path: "/department/assigned", icon: ClipboardList },
    { label: "Officer Performance", path: "/department/officer-performance", icon: TrendingUp },
    { label: "Members", path: "/department/members", icon: Users },
    { label: "Feedback", path: "/department/feedback", icon: FileText },
    { label: "Assistant", path: "/department/assistant", icon: MessageSquareText },
    { label: "Notifications", path: "/notifications", icon: Bell },
  ],
  admin: [
    { label: "Overview", path: "/admin", icon: LayoutDashboard },
    { label: "Complaints", path: "/admin/complaints", icon: ClipboardList },
    { label: "Analytics", path: "/admin/analytics", icon: Brain },
    { label: "Departments", path: "/admin/departments", icon: Building2 },
    { label: "Dept Performance", path: "/admin/department-performance", icon: TrendingUp },
    { label: "Heatmap", path: "/admin/heatmap", icon: MapPin },
    { label: "Feedback", path: "/admin/feedback", icon: MessageSquareText },
    { label: "Reports", path: "/admin/reports", icon: FileText },
    { label: "Users", path: "/admin/users", icon: Users },
  ],
};

const OFFICER_NAV_ITEMS: DashboardNavItem[] = [
  { label: "My Dashboard", path: "/department", icon: LayoutDashboard },
  { label: "My Assigned Complaints", path: "/department/my-assigned", icon: ClipboardList },
  { label: "Notifications", path: "/notifications", icon: Bell },
];

export const DashboardLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout, updateProfile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  React.useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  const navItems = useMemo(() => {
    if (!user) return [];
    if (user.role === "authority") {
      const dashboard = departmentDashboardForRole(user.departmentRole);
      if (dashboard === "authority") return NAV_ITEMS.authority;
      if (dashboard === "officer") return OFFICER_NAV_ITEMS;
      return [];
    }
    return NAV_ITEMS[user.role] || [];
  }, [user]);

  if (!user) return null;

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  return (
    <div className="relative min-h-screen bg-white dark:bg-[#020617] text-slate-900 dark:text-white transition-colors duration-300">

      {/* ── Dark-mode grid overlay ── */}
      <div
        className="pointer-events-none fixed inset-0 opacity-0 dark:opacity-100 transition-opacity z-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(59,130,246,0.05) 1px, transparent 1px), linear-gradient(90deg,rgba(59,130,246,0.05) 1px,transparent 1px)",
          backgroundSize: "60px 60px",
          maskImage: "radial-gradient(ellipse 80% 80% at 50% 20%, black, transparent)",
        }}
      />

      {/* ── Radial blue glow blobs ── */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] rounded-full bg-blue-100/50 dark:bg-blue-950/25 blur-3xl" />
        <div className="absolute top-1/3 right-0 w-96 h-96 rounded-full bg-indigo-100/40 dark:bg-blue-900/15 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-80 h-80 rounded-full bg-sky-100/30 dark:bg-sky-950/15 blur-3xl" />
      </div>

      {/* ── Ambient particles (dark only) ── */}
      <div className="pointer-events-none fixed inset-0 hidden dark:block z-0">
        {[
          { x: "8%",  y: "12%", d: 0.5 }, { x: "22%",  y: "34%", d: 1.1 },
          { x: "47%", y: "7%",  d: 0.2 }, { x: "63%",  y: "55%", d: 1.9 },
          { x: "81%", y: "20%", d: 0.8 }, { x: "91%",  y: "70%", d: 2.3 },
          { x: "35%", y: "82%", d: 1.5 }, { x: "74%",  y: "40%", d: 0.4 },
          { x: "15%", y: "60%", d: 2.0 }, { x: "55%",  y: "25%", d: 0.7 },
          { x: "3%",  y: "45%", d: 1.3 }, { x: "88%",  y: "90%", d: 0.9 },
        ].map((p, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 rounded-full bg-blue-400/60"
            style={{ left: p.x, top: p.y }}
            animate={{ opacity: [0.08, 0.55, 0.08], scale: [1, 1.8, 1] }}
            transition={{ duration: 3 + p.d, repeat: Infinity, delay: p.d, ease: "easeInOut" }}
          />
        ))}
      </div>

      {/* ── Navbar (untouched) ── */}
      <Navbar
        navItems={navItems}
        user={user}
        activePath={location.pathname}
        role={user.role}
        onProfileSave={updateProfile}
        onLogout={handleLogout}
        rightActions={
          <>
            <ThemeToggle />
            <NotificationDropdown />
          </>
        }
      />

      <main className="relative z-10 mx-auto w-full max-w-[1600px] px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8 overflow-x-hidden">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className={cn("min-w-0")}
        >
          {children}
        </motion.div>
      </main>
    </div>
  );
};

export default DashboardLayout;
