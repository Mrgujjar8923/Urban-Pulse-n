# GovAI Backend & Frontend Errors and Defect Catalog

**Audit Date:** October 31, 2026  
**Auditor:** Senior Software Architect, Backend/Frontend Engineer & Application Security Auditor  
**Document:** Technical Root-Cause Defect Catalog

---

## 1. Backend Defects & Deficiencies

### 1.1 Defect B-01: Missing Backend ESLint Configuration
- **Location:** `backend/package.json` line 10 (`"lint": "eslint ."`)
- **Symptom:** Executing `npm run lint` inside `backend/` exits with status code 2:
  `Oops! Something went wrong! :( ESLint couldn't find a configuration file.`
- **Root Cause:** No `.eslintrc.json`, `.eslintrc.js`, or `eslint.config.js` exists in the `backend/` directory.
- **Impact:** Backend static analysis cannot be run in automated CI/CD pipelines or locally.
- **Severity:** Medium (Tooling / CI blocker).

### 1.2 Defect B-02: Missing MongoDB Query Indexes on High-Traffic Collections
- **Location:** `backend/src/models/Complaint.js`, `backend/src/models/Notification.js`
- **Symptom:** As complaint records grow, queries experience linear degradation ($O(N)$ full table scans).
- **Missing Indexes:**
  - `Complaint.js`:
    - `{ category: 1, status: 1 }` (Used heavily by Authority Dashboard and Department lists)
    - `{ assignedTo: 1, status: 1 }` (Used heavily by Officer Dashboard: `Complaint.find({ assignedTo: officer.memberId })`)
    - `{ createdBy: 1, createdAt: -1 }` (Used heavily by Citizen Dashboard)
    - `{ createdAt: -1 }` (Used for global activity timelines)
  - `Notification.js`:
    - Only `dedupeKey` has an index.
    - Missing `{ userId: 1, createdAt: -1 }` and `{ userId: 1, isRead: 1 }`. Every single notification fetch runs a collection scan across all users' notifications.
- **Severity:** High (Performance & Scalability).

### 1.3 Defect B-03: `auth.controller.js` Rejects Direct Invocations with `role: "officer"`
- **Location:** `backend/src/controllers/auth.controller.js`, line 164
- **Code:**
  ```javascript
  const requestedRole = role === "authority" ? "department" : role;
  ```
- **Symptom:** Any external API client, automation script, or mobile client sending `{ role: "officer" }` receives HTTP 403: *"This account is registered as department. Please select the correct portal."*
- **Root Cause:** The mapping does not normalize `"officer"` to `"department"`.
- **Severity:** Medium (API consistency & compatibility).

### 1.4 Defect B-04: Outdated & Dangerous Seed Script (`seedAdmin.js`)
- **Location:** `backend/src/seed/seedAdmin.js` and `backend/package.json` (`"seed:demo": "node src/seed/seedAdmin.js"`)
- **Symptom:** Running `npm run seed:demo` wrecks the local database demo state:
  - Uses outdated email formats (`road.authority@govai.gov` instead of `authority@demo.com`).
  - Missing Electricity and Environment authority accounts.
  - Seeds weak plaintext passwords (`admin123`, `roadAuthority123`).
  - Lacks Member mapping generation for Field Officers.
- **Severity:** High (Operational & Data Integrity Risk).

### 1.5 Defect B-05: High and Critical Vulnerabilities in Production Dependencies
- **Location:** `backend/package.json`
- **Details:**
  - `proxy-addr` (Critical): Vulnerable to spoofed client IP addresses if behind a reverse proxy.
  - `body-parser` (High): Potential denial of service / memory exhaustion on malformed request bodies.
  - `lodash` (High): Prototype pollution.
- **Severity:** High (Security).

### 1.6 Defect B-06: Malformed Trailing-Dot Directory Names in Backups
- **Location:** `backend/backups/backup_20261030114105./` and `backup_20261030141147./`
- **Symptom:** Folders ending in a literal period (`.`) violate POSIX/Windows filesystem conventions and break standard recursive backup tools (e.g. `rsync`, tar, Windows Explorer).
- **Severity:** Low (Filesystem hygiene).

---

## 2. Frontend Defects & Deficiencies

