import React from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Shield,
  Sparkles,
  User,
  Users,
  ChevronRight,
  Wifi,
  Activity,
  KeyRound,
} from "lucide-react";
import { useAuth, type UserRole } from "@/contexts/AuthContext";
import { getDemoPassword, type DemoCredentialKey } from "@/config/demoLoginCredentials";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { DEPARTMENTS } from "@/config/departments";
import { authApi, type OfficerOption } from "@/services/authApi";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/* ─────────────────────────────────────────
   Types
───────────────────────────────────────────*/
type AuthMode = "login" | "signup";
type Role = "citizen" | "authority";
type LoginRole = Role | "officer" | "admin";
interface AuthPageProps { initialMode: AuthMode; }

const DEPARTMENT_AUTHORITY_EMAILS: Record<string, string> = {
  "Road & Infrastructure": "authority@demo.com",
  "Water Supply": "water@demo.com",
  Electricity: "electricity@demo.com",
  Environment: "environment@demo.com",
};

const DEPARTMENT_OFFICER_EMAILS: Record<string, string> = {
  "Road & Infrastructure": "road.demo@govai.gov",
  "Water Supply": "water.demo@govai.gov",
  Electricity: "electricity.demo@govai.gov",
  Environment: "environment.demo@govai.gov",
};

type DemoAccountId = "citizen" | "admin" | "roadAuthority" | "waterAuthority" | "electricityAuthority" | "environmentAuthority" | "roadOfficer" | "waterOfficer" | "electricityOfficer" | "environmentOfficer";
interface DemoAccount {
  id: DemoAccountId;
  label: string;
  email: string;
  role: LoginRole;
  clientRole: UserRole;
  department?: string;
  departmentRole?: "authority" | "officer";
  credentialKey?: DemoCredentialKey;
}

const DEMO_ACCOUNTS: Record<DemoAccountId, DemoAccount> = {
  citizen: { id: "citizen", label: "Citizen Demo", email: "citizen.demo@govai.gov", role: "citizen", clientRole: "citizen", credentialKey: "citizen" },
  admin: { id: "admin", label: "Admin Demo Access", email: "admin@govai.gov", role: "admin", clientRole: "admin", credentialKey: "admin" },
  roadAuthority: { id: "roadAuthority", label: "Road & Infrastructure Authority", email: DEPARTMENT_AUTHORITY_EMAILS["Road & Infrastructure"], role: "authority", clientRole: "authority", department: "Road & Infrastructure", departmentRole: "authority", credentialKey: "roadAuthority" },
  waterAuthority: { id: "waterAuthority", label: "Water Supply Authority", email: DEPARTMENT_AUTHORITY_EMAILS["Water Supply"], role: "authority", clientRole: "authority", department: "Water Supply", departmentRole: "authority", credentialKey: "waterAuthority" },
  electricityAuthority: { id: "electricityAuthority", label: "Electricity Authority", email: DEPARTMENT_AUTHORITY_EMAILS.Electricity, role: "authority", clientRole: "authority", department: "Electricity", departmentRole: "authority", credentialKey: "electricityAuthority" },
  environmentAuthority: { id: "environmentAuthority", label: "Environment Authority", email: DEPARTMENT_AUTHORITY_EMAILS.Environment, role: "authority", clientRole: "authority", department: "Environment", departmentRole: "authority", credentialKey: "environmentAuthority" },
  roadOfficer: { id: "roadOfficer", label: "Road Officer", email: DEPARTMENT_OFFICER_EMAILS["Road & Infrastructure"], role: "officer", clientRole: "authority", department: "Road & Infrastructure", departmentRole: "officer", credentialKey: "roadOfficer" },
  waterOfficer: { id: "waterOfficer", label: "Water Officer", email: DEPARTMENT_OFFICER_EMAILS["Water Supply"], role: "officer", clientRole: "authority", department: "Water Supply", departmentRole: "officer", credentialKey: "waterOfficer" },
  electricityOfficer: { id: "electricityOfficer", label: "Electricity Officer", email: DEPARTMENT_OFFICER_EMAILS.Electricity, role: "officer", clientRole: "authority", department: "Electricity", departmentRole: "officer", credentialKey: "electricityOfficer" },
  environmentOfficer: { id: "environmentOfficer", label: "Environment Officer", email: DEPARTMENT_OFFICER_EMAILS.Environment, role: "officer", clientRole: "authority", department: "Environment", departmentRole: "officer", credentialKey: "environmentOfficer" },
};

const AUTHORITY_DEMO_IDS: Record<string, DemoAccountId> = {
  "Road & Infrastructure": "roadAuthority",
  "Water Supply": "waterAuthority",
  Electricity: "electricityAuthority",
  Environment: "environmentAuthority",
};
const OFFICER_DEMO_IDS: Record<string, DemoAccountId> = {
  "Road & Infrastructure": "roadOfficer",
  "Water Supply": "waterOfficer",
  Electricity: "electricityOfficer",
  Environment: "environmentOfficer",
};

const DEMO_OFFICER_MAP: Record<string, { demoKey: DemoAccountId; ariaLabel: string }> = {
  "Road & Infrastructure": { demoKey: "roadOfficer", ariaLabel: "Road Officer" },
  "Water Supply": { demoKey: "waterOfficer", ariaLabel: "Water Officer" },
  Electricity: { demoKey: "electricityOfficer", ariaLabel: "Electricity Officer" },
  Environment: { demoKey: "environmentOfficer", ariaLabel: "Environment Officer" },
};

const routeForRole = (role: UserRole) => {
  if (role === "authority") return "/department";
  if (role === "admin") return "/admin";
  return `/${role}`;
};

