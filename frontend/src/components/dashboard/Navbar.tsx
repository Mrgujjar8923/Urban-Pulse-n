import React from "react";
import { Link } from "react-router-dom";
import { Menu } from "lucide-react";
import { User, UserRole } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import ProfilePopup from "@/components/shared/ProfilePopup";
import { cn } from "@/lib/utils";

export interface DashboardNavItem {
  label: string;
  path: string;
  icon?: React.ElementType;
}

interface NavbarProps {
  navItems: DashboardNavItem[];
  user: User;
  activePath: string;
  onNavigate?: () => void;
  onProfileSave: (updates: { name: string; avatar?: string }) => void;
  onLogout: () => void;
  rightActions: React.ReactNode;
  role: UserRole;
}

const isItemActive = (activePath: string, itemPath: string, navItems: DashboardNavItem[]) => {
  if (activePath === itemPath) return true;
  if (itemPath === "/" || !activePath.startsWith(`${itemPath}/`)) return false;

  return !navItems.some((candidate) => {
    if (candidate.path === itemPath) return false;
    return activePath === candidate.path || activePath.startsWith(`${candidate.path}/`);
  });
};

const roleLabel: Record<UserRole, string> = {
  admin: "Admin Panel",
  authority: "Department Panel",
  citizen: "Citizen Portal",
};

const NavbarLinks = ({
  navItems,
  activePath,
  onNavigate,
  stacked = false,
}: {
  navItems: DashboardNavItem[];
  activePath: string;
  onNavigate?: () => void;
  stacked?: boolean;
}) => {
  if (stacked) {
    return (
      <nav className="flex flex-col items-stretch gap-1">
        {navItems.map((item) => {
          const active = isItemActive(activePath, item.path, navItems);
          const Icon = item.icon;

          return (
            <Link
              key={`${item.label}-${item.path}`}
              to={item.path}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium transition-all duration-200",
                active
                  ? "bg-primary text-primary-foreground shadow-[0_6px_16px_rgba(0,0,0,0.08)]"
                  : "text-muted-foreground hover:bg-white hover:text-foreground dark:hover:bg-white/10",
              )}
            >
              {Icon ? <Icon className="h-4 w-4 shrink-0" /> : null}
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav>
      <ul className="dashboard-nav-list">
        {navItems.map((item) => {
          const active = isItemActive(activePath, item.path, navItems);
          const Icon = item.icon;

          return (
            <li key={`${item.label}-${item.path}`} className="dashboard-nav-item" style={{ "--i": "#2563EB", "--j": "#60A5FA" } as React.CSSProperties}>
              <Link
                to={item.path}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn('dashboard-nav-link', active && 'is-active')}
              >
                {Icon ? <Icon className="dashboard-nav-icon" /> : null}
                <span className="dashboard-nav-title">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};

export const Navbar: React.FC<NavbarProps> = ({
  navItems,
  user,
  activePath,
  onNavigate,
  onProfileSave,
  onLogout,
  rightActions,
  role,
}) => {
  const [profileOpen, setProfileOpen] = React.useState(false);

  const initials = user.name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const isLargeNav = role === "admin" || navItems.length > 6;
  const hamburgerBreakpoint = isLargeNav ? "xl:hidden" : "lg:hidden";
  const desktopBreakpoint = isLargeNav ? "hidden xl:flex" : "hidden lg:flex";

  return (
    <header className="sticky top-0 z-30 bg-transparent px-4 pt-5 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[72px] w-full max-w-[1600px] items-center gap-3 overflow-hidden rounded-[999px] border border-white/10 bg-[#101823]/96 px-6 shadow-[0_6px_16px_rgba(0,0,0,0.08)] backdrop-blur-xl transition-shadow duration-300 [background-clip:padding-box] outline-none">
        <div className="flex items-center gap-3">
          <Sheet>
            <SheetTrigger asChild>
              <button
                type="button"
                className={cn("inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-border/70 bg-card text-foreground shadow-sm transition hover:border-primary/30 hover:text-primary", hamburgerBreakpoint)}
              >
                <Menu className="h-5 w-5" />
                <span className="sr-only">Open navigation</span>
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[300px] border-r border-border/60 bg-background/95 p-0">
              <div className="flex h-full flex-col">
                <div className="border-b border-border/60 px-5 py-5">
                  <SheetTitle className="sr-only">Dashboard navigation</SheetTitle>
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl ring-1 ring-border/60">
                      <img src="/govai-mark.svg" alt="GovAI logo" className="h-full w-full object-cover" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">GovAI Resolve</p>
                      <p className="text-xs text-muted-foreground">{roleLabel[role]}</p>
                    </div>
                  </div>
                </div>
                <div className="flex-1 px-3 py-4">
                  <NavbarLinks navItems={navItems} activePath={activePath} onNavigate={onNavigate} stacked />
                </div>
              </div>
            </SheetContent>
          </Sheet>

          <Link to={navItems[0]?.path || "/"} className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl ring-1 ring-border/60">
              <img src="/govai-mark.svg" alt="GovAI logo" className="h-full w-full object-cover" />
            </div>
            <div className="hidden min-w-0 sm:block">
              <p className="truncate text-sm font-semibold text-white">GovAI Resolve</p>
              <p className="truncate text-xs text-slate-300">{roleLabel[role]}</p>
            </div>
          </Link>
        </div>

        <div className={cn("flex-1 justify-center", desktopBreakpoint)}>
          <NavbarLinks navItems={navItems} activePath={activePath} onNavigate={onNavigate} />
        </div>

        <div className="ml-auto flex items-center gap-2">
          {rightActions}

          <button
            type="button"
            onClick={() => setProfileOpen(true)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-blue-950/60 bg-slate-800 shadow-sm transition hover:border-primary/30 dark:border-blue-900/60"
          >
            <Avatar className="h-11 w-11 border border-blue-950/60 dark:border-blue-900/60">
              <AvatarImage src={user.avatar} alt={user.name} />
              <AvatarFallback className="bg-gradient-to-br from-blue-600 to-sky-500 text-sm font-semibold text-white">
                {initials}
              </AvatarFallback>
            </Avatar>
            <span className="sr-only">Open profile settings</span>
          </button>
        </div>
      </div>

      <ProfilePopup
        user={user}
        open={profileOpen}
        onOpenChange={setProfileOpen}
        onSave={onProfileSave}
        onLogout={onLogout}
      />
    </header>
  );
};

export default Navbar;
