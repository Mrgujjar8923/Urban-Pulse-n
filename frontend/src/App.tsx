import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { SafeNotificationProvider } from "@/contexts/SafeNotificationContext";
import { departmentDashboardForRole, homePathForRole, isDepartmentRoleAllowed } from "@/lib/departmentAccess";
import { Loader2 } from "lucide-react";

// Route-level lazy loading for performance optimization (Phase 7E.5)
const Landing = React.lazy(() => import("./pages/Landing"));
const Login = React.lazy(() => import("./pages/auth/Login"));
const Signup = React.lazy(() => import("./pages/auth/Signup"));
const NotFound = React.lazy(() => import("./pages/NotFound"));

// Citizen pages
const CitizenDashboard = React.lazy(() => import("./pages/citizen/CitizenDashboard"));
const RaiseComplaint = React.lazy(() => import("./pages/citizen/RaiseComplaint"));
const MyComplaints = React.lazy(() => import("./pages/citizen/MyComplaints"));
const ComplaintDetail = React.lazy(() => import("./pages/citizen/ComplaintDetail"));
const FeedbackForm = React.lazy(() => import("./pages/citizen/FeedbackForm"));

// Department Authority & Officer pages
const DepartmentDashboard = React.lazy(() => import("./pages/authority/AuthorityDashboard"));
const OfficerDashboard = React.lazy(() => import("./pages/authority/OfficerDashboard"));
const FeedbackReceived = React.lazy(() => import("./pages/authority/FeedbackReceived"));
const AssignedComplaints = React.lazy(() => import("./pages/authority/Assigned"));
const AuthorityComplaintDetail = React.lazy(() => import("./pages/authority/ComplaintDetail"));
const Members = React.lazy(() => import("./pages/authority/Members"));
const OfficerPerformance = React.lazy(() => import("./pages/authority/OfficerPerformance"));

// Admin pages
const AdminDashboard = React.lazy(() => import("./pages/admin/AdminDashboard"));
const AdminComplaints = React.lazy(() => import("./pages/admin/AdminComplaints"));
const AnalyticsDashboard = React.lazy(() => import("./pages/admin/AnalyticsDashboard"));
const DepartmentPerformance = React.lazy(() => import("./pages/admin/DepartmentPerformance"));
const AdminDepartments = React.lazy(() => import("./pages/admin/AdminDepartments"));
const HeatmapView = React.lazy(() => import("./pages/admin/HeatmapView"));
const AdminFeedback = React.lazy(() => import("./pages/admin/AdminFeedback"));
const AdminReports = React.lazy(() => import("./pages/admin/AdminReports"));
const AIInsights = React.lazy(() => import("./pages/admin/AIInsights"));
const UserManagement = React.lazy(() => import("./pages/admin/UserManagement"));
const AuthorityApprovals = React.lazy(() => import("./pages/admin/AuthorityApprovals"));

// Shared & Assistant pages
const ProfileSettings = React.lazy(() => import("./components/shared/ProfileSettings"));
const NotificationsPage = React.lazy(() => import("./pages/Notifications"));
const AssistantPage = React.lazy(() => import("./pages/Assistant"));
const Chatbot = React.lazy(() => import("./components/shared/Chatbot"));

const queryClient = new QueryClient();

export const RouteLoadingFallback: React.FC = () => (
  <div
    role="status"
    aria-label="Loading page"
    className="flex min-h-[50vh] w-full items-center justify-center py-12"
  >
    <div className="flex flex-col items-center gap-3">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <span className="text-sm font-medium text-muted-foreground">Loading...</span>
    </div>
  </div>
);

const SuspenseWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <React.Suspense fallback={<RouteLoadingFallback />}>
    {children}
  </React.Suspense>
);

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("App Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "20px", fontFamily: "sans-serif", color: "red" }}>
          <h1>Application Error</h1>
          <p>{this.state.error?.message}</p>
          <pre style={{ fontSize: "12px", overflow: "auto" }}>{this.state.error?.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

export const ProtectedRoute: React.FC<{ children: React.ReactNode; roles?: string[] }> = ({ children, roles }) => {
  const { user, isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (roles && user && !roles.includes(user.role)) return <Navigate to={homePathForRole(user.role)} replace />;
  return <>{children}</>;
};

const DepartmentDashboardSwitch: React.FC = () => {
  const { user } = useAuth();
  const dashboard = departmentDashboardForRole(user?.departmentRole);
  if (dashboard === "authority") return <DepartmentDashboard />;
  if (dashboard === "officer") return <OfficerDashboard />;
  return <Navigate to="/" replace />;
};

const DepartmentRoleRoute: React.FC<{ children: React.ReactNode; roles: Array<"authority" | "officer"> }> = ({ children, roles }) => {
  const { user } = useAuth();
  if (!isDepartmentRoleAllowed(user?.departmentRole, roles)) return <Navigate to="/department" replace />;
  return <>{children}</>;
};

const AppRoutes = () => {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  const isAssistantRoute =
    location.pathname === "/citizen/assistant" ||
    location.pathname === "/department/assistant" ||
    location.pathname === "/admin/assistant";

  return (
    <>
      <React.Suspense fallback={<RouteLoadingFallback />}>
        <Routes>
          <Route path="/" element={<SuspenseWrapper><Landing /></SuspenseWrapper>} />
          <Route path="/login" element={<SuspenseWrapper><Login /></SuspenseWrapper>} />
          <Route path="/signup" element={<SuspenseWrapper><Signup /></SuspenseWrapper>} />

          {/* Citizen routes */}
          <Route path="/citizen" element={<ProtectedRoute roles={["citizen"]}><DashboardLayout><SuspenseWrapper><CitizenDashboard /></SuspenseWrapper></DashboardLayout></ProtectedRoute>} />
          <Route path="/citizen/new" element={<ProtectedRoute roles={["citizen"]}><DashboardLayout><SuspenseWrapper><RaiseComplaint /></SuspenseWrapper></DashboardLayout></ProtectedRoute>} />
          <Route path="/citizen/raise-complaint" element={<ProtectedRoute roles={["citizen"]}><Navigate to="/citizen/new" replace /></ProtectedRoute>} />
          <Route path="/citizen/complaints" element={<ProtectedRoute roles={["citizen"]}><DashboardLayout><SuspenseWrapper><MyComplaints /></SuspenseWrapper></DashboardLayout></ProtectedRoute>} />
          <Route path="/citizen/complaints/:id" element={<ProtectedRoute roles={["citizen", "admin"]}><DashboardLayout><SuspenseWrapper><ComplaintDetail /></SuspenseWrapper></DashboardLayout></ProtectedRoute>} />
          <Route path="/citizen/complaints/:id/feedback" element={<ProtectedRoute roles={["citizen"]}><DashboardLayout><SuspenseWrapper><FeedbackForm /></SuspenseWrapper></DashboardLayout></ProtectedRoute>} />
          <Route path="/citizen/profile" element={<ProtectedRoute roles={["citizen"]}><DashboardLayout><SuspenseWrapper><ProfileSettings /></SuspenseWrapper></DashboardLayout></ProtectedRoute>} />
          <Route path="/citizen/assistant" element={<ProtectedRoute roles={["citizen"]}><DashboardLayout><SuspenseWrapper><AssistantPage /></SuspenseWrapper></DashboardLayout></ProtectedRoute>} />

          {/* Department routes */}
          <Route path="/department" element={<ProtectedRoute roles={["authority"]}><DashboardLayout><SuspenseWrapper><DepartmentDashboardSwitch /></SuspenseWrapper></DashboardLayout></ProtectedRoute>} />
          <Route path="/department/assigned" element={<ProtectedRoute roles={["authority"]}><DepartmentRoleRoute roles={["authority"]}><DashboardLayout><SuspenseWrapper><AssignedComplaints /></SuspenseWrapper></DashboardLayout></DepartmentRoleRoute></ProtectedRoute>} />
          <Route path="/department/my-assigned" element={<ProtectedRoute roles={["authority"]}><DepartmentRoleRoute roles={["officer"]}><DashboardLayout><SuspenseWrapper><OfficerDashboard /></SuspenseWrapper></DashboardLayout></DepartmentRoleRoute></ProtectedRoute>} />
          <Route path="/department/complaints/:id" element={<ProtectedRoute roles={["authority"]}><DepartmentRoleRoute roles={["authority", "officer"]}><DashboardLayout><SuspenseWrapper><AuthorityComplaintDetail /></SuspenseWrapper></DashboardLayout></DepartmentRoleRoute></ProtectedRoute>} />
          <Route path="/department/members" element={<ProtectedRoute roles={["authority"]}><DepartmentRoleRoute roles={["authority"]}><DashboardLayout><SuspenseWrapper><Members /></SuspenseWrapper></DashboardLayout></DepartmentRoleRoute></ProtectedRoute>} />
          <Route path="/department/officer-performance" element={<ProtectedRoute roles={["authority"]}><DepartmentRoleRoute roles={["authority"]}><DashboardLayout><SuspenseWrapper><OfficerPerformance /></SuspenseWrapper></DashboardLayout></DepartmentRoleRoute></ProtectedRoute>} />
          <Route path="/department/feedback" element={<ProtectedRoute roles={["authority"]}><DepartmentRoleRoute roles={["authority"]}><DashboardLayout><SuspenseWrapper><FeedbackReceived /></SuspenseWrapper></DashboardLayout></DepartmentRoleRoute></ProtectedRoute>} />
          <Route path="/department/profile" element={<ProtectedRoute roles={["authority"]}><DepartmentRoleRoute roles={["authority", "officer"]}><DashboardLayout><SuspenseWrapper><ProfileSettings /></SuspenseWrapper></DashboardLayout></DepartmentRoleRoute></ProtectedRoute>} />
          <Route path="/department/assistant" element={<ProtectedRoute roles={["authority"]}><DepartmentRoleRoute roles={["authority", "officer"]}><DashboardLayout><SuspenseWrapper><AssistantPage /></SuspenseWrapper></DashboardLayout></DepartmentRoleRoute></ProtectedRoute>} />

          {/* Admin routes */}
          <Route path="/admin" element={<ProtectedRoute roles={["admin"]}><DashboardLayout><SuspenseWrapper><AdminDashboard /></SuspenseWrapper></DashboardLayout></ProtectedRoute>} />
          <Route path="/admin/complaints" element={<ProtectedRoute roles={["admin"]}><DashboardLayout><SuspenseWrapper><AdminComplaints /></SuspenseWrapper></DashboardLayout></ProtectedRoute>} />
          <Route path="/admin/analytics" element={<ProtectedRoute roles={["admin"]}><DashboardLayout><SuspenseWrapper><AnalyticsDashboard /></SuspenseWrapper></DashboardLayout></ProtectedRoute>} />
          <Route path="/admin/department-performance" element={<ProtectedRoute roles={["admin"]}><DashboardLayout><SuspenseWrapper><DepartmentPerformance /></SuspenseWrapper></DashboardLayout></ProtectedRoute>} />
          <Route path="/admin/departments" element={<ProtectedRoute roles={["admin"]}><DashboardLayout><SuspenseWrapper><AdminDepartments /></SuspenseWrapper></DashboardLayout></ProtectedRoute>} />
          <Route path="/admin/authority-performance" element={<ProtectedRoute roles={["admin"]}><Navigate to="/admin/departments" replace /></ProtectedRoute>} />
          <Route path="/admin/heatmap" element={<ProtectedRoute roles={["admin"]}><DashboardLayout><SuspenseWrapper><HeatmapView /></SuspenseWrapper></DashboardLayout></ProtectedRoute>} />
          <Route path="/admin/feedback" element={<ProtectedRoute roles={["admin"]}><DashboardLayout><SuspenseWrapper><AdminFeedback /></SuspenseWrapper></DashboardLayout></ProtectedRoute>} />
          <Route path="/admin/reports" element={<ProtectedRoute roles={["admin"]}><DashboardLayout><SuspenseWrapper><AdminReports /></SuspenseWrapper></DashboardLayout></ProtectedRoute>} />
          <Route path="/admin/users" element={<ProtectedRoute roles={["admin"]}><DashboardLayout><SuspenseWrapper><UserManagement /></SuspenseWrapper></DashboardLayout></ProtectedRoute>} />
          <Route path="/admin/authority-approvals" element={<ProtectedRoute roles={["admin"]}><DashboardLayout><SuspenseWrapper><AuthorityApprovals /></SuspenseWrapper></DashboardLayout></ProtectedRoute>} />
          <Route path="/admin/ai-insights" element={<ProtectedRoute roles={["admin"]}><DashboardLayout><SuspenseWrapper><AIInsights /></SuspenseWrapper></DashboardLayout></ProtectedRoute>} />
          <Route path="/admin/profile" element={<ProtectedRoute roles={["admin"]}><DashboardLayout><SuspenseWrapper><ProfileSettings /></SuspenseWrapper></DashboardLayout></ProtectedRoute>} />
          <Route path="/admin/assistant" element={<ProtectedRoute roles={["admin"]}><DashboardLayout><SuspenseWrapper><AssistantPage /></SuspenseWrapper></DashboardLayout></ProtectedRoute>} />

          <Route path="/notifications" element={<ProtectedRoute><DashboardLayout><SuspenseWrapper><NotificationsPage /></SuspenseWrapper></DashboardLayout></ProtectedRoute>} />

          <Route path="*" element={<SuspenseWrapper><NotFound /></SuspenseWrapper>} />
        </Routes>
      </React.Suspense>
      {isAuthenticated && !isAssistantRoute && (
        <React.Suspense fallback={null}>
          <Chatbot />
        </React.Suspense>
      )}
    </>
  );
};

const App = () => (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <AuthProvider>
                <SafeNotificationProvider>
                  <AppRoutes />
                </SafeNotificationProvider>
              </AuthProvider>
            </BrowserRouter>
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
);

export default App;