### 2.1 Defect F-01: Critical UI Crash in `ComplaintDetail.tsx` for Officers
- **Location:** `frontend/src/pages/authority/ComplaintDetail.tsx` (lines 95–104)
- **Code:**
  ```typescript
  const [complaintRes, membersRes] = await Promise.all([
    apiClient.get(`/api/complaints/${id}`),
    membersApi.list(),
  ]);
  ```
- **Symptom:** When a Field Officer clicks any assigned complaint to view details, the screen fails to load and displays: *"Unable to load this complaint."*
- **Root Cause:**
  - Field Officers have valid authorization to fetch their complaint: `apiClient.get(/api/complaints/${id})` succeeds with HTTP 200.
  - However, `membersApi.list()` calls `GET /api/members`, which backend `member.controller.js` explicitly blocks for officers:
    `if (!isAuthorityOrAdmin(req.user)) return res.status(403).json({ message: "Department member lists are restricted to authorities" });`
  - Because `Promise.all` fails fast on unhandled rejections, the entire loader aborts.
- **Fix Required:** Wrap `membersApi.list()` in a fallback catch or skip fetching members when `user.departmentRole === "officer"` (officers cannot reassign members anyway).
- **Severity:** CRITICAL (Blocks primary officer functionality).

### 2.2 Defect F-02: Manual Officer Login Blocked by Demo Button Hijacking
- **Location:** `frontend/src/pages/auth/AuthPage.tsx` (lines 940–968)
- **Symptom:** A real or newly created Field Officer cannot type their credentials and select their department to sign in.
- **Root Cause:**
  - Under the `"officer"` tab, the UI renders four buttons for departments.
  - Clicking any department button immediately executes `startDemoLogin()`, overwriting input fields with demo credentials and logging in automatically.
  - Leaving the buttons unclicked and clicking "Sign In" displays: *"Select your department before signing in."*
- **Severity:** High (Blocks production user onboarding & non-demo officer authentication).

### 2.3 Defect F-03: Notification Navigation 404 Routing Mismatches
- **Location:** `frontend/src/contexts/NotificationContext.tsx`
- **Symptom:** Clicking notification cards or action links routes users to 404 "Page Not Found":
  - Fallback link for authority insights: `/department/ai-insights` (Does not exist in `App.tsx`).
  - Fallback link for department complaints: `/department/complaints` (Does not exist without ID; valid route is `/department/assigned` or `/department/dashboard`).
  - Fallback link for admin complaints: `/admin/complaints` (Does not exist in `App.tsx`).
  - Fallback link for admin feedback: `/admin/feedback` (Does not exist in `App.tsx`).
  - Admin notification hydration: If `user.role === "admin"`, complaint notifications route to `/citizen/complaints/${complaintId}` instead of `/admin/dashboard`.
- **Severity:** Medium (Broken user navigation).

### 2.4 Defect F-04: Legacy Mock Data Helper Injected into Live Component
- **Location:** `frontend/src/components/shared/NotificationDropdown.tsx`
- **Code:**
  ```javascript
  import { getLocalNotifications, saveLocalNotifications } from "../../services/runtimeData";
  const LOCAL_USER_ID = "user1";
  ```
- **Symptom:** Mixes real backend notifications from `NotificationContext` with local storage prototype state using a hardcoded dummy user ID (`user1`).
- **Severity:** Low (Code quality / prototype relic).

### 2.5 Defect F-05: Ineffective Error Handling in `SafeNotificationContext.tsx`
- **Location:** `frontend/src/contexts/SafeNotificationContext.tsx`
- **Code:**
  ```tsx
  export const SafeNotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    try {
      return <NotificationProvider>{children}</NotificationProvider>;
    } catch (e) {
      console.warn("NotificationProvider crashed; falling back to null", e);
      return <>{children}</>;
    }
  };
  ```
- **Symptom:** Does not prevent React render errors.
- **Root Cause:** Standard JavaScript `try/catch` cannot catch rendering or lifecycle errors thrown inside React child components during reconciliation. Only a Class component with `componentDidCatch` or `getDerivedStateFromError` acts as an Error Boundary.
- **Severity:** Low (False sense of resilience).

### 2.6 Defect F-06: 13 Fast Refresh ESLint Warnings in UI Components
- **Location:** UI primitives (`badge.tsx`, `button.tsx`, `form.tsx`, etc.) and Contexts.
- **Symptom:** `react-refresh/only-export-components` warnings on exported helper functions and variants alongside React components.
- **Severity:** Low (Developer experience).