/* ─────────────────────────────────────────
   Animated neon grid (reactive)
───────────────────────────────────────────*/
interface NeonGridProps {
  activity: number;   // 0–100 : typing activity level
  status: "idle" | "typing" | "complete" | "success";
}
const NeonGrid: React.FC<NeonGridProps> = ({ activity, status }) => {
  const COLS = 10; const ROWS = 5;
  const dots = Array.from({ length: COLS * ROWS }, (_, i) => i);

  const glowColor =
    status === "success" ? "#22C55E"
      : status === "complete" ? "#60A5FA"
        : status === "typing" ? "#3B82F6"
          : "rgba(59,130,246,0.3)";

  const scanLine = status !== "idle";

  return (
    <div style={{
      position: "relative", borderRadius: 16,
      border: `1px solid ${status === "success" ? "rgba(34,197,94,0.3)" : "rgba(59,130,246,0.18)"}`,
      background: "rgba(2,6,23,0.65)",
      backdropFilter: "blur(8px)",
      overflow: "hidden",
      transition: "border-color 0.4s",
    }}>
      {/* Grid lines */}
      <svg width="100%" height="100" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        {Array.from({ length: ROWS + 1 }, (_, r) => (
          <line key={`h${r}`} x1="0" y1={`${(r / ROWS) * 100}%`} x2="100%" y2={`${(r / ROWS) * 100}%`}
            stroke="rgba(59,130,246,0.07)" strokeWidth="1" />
        ))}
        {Array.from({ length: COLS + 1 }, (_, c) => (
          <line key={`v${c}`} x1={`${(c / COLS) * 100}%`} y1="0" x2={`${(c / COLS) * 100}%`} y2="100%"
            stroke="rgba(59,130,246,0.07)" strokeWidth="1" />
        ))}
      </svg>

      {/* Scanning line when typing */}
      {scanLine && (
        <motion.div
          style={{
            position: "absolute", top: 0, bottom: 0, width: 2,
            background: `linear-gradient(to bottom, transparent, ${glowColor}, transparent)`,
            opacity: 0.6,
          }}
          animate={{ left: ["0%", "100%"] }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        />
      )}

      {/* Dots grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: `repeat(${COLS}, 1fr)`,
        gridTemplateRows: `repeat(${ROWS}, 1fr)`,
        height: 100, padding: "6px 10px",
        position: "relative", alignItems: "center", justifyItems: "center",
      }}>
        {dots.map((i) => {
          const bright = ((i * 3 + 7) % 5) === 0;
          const activityBright = activity > 0 && (i % Math.max(1, Math.round(10 - activity / 15))) === 0;
          return (
            <motion.span key={i} style={{
              width: activityBright ? 5 : bright ? 4 : 2.5,
              height: activityBright ? 5 : bright ? 4 : 2.5,
              borderRadius: "50%", display: "block",
              background: activityBright ? glowColor : bright ? "rgba(59,130,246,0.5)" : "rgba(59,130,246,0.15)",
              boxShadow: activityBright ? `0 0 8px ${glowColor}` : bright ? "0 0 4px rgba(59,130,246,0.3)" : "none",
              transition: "all 0.3s",
            }}
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{
                duration: status === "typing" ? 0.8 + (i % 3) * 0.3 : 2.5 + (i % 3),
                repeat: Infinity, delay: (i * 0.05) % 1.5, ease: "easeInOut",
              }}
            />
          );
        })}
      </div>

      {/* Activity bar */}
      <div style={{ height: 3, background: "rgba(255,255,255,0.04)", margin: "0 12px 10px" }}>
        <motion.div
          style={{ height: "100%", borderRadius: 2, background: `linear-gradient(90deg, #2563EB, ${glowColor})` }}
          animate={{ width: `${activity}%` }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
      </div>

      {/* Status label */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "4px 12px 10px", fontSize: "0.6rem",
        fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase",
      }}>
        <span style={{ display: "flex", alignItems: "center", gap: 5, color: glowColor }}>
          <motion.span
            animate={{ opacity: status === "typing" ? [1, 0, 1] : 1 }}
            transition={{ duration: 0.8, repeat: Infinity }}
            style={{ width: 5, height: 5, borderRadius: "50%", background: glowColor, display: "block" }}
          />
          {status === "idle" && "System ready"}
          {status === "typing" && "Authenticating…"}
          {status === "complete" && "Credentials verified"}
          {status === "success" && "Access granted"}
        </span>
        <span style={{ color: "#274D70" }}>v2.0-stable</span>
      </div>

      {/* Corner orb */}
      <div style={{
        position: "absolute", right: -20, bottom: -20, width: 80, height: 80,
        borderRadius: "50%",
        background: `radial-gradient(circle, ${status === "success" ? "rgba(34,197,94,0.2)" : "rgba(59,130,246,0.2)"} 0%, transparent 70%)`,
        transition: "background 0.6s",
        pointerEvents: "none",
      }} />
    </div>
  );
};

/* ─────────────────────────────────────────
   Floating info card on left panel
───────────────────────────────────────────*/
const LeftInfoCard: React.FC<{
  mode: AuthMode; role: LoginRole;
  filledCount: number; totalFields: number;
}> = ({ mode, role, filledCount, totalFields }) => {
  const percent = totalFields > 0 ? Math.round((filledCount / totalFields) * 100) : 0;

  const checks = mode === "login"
    ? [
      { label: "Email validated", done: filledCount >= 1 },
      { label: "Password provided", done: filledCount >= 2 },
      { label: `${role === "citizen" ? "Citizen" : role === "admin" ? "Admin" : role === "officer" ? "Officer" : "Department"} role selected`, done: true },
    ]
    : [
      { label: "Name provided", done: filledCount >= 1 },
      { label: "Email validated", done: filledCount >= 2 },
      { label: "Password set", done: filledCount >= 3 },
      { label: "Passwords matched", done: filledCount >= 4 },
    ];

  return (
    <motion.div
      layout
      style={{
        borderRadius: 14, padding: "14px 16px",
        border: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(17,24,39,0.7)",
        backdropFilter: "blur(12px)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "#64748B" }}>
          Form progress
        </span>
        <motion.span
          animate={{ color: percent === 100 ? "#22C55E" : "#3B82F6" }}
          transition={{ duration: 0.4 }}
          style={{ fontSize: "0.9rem", fontWeight: 800, letterSpacing: "-0.04em" }}
        >
          {percent}%
        </motion.span>
      </div>

      {/* Progress bar */}
      <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", marginBottom: 12, overflow: "hidden" }}>
        <motion.div
          animate={{ width: `${percent}%`, background: percent === 100 ? "#22C55E" : "linear-gradient(90deg,#2563EB,#60A5FA)" }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          style={{ height: "100%", borderRadius: 2 }}
        />
      </div>

      {/* Checklist */}
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {checks.map(c => (
          <motion.div
            key={c.label}
            animate={{ opacity: c.done ? 1 : 0.4 }}
            transition={{ duration: 0.3 }}
            style={{ display: "flex", alignItems: "center", gap: 7, fontSize: "0.74rem" }}
          >
            <AnimatePresence mode="wait">
              {c.done ? (
                <motion.span key="done" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
                  transition={{ type: "spring", stiffness: 400, damping: 20 }}>
                  <CheckCircle2 size={13} color="#22C55E" />
                </motion.span>
              ) : (
                <motion.span key="todo" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                  <div style={{ width: 13, height: 13, borderRadius: "50%", border: "1.5px solid rgba(255,255,255,0.1)" }} />
                </motion.span>
              )}
            </AnimatePresence>
            <span style={{ color: c.done ? "#93C5FD" : "#374151" }}>{c.label}</span>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
};

/* ─────────────────────────────────────────
   Reusable input field
───────────────────────────────────────────*/
interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string; id: string;
  icon?: React.ReactNode; suffix?: React.ReactNode;
  onFocusChange?: (focused: boolean) => void;
}
const Field: React.FC<FieldProps> = ({ label, id, icon, suffix, onFocusChange, ...props }) => {
  const [focused, setFocused] = React.useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label htmlFor={id} style={{
        fontSize: "0.65rem", fontWeight: 700,
        letterSpacing: "0.16em", textTransform: "uppercase", color: "#64748B",
      }}>
        {label}
      </label>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "10px 14px", borderRadius: 10,
        border: focused ? "1px solid rgba(59,130,246,0.55)" : "1px solid rgba(255,255,255,0.08)",
        background: focused ? "rgba(59,130,246,0.04)" : "rgba(255,255,255,0.03)",
        boxShadow: focused ? "0 0 0 3px rgba(59,130,246,0.1)" : "none",
        transition: "all 0.2s",
      }}>
        {icon && <span style={{ color: focused ? "#60A5FA" : "#64748B", flexShrink: 0, display: "flex", transition: "color 0.2s" }}>{icon}</span>}
        <input id={id} style={{
          flex: 1, border: "none", background: "transparent", outline: "none",
          fontSize: "0.88rem", color: "#fff", fontFamily: "inherit",
        }}
          onFocus={() => { setFocused(true); onFocusChange?.(true); }}
          onBlur={() => { setFocused(false); onFocusChange?.(false); }}
          {...props}
        />
        {suffix && (
          <span style={{ color: "#64748B", flexShrink: 0, display: "flex" }}>
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
};

/* ─── role button ─── */
const RoleBtn: React.FC<{
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  id?: string;
  onKeyDown?: (e: React.KeyboardEvent) => void;
}> = ({
  active, onClick, icon, label, id, onKeyDown,
}) => (
  <button
    type="button"
    role="radio"
    id={id}
    aria-checked={active}
    aria-label={label}
    tabIndex={active ? 0 : -1}
    onClick={onClick}
    onKeyDown={onKeyDown}
    style={{
      flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
      padding: "9px 8px", borderRadius: 10, fontFamily: "inherit",
      fontSize: "0.82rem", fontWeight: 600, cursor: "pointer",
      border: active ? "1px solid rgba(59,130,246,0.5)" : "1px solid rgba(255,255,255,0.07)",
      background: active ? "rgba(59,130,246,0.1)" : "rgba(255,255,255,0.02)",
      color: active ? "#93C5FD" : "#64748B",
      boxShadow: active ? "0 0 12px rgba(59,130,246,0.15)" : "none",
      transition: "all 0.2s",
    }}
  >
    {icon} {label}
  </button>
);

/* ─────────────────────────────────────────
   Main Component
───────────────────────────────────────────*/
const AuthPage: React.FC<AuthPageProps> = ({ initialMode = "login" }) => {
  const navigate = useNavigate();
  const { login, refreshAuthenticatedUser, logout, register } = useAuth();
  const { toast } = useToast();

  const [mode, setMode] = React.useState<AuthMode>(initialMode);
  const [loginRole, setLoginRole] = React.useState<LoginRole>("citizen");
  const [loginDepartment, setLoginDepartment] = React.useState<string>("");
  const [signupRole, setSignupRole] = React.useState<Role>("citizen");

  const [loginEmail, setLoginEmail] = React.useState("");
  const [loginPassword, setLoginPassword] = React.useState("");
  const [showLoginPw, setShowLoginPw] = React.useState(false);
  const [rememberMe, setRememberMe] = React.useState(true);
  const [loginLoading, setLoginLoading] = React.useState(false);
  const [activeDemoId, setActiveDemoId] = React.useState<DemoAccountId | null>(null);
  const [selectedOfficerDept, setSelectedOfficerDept] = React.useState<string | null>(null);
  const [officerOptions, setOfficerOptions] = React.useState<OfficerOption[]>([]);
  const [loadingOfficers, setLoadingOfficers] = React.useState(false);
  const [officerFetchError, setOfficerFetchError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let isMounted = true;
    if (!selectedOfficerDept) {
      setOfficerOptions([]);
      return;
    }

    setLoadingOfficers(true);
    setOfficerFetchError(null);

    const loadOfficers = async () => {
      try {
        if (typeof authApi.getOfficerOptions === "function") {
          const list = await authApi.getOfficerOptions(selectedOfficerDept);
          if (isMounted) {
            setOfficerOptions(Array.isArray(list) ? list : []);
          }
        } else {
          if (isMounted) {
            setOfficerOptions([]);
          }
        }
      } catch (err: unknown) {
        if (isMounted) {
          setOfficerFetchError(err instanceof Error ? err.message : "Unable to load officers");
          setOfficerOptions([]);
        }
      } finally {
        if (isMounted) {
          setLoadingOfficers(false);
        }
      }
    };

    void loadOfficers();
    return () => {
      isMounted = false;
    };
  }, [selectedOfficerDept]);

  const handleSelectOfficerOption = async (officer: OfficerOption) => {
    if (loginLoading) return;

    const hasManualCredentials = !activeDemoId && (loginEmail.trim() !== "" || loginPassword.trim() !== "");
    if (hasManualCredentials) {
      if (officer.department) {
        setLoginDepartment(officer.department);
      }
      return;
    }

    const demoMeta = DEMO_OFFICER_MAP[officer.department];
    const isKnownDemo = demoMeta && DEMO_ACCOUNTS[demoMeta.demoKey]?.email === officer.email;
    const demoKey = isKnownDemo ? demoMeta.demoKey : undefined;
    const password = demoKey && DEMO_ACCOUNTS[demoKey]?.credentialKey
      ? await getDemoPassword(DEMO_ACCOUNTS[demoKey].credentialKey)
      : undefined;

    setLoginRole("officer");
    setLoginDepartment(officer.department);
    setSelectedOfficerDept(officer.department);
    setLoginEmail(officer.email);
    setLoginPassword(password || "");
    setLoginError("");
    setActiveDemoId(demoKey || (officer.id as DemoAccountId) || (officer.email as DemoAccountId));
    setIsTyping(true);
  };
  const [loginError, setLoginError] = React.useState("");
  const loginInFlight = React.useRef(false);
  const loginFormRef = React.useRef<HTMLFormElement>(null);

  const [signupName, setSignupName] = React.useState("");
  const [signupEmail, setSignupEmail] = React.useState("");
  const [signupPassword, setSignupPassword] = React.useState("");
  const [showSignupPw, setShowSignupPw] = React.useState(false);
  const [signupConfirm, setSignupConfirm] = React.useState("");
  const [showConfirmPw, setShowConfirmPw] = React.useState(false);
  const [signupDept, setSignupDept] = React.useState(DEPARTMENTS[0] ?? "");
  const [signupLoading, setSignupLoading] = React.useState(false);
  const [signupError, setSignupError] = React.useState("");

  /* ─── Forgot / Reset Password state ─── */
  const [searchParams, setSearchParams] = useSearchParams();
  const resetTokenParam = searchParams.get("token") || searchParams.get("resetToken") || "";

  const [forgotOpen, setForgotOpen] = React.useState(false);
  const [forgotEmail, setForgotEmail] = React.useState("");
  const [forgotLoading, setForgotLoading] = React.useState(false);
  const [forgotSuccess, setForgotSuccess] = React.useState(false);

  const [resetOpen, setResetOpen] = React.useState(Boolean(resetTokenParam));
  const [resetToken, setResetToken] = React.useState(resetTokenParam);
  const [resetPasswordVal, setResetPasswordVal] = React.useState("");
  const [resetConfirmVal, setResetConfirmVal] = React.useState("");
  const [showResetPw, setShowResetPw] = React.useState(false);
  const [resetLoading, setResetLoading] = React.useState(false);
  const [resetError, setResetError] = React.useState("");

  React.useEffect(() => {
    if (resetTokenParam) {
      setResetToken(resetTokenParam);
      setResetOpen(true);
    }
  }, [resetTokenParam]);

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) {
      toast({ title: "Email required", description: "Please enter your email address.", variant: "destructive" });
      return;
    }
    setForgotLoading(true);
    try {
      await authApi.forgotPassword({ email: forgotEmail.trim() });
      setForgotSuccess(true);
      toast({
        title: "Instructions Dispatched",
        description: "If an account matches that email, password reset instructions have been sent.",
      });
    } catch (err: unknown) {
      toast({
        title: "Request Failed",
        description: err instanceof Error ? err.message : "Failed to process forgot password request.",
        variant: "destructive",
      });
    } finally {
      setForgotLoading(false);
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError("");
    if (!resetToken.trim()) {
      setResetError("Reset token is required.");
      return;
    }
    if (resetPasswordVal.length < 6) {
      setResetError("Password must be at least 6 characters.");
      return;
    }
    if (resetPasswordVal !== resetConfirmVal) {
      setResetError("Passwords do not match.");
      return;
    }
    setResetLoading(true);
    try {
      await authApi.resetPassword({ token: resetToken.trim(), password: resetPasswordVal });
      toast({
        title: "Password Reset Successful",
        description: "Your password has been changed. You can now log in.",
      });
      setResetOpen(false);
      setResetToken("");
      setResetPasswordVal("");
      setResetConfirmVal("");
      if (searchParams.has("token") || searchParams.has("resetToken")) {
        setSearchParams({});
      }
      setMode("login");
    } catch (err: unknown) {
      setResetError(err instanceof Error ? err.message : "Password reset failed. Token may be invalid or expired.");
    } finally {
      setResetLoading(false);
    }
  };

  /* ─── track focus/typing for left panel animation ─── */
  const [isTyping, setIsTyping] = React.useState(false);
  const typingTimer = React.useRef<ReturnType<typeof setTimeout>>();

  const notifyTyping = React.useCallback(() => {
    setIsTyping(true);
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => setIsTyping(false), 800);
  }, []);

  /* ─── compute left panel state ─── */
  const loginFilled = [loginEmail, loginPassword].filter(Boolean).length;
  const signupFilled = [signupName, signupEmail, signupPassword, signupConfirm].filter(Boolean).length;
  const filledCount = mode === "login" ? loginFilled : signupFilled;
  const totalFields = mode === "login" ? 2 : 4;
  const currentRole = mode === "login" ? loginRole : signupRole;

  const activity = Math.round((filledCount / totalFields) * 100);
  const gridStatus: "idle" | "typing" | "complete" | "success" =
    isTyping ? "typing"
      : filledCount === totalFields ? "complete"
        : filledCount > 0 ? "typing"
          : "idle";

  const switchMode = (m: AuthMode) => {
    setMode(m); setLoginError(""); setSignupError("");
    navigate(m === "login" ? "/login" : "/signup", { replace: true });
  };

  const handleRoleTabChange = (role: LoginRole) => {
    if (loginLoading) return;
    setLoginRole(role);
    setLoginDepartment("");
    setSelectedOfficerDept(null);
    setActiveDemoId(null);
    setLoginEmail("");
    setLoginPassword("");
    setLoginError("");
  };

  const handleLoginRoleKeyDown = (e: React.KeyboardEvent) => {
    const roles: LoginRole[] = ["citizen", "authority", "officer"];
    const currentIndex = roles.indexOf(loginRole);
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      const nextRole = roles[(currentIndex + 1) % roles.length];
      handleRoleTabChange(nextRole);
      document.getElementById(`login-role-${nextRole}`)?.focus();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      const prevRole = roles[(currentIndex - 1 + roles.length) % roles.length];
      handleRoleTabChange(prevRole);
      document.getElementById(`login-role-${prevRole}`)?.focus();
    }
  };

  const handleSignupRoleKeyDown = (e: React.KeyboardEvent) => {
    const roles: ("citizen" | "authority")[] = ["citizen", "authority"];
    const currentIndex = roles.indexOf(signupRole);
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      const nextRole = roles[(currentIndex + 1) % roles.length];
      setSignupRole(nextRole);
      document.getElementById(`signup-role-${nextRole}`)?.focus();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      const prevRole = roles[(currentIndex - 1 + roles.length) % roles.length];
      setSignupRole(prevRole);
      document.getElementById(`signup-role-${prevRole}`)?.focus();
    }
  };

  const selectDemoAccount = async (accountId: DemoAccountId) => {
    if (loginLoading) return;
    const account = DEMO_ACCOUNTS[accountId];
    const password = account.credentialKey ? await getDemoPassword(account.credentialKey) : undefined;

    // Check if user has manually typed credentials in the form
    const hasManualCredentials = !activeDemoId && (loginEmail.trim() !== "" || loginPassword.trim() !== "");
    if (hasManualCredentials) {
      // Do not overwrite manually entered credentials
      if (account.department) {
        setLoginDepartment(account.department);
      }
      return;
    }

    setLoginRole(account.role);
    setLoginDepartment(account.department || "");
    if (account.role === "officer" && account.department) {
      setSelectedOfficerDept(account.department);
    }
    setLoginEmail(account.email);
    setLoginPassword(password || "");
    setLoginError("");
    setActiveDemoId(account.id);
    setIsTyping(true);

    if (!password) {
      setActiveDemoId(null);
      setLoginError(`No valid development demo credential is configured for ${account.label}. Enter the existing password manually.`);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loginInFlight.current) return;
    loginInFlight.current = true;
    setLoginError(""); setLoginLoading(true);
    const demoAccount = activeDemoId ? DEMO_ACCOUNTS[activeDemoId] : null;
    const isDepartmentLogin = loginRole === "authority" || loginRole === "officer";

    // For normal officer login, the backend determines the actual role and department.
    // Department selection is only required when manually logging in as authority without demo.
    if (loginRole === "authority" && !loginDepartment && !demoAccount) {
      setLoginError("Select your department before signing in.");
      setLoginLoading(false);
      loginInFlight.current = false;
      return;
    }
    try {
      const loginUser = await login(
        loginEmail,
        loginPassword,
        isDepartmentLogin ? "authority" : loginRole,
        loginDepartment || undefined,
        loginRole === "officer" ? "officer" : (loginRole === "authority" ? "authority" : undefined),
      );
      if (demoAccount) {
        const user = await refreshAuthenticatedUser();
        const matchesSelection = user.email.toLowerCase() === demoAccount.email.toLowerCase()
          && user.role === demoAccount.clientRole
          && (demoAccount.department ? user.department === demoAccount.department : true)
          && (demoAccount.departmentRole ? user.departmentRole === demoAccount.departmentRole : true);
        if (!matchesSelection) {
          logout();
          throw new Error("The authenticated account does not match the selected demo account. The session was cleared.");
        }
        navigate(routeForRole(user.role));
      } else {
        if (!rememberMe) sessionStorage.setItem("govai_last_user", loginUser.email);
        navigate(routeForRole(loginUser.role));
      }
    } catch (err: unknown) {
      if (demoAccount) logout();
      setLoginError(err instanceof Error ? err.message : "Unable to sign in right now.");
    } finally {
      setLoginLoading(false);
      loginInFlight.current = false;
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault(); setSignupError("");
    if (signupPassword !== signupConfirm) { setSignupError("Passwords do not match."); return; }
    if (signupPassword.length < 6) { setSignupError("Password must be at least 6 characters."); return; }
    if (signupRole === "authority" && !signupDept) { setSignupError("Please select a department."); return; }
    setSignupLoading(true);
    try {
      await register(signupName, signupEmail, signupPassword, signupRole,
        signupRole === "authority" ? signupDept : undefined);
      navigate(routeForRole(signupRole));
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "AUTHORITY_PENDING") {
        toast({ title: "Registration submitted", description: "Your department account is pending admin approval." });
        switchMode("login"); return;
      }
      setSignupError(err instanceof Error ? err.message : "Unable to create your account.");
    } finally { setSignupLoading(false); }
  };

  /* ─── social button ─── */
  const SocialBtn: React.FC<{ label: string; onClick: () => void; children: React.ReactNode }> = ({
    label, onClick, children,
  }) => {
    const [hov, setHov] = React.useState(false);
    return (
      <button type="button" onClick={onClick}
        onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
        style={{
          flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          padding: "9px 8px", borderRadius: 10, fontFamily: "inherit",
          fontSize: "0.82rem", fontWeight: 600, cursor: "pointer",
          border: hov ? "1px solid rgba(59,130,246,0.35)" : "1px solid rgba(255,255,255,0.08)",
          background: hov ? "rgba(59,130,246,0.06)" : "rgba(255,255,255,0.03)",
          color: hov ? "#fff" : "#94A3B8",
          boxShadow: hov ? "0 0 10px rgba(59,130,246,0.1)" : "none",
          transition: "all 0.2s",
        }}>
        {children} {label}
      </button>
    );
  };

  /* ────────────────── RENDER ────────────────── */
  return (
    <>
      <style>{`
        .ga-root { font-family: 'Inter', system-ui, sans-serif; margin: 0; padding: 0; }
        .ga-root * { box-sizing: border-box; }
        .ga-layout {
          display: flex;
          height: 100vh;
          overflow: hidden;
          background: #0B1220;
        }
        /* LEFT: fixed height, no scroll */
        .ga-left {
          width: 50%;
          flex-shrink: 0;
          height: 100vh;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 2rem 2.5rem;
          position: relative;
          background: linear-gradient(135deg, #020617 0%, #0B1220 50%, #0F172A 100%);
        }
        /* RIGHT: scrolls independently */
        .ga-right {
          flex: 1;
          height: 100vh;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-start;
          padding: 2rem 2.5rem;
          background: #0F172A;
        }
        .ga-right::-webkit-scrollbar { width: 4px; }
        .ga-right::-webkit-scrollbar-track { background: transparent; }
        .ga-right::-webkit-scrollbar-thumb { background: rgba(59,130,246,0.2); border-radius: 2px; }
        .ga-select {
          background: transparent; border: none; outline: none;
          font-size: 0.88rem; color: #fff; font-family: inherit;
          width: 100%; cursor: pointer; appearance: none;
        }
        .ga-select option { background: #1E293B; }
        .ga-cta {
          width: 100%; padding: 13px; border-radius: 10px; border: none;
          cursor: pointer; font-size: 0.92rem; font-weight: 700;
          letter-spacing: 0.02em; color: #fff; font-family: inherit;
          background: linear-gradient(90deg, #2563EB, #3B82F6);
          box-shadow: 0 4px 14px rgba(37,99,235,0.4);
          display: flex; align-items: center; justify-content: center; gap: 6px;
          transition: transform 0.2s, box-shadow 0.2s, filter 0.2s;
        }
        .ga-cta:hover:not(:disabled) {
          transform: translateY(-1px) scale(1.03);
          box-shadow: 0 8px 24px rgba(37,99,235,0.55);
          filter: brightness(1.08);
        }
        .ga-cta:disabled { opacity: 0.5; cursor: not-allowed; }
        .ga-mobile-header { display: none !important; }
        @media (max-width: 768px) {
          .ga-layout { flex-direction: column; height: auto; overflow: visible; }
          .ga-left { display: none; }
          .ga-right { width: 100%; height: auto; overflow-y: visible; padding: 1.5rem 1rem; }
          .ga-mobile-header { display: flex !important; }
        }
      `}</style>

      <div className="ga-root">
        <div className="ga-layout">

          {/* ═══════════════ LEFT PANEL (fixed height, never scrolls) ═══════════════ */}
          <div className="ga-left">
            {/* Radial glows */}
            <motion.div
              style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
              animate={{
                background: filledCount > 0
                  ? "radial-gradient(ellipse 65% 55% at 25% 15%, rgba(37,99,235,0.28) 0%, transparent 65%), radial-gradient(ellipse 45% 45% at 80% 80%, rgba(59,130,246,0.15) 0%, transparent 60%)"
                  : "radial-gradient(ellipse 65% 55% at 25% 15%, rgba(37,99,235,0.12) 0%, transparent 65%), radial-gradient(ellipse 45% 45% at 80% 80%, rgba(59,130,246,0.07) 0%, transparent 60%)",
              }}
              transition={{ duration: 0.8 }}
            />

            {/* Typing pulse glow */}
            <AnimatePresence>
              {isTyping && (
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  style={{
                    position: "absolute", inset: 0, pointerEvents: "none",
                    background: "radial-gradient(ellipse 80% 60% at 50% 50%, rgba(59,130,246,0.07) 0%, transparent 70%)",
                  }}
                />
              )}
            </AnimatePresence>

            {/* TOP — brand + back */}
            <div style={{ position: "relative", zIndex: 2, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <Link to="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
                <motion.div
                  animate={{ boxShadow: filledCount > 0 ? "0 0 24px rgba(59,130,246,0.6)" : "0 0 14px rgba(59,130,246,0.3)" }}
                  transition={{ duration: 0.5 }}
                  style={{
                    width: 36, height: 36, borderRadius: 10, display: "flex",
                    alignItems: "center", justifyContent: "center",
                    background: "linear-gradient(135deg, #2563EB, #3B82F6)",
                  }}
                >
                  <Shield size={17} color="#fff" />
                </motion.div>
                <div>
                  <p style={{ fontSize: "1rem", fontWeight: 800, color: "#fff", margin: 0, lineHeight: 1 }}>GovAI Resolve</p>
                  <p style={{ fontSize: "0.62rem", color: "#3B82F6", fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", margin: 0 }}>Secure Gateway</p>
                </div>
              </Link>
              <Link to="/" style={{
                display: "flex", alignItems: "center", gap: 4,
                fontSize: "0.78rem", fontWeight: 500, color: "#64748B",
                textDecoration: "none", padding: "6px 14px", borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.07)",
                background: "rgba(255,255,255,0.02)",
              }}>
                Back to website <ChevronRight size={13} />
              </Link>
            </div>

            {/* CENTER — headline */}
            <div style={{ position: "relative", zIndex: 2, flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 16 }}>
              <div>
                <p style={{
                  display: "flex", alignItems: "center", gap: 8,
                  fontSize: "0.68rem", fontWeight: 700, color: "#3B82F6",
                  letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: "1rem",
                }}>
                  <span style={{ display: "block", width: 20, height: 2, background: "#3B82F6", borderRadius: 2 }} />
                  Civic Intelligence Platform
                </p>

                {/* Headline + animated subtitle based on mode */}
                <AnimatePresence mode="wait">
                  <motion.div
                    key={mode}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.35 }}
                  >
                    <h1 style={{
                      fontSize: "clamp(1.9rem,2.8vw,2.7rem)", fontWeight: 900,
                      lineHeight: 1.06, letterSpacing: "-0.04em",
                      color: "#fff", margin: "0 0 0.8rem",
                    }}>
                      {mode === "login" ? (
                        <>Secure{" "}<span style={{ background: "linear-gradient(90deg,#93C5FD,#60A5FA)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>access</span>.</>
                      ) : (
                        <>Join{" "}<span style={{ background: "linear-gradient(90deg,#93C5FD,#60A5FA)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>civic</span>{" "}ops.</>
                      )}
                    </h1>
                    <p style={{ fontSize: "0.85rem", lineHeight: 1.7, color: "#64748B", maxWidth: "38ch", margin: 0 }}>
                      {mode === "login"
                        ? "Enter your credentials to reinitialize your civic operations dashboard."
                        : `Register as a ${currentRole === "citizen" ? "citizen" : "department official"} to start resolving civic issues faster.`}
                    </p>
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Stat badges — animate on fill */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[
                  { v: "23k+", l: "Resolved", minFill: 0 },
                  { v: "2.4×", l: "Faster", minFill: 1 },
                  { v: "91%", l: "Accuracy", minFill: 2 },
                ].map((s) => (
                  <motion.div key={s.l}
                    animate={{
                      borderColor: filledCount > s.minFill ? "rgba(59,130,246,0.35)" : "rgba(255,255,255,0.06)",
                      background: filledCount > s.minFill ? "rgba(59,130,246,0.08)" : "rgba(17,24,39,0.6)",
                      boxShadow: filledCount > s.minFill ? "0 0 12px rgba(59,130,246,0.12)" : "none",
                    }}
                    transition={{ duration: 0.4 }}
                    style={{
                      padding: "10px 14px", borderRadius: 12,
                      border: "1px solid rgba(255,255,255,0.06)",
                      backdropFilter: "blur(10px)",
                    }}
                  >
                    <p style={{ fontSize: "1.3rem", fontWeight: 800, color: "#fff", margin: 0, lineHeight: 1, letterSpacing: "-0.04em" }}>{s.v}</p>
                    <p style={{ fontSize: "0.67rem", color: "#64748B", margin: "3px 0 0" }}>{s.l}</p>
                  </motion.div>
                ))}
              </div>

              {/* Connection status */}
              <motion.div
                animate={{
                  borderColor: isTyping ? "rgba(59,130,246,0.35)" : "rgba(255,255,255,0.06)",
                  background: isTyping ? "rgba(59,130,246,0.06)" : "rgba(17,24,39,0.5)",
                }}
                transition={{ duration: 0.3 }}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "10px 14px", borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <motion.div
                  animate={{ color: isTyping ? "#3B82F6" : "#374151" }}
                  transition={{ duration: 0.3 }}
                  style={{ display: "flex" }}
                >
                  {isTyping ? <Activity size={14} /> : <Wifi size={14} />}
                </motion.div>
                <AnimatePresence mode="wait">
                  <motion.span
                    key={isTyping ? "typing" : "idle"}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.2 }}
                    style={{
                      fontSize: "0.72rem", fontWeight: 600,
                      color: isTyping ? "#60A5FA" : "#374151",
                    }}
                  >
                    {isTyping ? "Input detected — processing session…" : "Secure connection established"}
                  </motion.span>
                </AnimatePresence>
              </motion.div>

              {/* Form progress card */}
              <LeftInfoCard mode={mode} role={currentRole} filledCount={filledCount} totalFields={totalFields} />
            </div>

            {/* BOTTOM — neon grid */}
            <div style={{ position: "relative", zIndex: 2 }}>
              <NeonGrid activity={activity} status={gridStatus} />
            </div>
          </div>

          {/* ═══════════════ RIGHT PANEL (scrolls independently) ═══════════════ */}
          <div className="ga-right">
            {/* Top glow */}
            <div style={{
              position: "sticky", top: 0, left: 0, right: 0, height: 0, zIndex: 0,
              backgroundImage: "radial-gradient(ellipse 70% 60% at 50% 0%, rgba(37,99,235,0.07) 0%, transparent 70%)",
              marginBottom: 0,
            }} />

            {/* Spacer for centering when content fits */}
            <div style={{ flex: "1 0 0" }} />

            {/* Mobile-only compact brand header (visible <= 768px when .ga-left is hidden) */}
            <div className="ga-mobile-header" style={{
              width: "100%", maxWidth: 420, marginBottom: "1.2rem",
              alignItems: "center", justifyContent: "space-between",
            }}>
              <Link to="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8, display: "flex",
                  alignItems: "center", justifyContent: "center",
                  background: "linear-gradient(135deg, #2563EB, #3B82F6)",
                  boxShadow: "0 0 12px rgba(59,130,246,0.35)",
                }}>
                  <Shield size={16} color="#fff" />
                </div>
                <div>
                  <p style={{ fontSize: "0.95rem", fontWeight: 800, color: "#fff", margin: 0, lineHeight: 1 }}>GovAI Resolve</p>
                  <p style={{ fontSize: "0.58rem", color: "#3B82F6", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", margin: 0 }}>Secure Gateway</p>
                </div>
              </Link>

              <Link to="/" style={{
                display: "inline-flex", alignItems: "center", gap: 3,
                fontSize: "0.75rem", fontWeight: 500, color: "#94A3B8",
                textDecoration: "none", padding: "5px 10px", borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(255,255,255,0.04)",
              }}>
                Back to website <ChevronRight size={12} />
              </Link>
            </div>

            {/* Auth card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              style={{
                width: "100%", maxWidth: 420, position: "relative", zIndex: 1,
                background: "#111827", borderRadius: 20, padding: "28px",
                border: "1px solid rgba(255,255,255,0.06)",
                boxShadow: "0 20px 40px rgba(0,0,0,0.5), 0 0 30px rgba(59,130,246,0.08)",
              }}
            >
              {/* Tab Switcher */}
              <div
                role="tablist"
                aria-label="Authentication mode"
                onKeyDown={(e) => {
                  if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                    e.preventDefault();
                    const nextMode: AuthMode = mode === "login" ? "signup" : "login";
                    switchMode(nextMode);
                    setTimeout(() => {
                      document.getElementById(`auth-tab-${nextMode}`)?.focus();
                    }, 0);
                  }
                }}
                style={{
                  display: "grid", gridTemplateColumns: "1fr 1fr",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 12, padding: 4, marginBottom: "1.4rem",
                }}
              >
                {(["login", "signup"] as AuthMode[]).map(m => (
                  <button
                    key={m}
                    type="button"
                    role="tab"
                    id={`auth-tab-${m}`}
                    aria-selected={mode === m}
                    aria-controls={`auth-panel-${m}`}
                    tabIndex={mode === m ? 0 : -1}
                    onClick={() => switchMode(m)}
                    style={{
                      padding: "9px 0", borderRadius: 9, fontFamily: "inherit",
                      fontSize: "0.88rem", fontWeight: 600, cursor: "pointer", border: "none",
                      background: mode === m ? "linear-gradient(90deg,#2563EB,#3B82F6)" : "transparent",
                      color: mode === m ? "#fff" : "#64748B",
                      boxShadow: mode === m ? "0 0 16px rgba(59,130,246,0.35)" : "none",
                      transition: "all 0.25s",
                    }}
                  >
                    {m === "login" ? "Login" : "Sign Up"}
                  </button>
                ))}
              </div>

              <AnimatePresence mode="wait">
                {mode === "login" ? (
                  /* ═══════════ LOGIN ═══════════ */
                  <motion.div
                    key="login"
                    role="tabpanel"
                    id="auth-panel-login"
                    aria-labelledby="auth-tab-login"
                    tabIndex={0}
                    initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 12 }} transition={{ duration: 0.22 }}
                  >
                    <p style={{ fontSize: "1.3rem", fontWeight: 800, color: "#fff", margin: "0 0 4px", letterSpacing: "-0.02em" }}>Welcome back</p>
                    <p style={{ fontSize: "0.8rem", color: "#64748B", margin: "0 0 1.2rem" }}>Enter your credentials to access the resolver.</p>

                    {/* ── Admin Demo Banner ── */}
                    <motion.button
                      type="button"
                      whileHover={{ scale: 1.015 }}
                      whileTap={{ scale: 0.985 }}
                      onClick={() => selectDemoAccount("admin")}
                      disabled={loginLoading}
                      aria-label="Admin Demo Access"
                      style={{
                        width: "100%", marginBottom: "1.2rem", cursor: "pointer",
                        background: activeDemoId === "admin"
                          ? "linear-gradient(135deg, rgba(124,58,237,0.22) 0%, rgba(59,130,246,0.18) 100%)"
                          : "linear-gradient(135deg, rgba(124,58,237,0.12) 0%, rgba(59,130,246,0.1) 100%)",
                        border: activeDemoId === "admin" ? "1px solid rgba(124,58,237,0.6)" : "1px solid rgba(124,58,237,0.35)",
                        borderRadius: 12, padding: "11px 14px", fontFamily: "inherit",
                        display: "flex", alignItems: "center", gap: 10, textAlign: "left",
                        boxShadow: "0 0 18px rgba(124,58,237,0.12)",
                        transition: "all 0.2s",
                      }}
                    >
                      <div style={{
                        width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                        background: "linear-gradient(135deg,#7C3AED,#2563EB)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        boxShadow: "0 0 12px rgba(124,58,237,0.4)",
                      }}>
                        <Shield size={15} color="#fff" />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                          <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#A78BFA", letterSpacing: "0.14em", textTransform: "uppercase" }}>
                            Admin Demo Access
                          </span>
                          <span style={{
                            fontSize: "0.58rem", fontWeight: 700, padding: "1px 6px", borderRadius: 99,
                            background: "rgba(124,58,237,0.2)", border: "1px solid rgba(124,58,237,0.4)",
                            color: "#C4B5FD", letterSpacing: "0.1em", textTransform: "uppercase",
                          }}>{activeDemoId === "admin" ? "Selected" : "Click to select"}</span>
                        </div>
                        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                          <span style={{ fontSize: "0.72rem", color: "#64748B", display: "flex", alignItems: "center", gap: 4 }}>
                            <Mail size={10} color="#4F46E5" />
                            <span style={{ color: "#94A3B8", fontWeight: 500 }}>admin@govai.gov</span>
                          </span>
                        </div>
                      </div>
                      <ChevronRight size={14} color="#7C3AED" style={{ flexShrink: 0 }} />
                    </motion.button>

                    <div
                      role="radiogroup"
                      aria-label="Select login role"
                      onKeyDown={handleLoginRoleKeyDown}
                      style={{ display: "flex", gap: 8, marginBottom: "1.2rem" }}
                    >
                      <RoleBtn
                        id="login-role-citizen"
                        active={loginRole === "citizen"}
                        onClick={() => handleRoleTabChange("citizen")}
                        onKeyDown={handleLoginRoleKeyDown}
                        icon={<Users size={14} />}
                        label="Citizen"
                      />
                      <RoleBtn
                        id="login-role-authority"
                        active={loginRole === "authority"}
                        onClick={() => handleRoleTabChange("authority")}
                        onKeyDown={handleLoginRoleKeyDown}
                        icon={<Building2 size={14} />}
                        label="Department"
                      />
                      <RoleBtn
                        id="login-role-officer"
                        active={loginRole === "officer"}
                        onClick={() => handleRoleTabChange("officer")}
                        onKeyDown={handleLoginRoleKeyDown}
                        icon={<User size={14} />}
                        label="Officer"
                      />
                    </div>

                    {/* ── Role Tab Isolated Content ── */}
                    {loginRole === "citizen" && (
                      <div style={{ marginBottom: "1.2rem" }}>
                        <p style={{ fontSize: "0.72rem", color: "#94A3B8", margin: "0 0 7px", fontWeight: 700 }}>
                          Quick Demo Access (Citizen)
                        </p>
                        <button
                          type="button"
                          onClick={() => selectDemoAccount("citizen")}
                          disabled={loginLoading}
                          aria-label="Citizen Demo"
                          style={{
                            width: "100%", padding: "10px 12px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
                            textAlign: "left", color: activeDemoId === "citizen" ? "#38BDF8" : "#BAE6FD",
                            background: activeDemoId === "citizen" ? "rgba(14,165,233,0.18)" : "rgba(14,165,233,0.08)",
                            border: activeDemoId === "citizen" ? "1px solid rgba(14,165,233,0.6)" : "1px solid rgba(14,165,233,0.25)",
                            fontSize: "0.75rem", lineHeight: 1.4, display: "flex", alignItems: "center", justifyContent: "space-between",
                            transition: "all 0.2s ease",
                          }}
                        >
                          <div>
                            <strong style={{ display: "block", color: "#7DD3FC", fontSize: "0.82rem" }}>
                              Citizen Demo
                            </strong>
                            <span style={{ color: "#94A3B8", fontSize: "0.72rem" }}>citizen.demo@govai.gov</span>
                          </div>
                          {activeDemoId === "citizen" && (
                            <span style={{ fontSize: "0.65rem", padding: "2px 8px", borderRadius: 99, background: "rgba(14,165,233,0.25)", color: "#38BDF8", fontWeight: 600 }}>
                              Selected
                            </span>
                          )}
                        </button>
                      </div>
                    )}

                    {loginRole === "authority" && (
                      <div style={{ marginBottom: "1.2rem" }}>
                        <p style={{ fontSize: "0.72rem", color: "#94A3B8", margin: "0 0 7px", fontWeight: 700 }}>
                          Quick Demo Login (Department Authority)
                        </p>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
                          {DEPARTMENTS.map((department) => {
                            const demoId = AUTHORITY_DEMO_IDS[department];
                            const isSelected = activeDemoId === demoId;
                            return (
                              <button
                                key={department}
                                type="button"
                                onClick={() => selectDemoAccount(demoId)}
                                disabled={loginLoading}
                                aria-label={DEMO_ACCOUNTS[demoId].label}
                                style={{
                                  padding: "8px 9px",
                                  borderRadius: 9,
                                  cursor: "pointer",
                                  fontFamily: "inherit",
                                  textAlign: "left",
                                  color: isSelected ? "#BFDBFE" : "#94A3B8",
                                  background: isSelected ? "rgba(59,130,246,0.18)" : "rgba(255,255,255,0.03)",
                                  border: isSelected
                                    ? "1px solid rgba(59,130,246,0.6)"
                                    : "1px solid rgba(255,255,255,0.08)",
                                  fontSize: "0.7rem",
                                  transition: "all 0.2s ease",
                                }}
                              >
                                <div style={{ fontWeight: 600, color: isSelected ? "#93C5FD" : "#E2E8F0" }}>
                                  {department}
                                </div>
                                <div style={{ fontSize: "0.62rem", color: "#64748B" }}>
                                  Authority
                                </div>
                              </button>
                            );
                          })}
                        </div>
                        {loginDepartment && (
                          <p style={{ fontSize: "0.68rem", color: "#64748B", margin: "7px 0 0" }}>
                            Selected: {loginDepartment} Authority
                          </p>
                        )}
                      </div>
                    )}

                    {loginRole === "officer" && (
                      <div style={{ marginBottom: "1.2rem" }}>
                        {/* Step 1: Select Department */}
                        <div style={{ marginBottom: "0.9rem" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                            <p style={{ fontSize: "0.72rem", color: "#94A3B8", margin: 0, fontWeight: 700 }}>
                              Step 1: Select Department
                            </p>
                            {selectedOfficerDept && (
                              <span style={{ fontSize: "0.65rem", color: "#3B82F6", fontWeight: 600 }}>
                                {selectedOfficerDept}
                              </span>
                            )}
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
                            {DEPARTMENTS.map((dept) => {
                              const isDeptSelected = selectedOfficerDept === dept;
                              return (
                                <button
                                  key={dept}
                                  type="button"
                                  onClick={() => {
                                    if (loginLoading) return;
                                    setSelectedOfficerDept(dept);
                                    setLoginDepartment(dept);
                                    if (activeDemoId && activeDemoId !== OFFICER_DEMO_IDS[dept]) {
                                      setActiveDemoId(null);
                                      setLoginEmail("");
                                      setLoginPassword("");
                                    }
                                  }}
                                  disabled={loginLoading}
                                  aria-label={dept}
                                  style={{
                                    padding: "8px 9px",
                                    borderRadius: 9,
                                    cursor: "pointer",
                                    fontFamily: "inherit",
                                    textAlign: "left",
                                    color: isDeptSelected ? "#BFDBFE" : "#94A3B8",
                                    background: isDeptSelected ? "rgba(59,130,246,0.18)" : "rgba(255,255,255,0.03)",
                                    border: isDeptSelected
                                      ? "1px solid rgba(59,130,246,0.6)"
                                      : "1px solid rgba(255,255,255,0.08)",
                                    fontSize: "0.7rem",
                                    transition: "all 0.2s ease",
                                  }}
                                >
                                  <div style={{ fontWeight: 600, color: isDeptSelected ? "#93C5FD" : "#CBD5E1" }}>
                                    {dept}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Step 2: Officer Profile Card */}
                        {selectedOfficerDept ? (
                          <div>
                            <p style={{ fontSize: "0.72rem", color: "#94A3B8", margin: "0 0 6px", fontWeight: 700 }}>
                              Step 2: Select Officer Profile
                            </p>
                            {loadingOfficers ? (
                              <div style={{
                                padding: "12px",
                                borderRadius: 10,
                                background: "rgba(255,255,255,0.03)",
                                border: "1px solid rgba(255,255,255,0.08)",
                                color: "#94A3B8",
                                fontSize: "0.75rem",
                                textAlign: "center",
                              }}>
                                Loading active officers...
                              </div>
                            ) : officerOptions.length === 0 ? (
                              <div
                                data-testid="no-linked-officers-banner"
                                style={{
                                  padding: "12px",
                                  borderRadius: 10,
                                  background: "rgba(245,158,11,0.08)",
                                  border: "1px dashed rgba(245,158,11,0.25)",
                                  fontSize: "0.72rem",
                                  color: "#FDE68A",
                                  textAlign: "center",
                                }}
                              >
                                {officerFetchError || `No active linked officers available for ${selectedOfficerDept}.`}
                              </div>
                            ) : (
                              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                {officerOptions.map((officer) => {
                                  const demoMeta = DEMO_OFFICER_MAP[officer.department];
                                  const isKnownDemo = demoMeta && DEMO_ACCOUNTS[demoMeta.demoKey]?.email === officer.email;
                                  const isSelected = activeDemoId === (isKnownDemo ? demoMeta.demoKey : officer.id || officer.email) || loginEmail === officer.email;
                                  const ariaLabel = isKnownDemo ? demoMeta.ariaLabel : `${officer.name} (${officer.department} Officer)`;
                                  return (
                                    <button
                                      key={officer.id || officer.email}
                                      type="button"
                                      onClick={() => handleSelectOfficerOption(officer)}
                                      disabled={loginLoading}
                                      aria-label={ariaLabel}
                                      style={{
                                        width: "100%",
                                        padding: "10px 12px",
                                        borderRadius: 10,
                                        cursor: "pointer",
                                        fontFamily: "inherit",
                                        textAlign: "left",
                                        color: isSelected ? "#BFDBFE" : "#94A3B8",
                                        background: isSelected ? "rgba(59,130,246,0.16)" : "rgba(255,255,255,0.03)",
                                        border: isSelected ? "1px solid rgba(59,130,246,0.55)" : "1px solid rgba(255,255,255,0.08)",
                                        fontSize: "0.75rem",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        transition: "all 0.2s ease",
                                      }}
                                    >
                                      <div>
                                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                          <strong style={{ color: isSelected ? "#93C5FD" : "#F1F5F9", fontSize: "0.82rem" }}>
                                            {officer.name}
                                          </strong>
                                          <span style={{
                                            fontSize: "0.6rem",
                                            padding: "1px 6px",
                                            borderRadius: 99,
                                            background: "rgba(34,197,94,0.15)",
                                            border: "1px solid rgba(34,197,94,0.3)",
                                            color: "#86EFAC",
                                            fontWeight: 600,
                                          }}>
                                            {officer.statusBadge || "Active • Linked"}
                                          </span>
                                        </div>
                                        <span style={{ color: "#64748B", fontSize: "0.7rem" }}>{officer.email}</span>
                                      </div>
                                      {isSelected && (
                                        <span style={{ fontSize: "0.65rem", padding: "2px 8px", borderRadius: 99, background: "rgba(59,130,246,0.25)", color: "#60A5FA", fontWeight: 600 }}>
                                          Selected
                                        </span>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div style={{
                            padding: "10px 12px",
                            borderRadius: 9,
                            background: "rgba(255,255,255,0.02)",
                            border: "1px dashed rgba(255,255,255,0.08)",
                            fontSize: "0.7rem",
                            color: "#64748B",
                            textAlign: "center",
                          }}>
                            Select a department above to view the assigned field officer.
                          </div>
                        )}
                      </div>
                    )}

                    <form ref={loginFormRef} onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      {loginError && (
                        <div style={{
                          padding: "10px 14px", borderRadius: 9, fontSize: "0.78rem",
                          background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#FCA5A5",
                        }}>{loginError}</div>
                      )}

                      <Field label="Email Address" id="login-email" type="email"
                        placeholder={loginRole === "citizen" ? "name@civic.gov" : "officer@city.gov"}
                        value={loginEmail}
                        disabled={loginLoading}
                        onChange={e => { setLoginEmail(e.target.value); notifyTyping(); }}
                        onFocusChange={f => { if (f) setIsTyping(true); }}
                        icon={<Mail size={15} />} required
                      />
                      <Field label="Password" id="login-password"
                        type={showLoginPw ? "text" : "password"}
                        placeholder="Enter your password"
                        value={loginPassword}
                        disabled={loginLoading}
                        onChange={e => { setLoginPassword(e.target.value); notifyTyping(); }}
                        onFocusChange={f => { if (f) setIsTyping(true); }}
                        icon={<Lock size={15} />}
                        suffix={
                          <button
                            type="button"
                            aria-label={showLoginPw ? "Hide password" : "Show password"}
                            aria-pressed={showLoginPw}
                            onClick={() => setShowLoginPw(p => !p)}
                            style={{
                              background: "none",
                              border: "none",
                              padding: 0,
                              margin: 0,
                              cursor: "pointer",
                              color: "inherit",
                              display: "flex",
                              alignItems: "center",
                            }}
                            className="focus-visible:ring-2 focus-visible:ring-primary rounded-sm"
                          >
                            {showLoginPw ? <EyeOff size={15} /> : <Eye size={15} />}
                          </button>
                        }
                        required
                      />

                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "0.8rem" }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, color: "#64748B", cursor: "pointer", userSelect: "none" }}>
                          <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)}
                            style={{ accentColor: "#3B82F6", width: 14, height: 14 }} />
                          Remember me
                        </label>
                        <button type="button"
                          onClick={() => {
                            setForgotEmail(loginEmail || "");
                            setForgotSuccess(false);
                            setForgotOpen(true);
                          }}
                          style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.8rem", color: "#3B82F6", fontFamily: "inherit", padding: 0 }}>
                          Forgot password?
                        </button>
                      </div>

                      <button id="login-submit-btn" type="submit" className="ga-cta" disabled={loginLoading}>
                        {loginLoading ? "Authenticating…" : "Initialize Dashboard"}
                        {!loginLoading && <ArrowRight size={15} />}
                      </button>
                    </form>

                    <SocialDivider />
                    <SocialRow toast={toast} />
                    <TermsFooter />
                  </motion.div>
                ) : (
                  /* ═══════════ SIGNUP ═══════════ */
                  <motion.div
                    key="signup"
                    role="tabpanel"
                    id="auth-panel-signup"
                    aria-labelledby="auth-tab-signup"
                    tabIndex={0}
                    initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.22 }}
                  >
                    <p style={{ fontSize: "1.3rem", fontWeight: 800, color: "#fff", margin: "0 0 4px", letterSpacing: "-0.02em" }}>Create account</p>
                    <p style={{ fontSize: "0.8rem", color: "#64748B", margin: "0 0 1.2rem" }}>Register as a citizen or department official.</p>

                    <div
                      role="radiogroup"
                      aria-label="Select registration role"
                      onKeyDown={handleSignupRoleKeyDown}
                      style={{ display: "flex", gap: 8, marginBottom: "1.2rem" }}
                    >
                      <RoleBtn
                        id="signup-role-citizen"
                        active={signupRole === "citizen"}
                        onClick={() => setSignupRole("citizen")}
                        onKeyDown={handleSignupRoleKeyDown}
                        icon={<User size={14} />}
                        label="Citizen"
                      />
                      <RoleBtn
                        id="signup-role-authority"
                        active={signupRole === "authority"}
                        onClick={() => setSignupRole("authority")}
                        onKeyDown={handleSignupRoleKeyDown}
                        icon={<Building2 size={14} />}
                        label="Department"
                      />
                    </div>

                    <form onSubmit={handleSignup} style={{ display: "flex", flexDirection: "column", gap: 13 }}>
                      {signupError && (
                        <div style={{
                          padding: "10px 14px", borderRadius: 9, fontSize: "0.78rem",
                          background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#FCA5A5",
                        }}>{signupError}</div>
                      )}

                      <Field label="Full Name" id="signup-name" type="text" placeholder="Your full name"
                        value={signupName}
                        onChange={e => { setSignupName(e.target.value); notifyTyping(); }}
                        onFocusChange={f => { if (f) setIsTyping(true); }}
                        icon={<User size={15} />} required
                      />
                      <Field label="Email Address" id="signup-email" type="email"
                        placeholder={signupRole === "citizen" ? "name@email.com" : "officer@city.gov"}
                        value={signupEmail}
                        onChange={e => { setSignupEmail(e.target.value); notifyTyping(); }}
                        onFocusChange={f => { if (f) setIsTyping(true); }}
                        icon={<Mail size={15} />} required
                      />

                      {signupRole === "authority" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <label htmlFor="signup-dept" style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "#64748B" }}>
                            Department
                          </label>
                          <div style={{
                            display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10,
                            border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)",
                          }}>
                            <Building2 size={15} color="#64748B" />
                            <select id="signup-dept" className="ga-select" value={signupDept} onChange={e => setSignupDept(e.target.value)}>
                              {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                          </div>
                        </div>
                      )}

                      <Field label="Password" id="signup-password"
                        type={showSignupPw ? "text" : "password"} placeholder="Create a secure password"
                        value={signupPassword}
                        onChange={e => { setSignupPassword(e.target.value); notifyTyping(); }}
                        onFocusChange={f => { if (f) setIsTyping(true); }}
                        icon={<Lock size={15} />}
                        suffix={
                          <button
                            type="button"
                            aria-label={showSignupPw ? "Hide password" : "Show password"}
                            aria-pressed={showSignupPw}
                            onClick={() => setShowSignupPw(p => !p)}
                            style={{
                              background: "none",
                              border: "none",
                              padding: 0,
                              margin: 0,
                              cursor: "pointer",
                              color: "inherit",
                              display: "flex",
                              alignItems: "center",
                            }}
                            className="focus-visible:ring-2 focus-visible:ring-primary rounded-sm"
                          >
                            {showSignupPw ? <EyeOff size={15} /> : <Eye size={15} />}
                          </button>
                        }
                        required
                      />
                      <Field label="Confirm Password" id="signup-confirm"
                        type={showConfirmPw ? "text" : "password"} placeholder="Repeat your password"
                        value={signupConfirm}
                        onChange={e => { setSignupConfirm(e.target.value); notifyTyping(); }}
                        onFocusChange={f => { if (f) setIsTyping(true); }}
                        icon={<Shield size={15} />}
                        suffix={
                          <button
                            type="button"
                            aria-label={showConfirmPw ? "Hide confirm password" : "Show confirm password"}
                            aria-pressed={showConfirmPw}
                            onClick={() => setShowConfirmPw(p => !p)}
                            style={{
                              background: "none",
                              border: "none",
                              padding: 0,
                              margin: 0,
                              cursor: "pointer",
                              color: "inherit",
                              display: "flex",
                              alignItems: "center",
                            }}
                            className="focus-visible:ring-2 focus-visible:ring-primary rounded-sm"
                          >
                            {showConfirmPw ? <EyeOff size={15} /> : <Eye size={15} />}
                          </button>
                        }
                        required
                      />

                      {signupRole === "authority" && (
                        <div style={{
                          display: "flex", alignItems: "flex-start", gap: 8,
                          padding: "10px 14px", borderRadius: 9, fontSize: "0.76rem",
                          background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.2)",
                          color: "#FDE68A", lineHeight: 1.55,
                        }}>
                          <Sparkles size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                          Department accounts require admin approval before access is activated.
                        </div>
                      )}

                      <button id="signup-submit-btn" type="submit" className="ga-cta" disabled={signupLoading}>
                        {signupLoading ? "Creating account…" : `Create ${signupRole === "citizen" ? "Citizen" : "Department"} Account`}
                        {!signupLoading && <ArrowRight size={15} />}
                      </button>
                    </form>

                    <SocialDivider />
                    <SocialRow toast={toast} />

                    <p style={{ marginTop: 14, textAlign: "center", fontSize: "0.7rem", color: "#374151", lineHeight: 1.6 }}>
                      Already have an account?{" "}
                      <button type="button" onClick={() => switchMode("login")}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "#3B82F6", fontFamily: "inherit", fontSize: "0.7rem", padding: 0 }}>
                        Sign in here
                      </button>
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* Bottom spacer */}
            <div style={{ flex: "1 0 0" }} />
            <p style={{ marginTop: "1.5rem", fontSize: "0.68rem", color: "#1E293B", textAlign: "center" }}>
              System Version 2.0-Stable · © 2026 GovAI Resolve
            </p>
          </div>
        </div>
      </div>

      {/* Forgot Password Dialog */}
      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-primary" />
              Reset Your Password
            </DialogTitle>
            <DialogDescription>
              Enter the email associated with your account and we'll send you recovery instructions.
            </DialogDescription>
          </DialogHeader>

          {forgotSuccess ? (
            <div className="space-y-4 py-2">
              <div className="p-4 rounded-lg bg-primary/10 border border-primary/20 text-sm text-foreground">
                <p className="font-semibold text-primary mb-1">Check your inbox</p>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  If an account exists for <span className="font-medium text-foreground">{forgotEmail}</span>, password reset instructions and a reset token have been dispatched.
                </p>
              </div>
              <div className="flex flex-col gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setForgotOpen(false);
                    setResetOpen(true);
                  }}
                  className="ga-cta text-sm py-2"
                >
                  Enter Reset Token
                </button>
                <button
                  type="button"
                  onClick={() => setForgotOpen(false)}
                  className="text-xs text-muted-foreground hover:text-foreground text-center py-1"
                >
                  Close
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleForgotPasswordSubmit} className="space-y-4 py-2">
              <div className="space-y-2">
                <label htmlFor="forgot-email" className="text-xs font-semibold text-foreground">
                  Registered Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    id="forgot-email"
                    type="email"
                    required
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="citizen@govai.gov"
                    className="w-full pl-9 pr-3 py-2 rounded-lg bg-card/80 border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="ga-cta text-sm py-2 flex items-center justify-center gap-2"
                >
                  {forgotLoading ? "Dispatching..." : "Send Reset Instructions"}
                  {!forgotLoading && <ArrowRight size={14} />}
                </button>
                <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setForgotOpen(false);
                      setResetOpen(true);
                    }}
                    className="text-primary hover:underline"
                  >
                    Already have a token?
                  </button>
                  <button
                    type="button"
                    onClick={() => setForgotOpen(false)}
                    className="hover:text-foreground"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-primary" />
              Set New Password
            </DialogTitle>
            <DialogDescription>
              Enter your reset token and your new account password.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleResetPasswordSubmit} className="space-y-4 py-2">
            {resetError && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive">
                {resetError}
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="reset-token" className="text-xs font-semibold text-foreground">
                Reset Token
              </label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  id="reset-token"
                  type="text"
                  required
                  value={resetToken}
                  onChange={(e) => setResetToken(e.target.value)}
                  placeholder="Paste 64-character token"
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-card/80 border border-border text-foreground text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="reset-new-password" className="text-xs font-semibold text-foreground">
                New Password (min 6 characters)
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  id="reset-new-password"
                  type={showResetPw ? "text" : "password"}
                  required
                  minLength={6}
                  value={resetPasswordVal}
                  onChange={(e) => setResetPasswordVal(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-10 py-2 rounded-lg bg-card/80 border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <button
                  type="button"
                  onClick={() => setShowResetPw(!showResetPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showResetPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="reset-confirm-password" className="text-xs font-semibold text-foreground">
                Confirm New Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  id="reset-confirm-password"
                  type={showResetPw ? "text" : "password"}
                  required
                  minLength={6}
                  value={resetConfirmVal}
                  onChange={(e) => setResetConfirmVal(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-card/80 border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <button
                type="submit"
                disabled={resetLoading}
                className="ga-cta text-sm py-2 flex items-center justify-center gap-2"
              >
                {resetLoading ? "Updating Password..." : "Update Password"}
                {!resetLoading && <CheckCircle2 size={14} />}
              </button>
              <button
                type="button"
                onClick={() => setResetOpen(false)}
                className="text-xs text-muted-foreground hover:text-foreground text-center py-1"
              >
                Cancel
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};

/* ─── static sub-components ─── */
const SocialDivider = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "16px 0", fontSize: "0.72rem", color: "#374151" }}>
    <span style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }} />
    or continue with
    <span style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }} />
  </div>
);

const SocialRow: React.FC<{ toast: ReturnType<typeof useToast>["toast"] }> = ({ toast }) => {
  const [hovG, setHovG] = React.useState(false);
  const [hovA, setHovA] = React.useState(false);
  const btn = (hov: boolean) => ({
    flex: 1, display: "flex" as const, alignItems: "center" as const, justifyContent: "center" as const, gap: 6,
    padding: "9px 8px", borderRadius: 10, fontFamily: "inherit",
    fontSize: "0.82rem", fontWeight: 600, cursor: "pointer",
    border: hov ? "1px solid rgba(59,130,246,0.35)" : "1px solid rgba(255,255,255,0.08)",
    background: hov ? "rgba(59,130,246,0.06)" : "rgba(255,255,255,0.03)",
    color: hov ? "#fff" : "#94A3B8",
    boxShadow: hov ? "0 0 10px rgba(59,130,246,0.1)" : "none",
    transition: "all 0.2s",
  });
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <button type="button" onClick={() => toast({ title: "Google login", description: "OAuth coming soon." })}
        onMouseEnter={() => setHovG(true)} onMouseLeave={() => setHovG(false)} style={btn(hovG)}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
        </svg>
        Google
      </button>
      <button type="button" onClick={() => toast({ title: "Apple login", description: "OAuth coming soon." })}
        onMouseEnter={() => setHovA(true)} onMouseLeave={() => setHovA(false)} style={btn(hovA)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
        </svg>
        Apple
      </button>
    </div>
  );
};

const TermsFooter = () => (
  <p style={{ marginTop: 14, textAlign: "center", fontSize: "0.7rem", color: "#374151", lineHeight: 1.6 }}>
    By continuing, you agree to GovAI Resolve's{" "}
    <a href="#" style={{ color: "#3B82F6", textDecoration: "none" }}>Terms</a>
    {" "}and{" "}
    <a href="#" style={{ color: "#3B82F6", textDecoration: "none" }}>Privacy Policy</a>.
  </p>
);

export default AuthPage;
