# GovAI Recommended Remediation Roadmap & Top 10 Problems

**Audit Date:** October 31, 2026  
**Auditor:** Senior Software Architect, Backend/Frontend Engineer & Application Security Auditor  
**Document:** Prioritized Engineering Roadmap & Top 10 Defect Summary

---

## 1. Top 10 Most Critical Problems Summary

| # | Problem Title | Severity | Root Cause | Files Affected | Recommended Fix | Risk If Left Unaddressed |
|---|---------------|----------|------------|----------------|-----------------|--------------------------|
| 1 | **Field Officer Complaint Detail Crash (403)** | **P0 - Critical** | `ComplaintDetail.tsx` executes `Promise.all([complaint, membersApi.list()])`. Officers are forbidden from listing members (403), crashing the page. | `frontend/src/pages/authority/ComplaintDetail.tsx`, `backend/src/controllers/member.controller.js` | Wrap `membersApi.list()` in a fallback catch or skip member fetching when `user.departmentRole === "officer"`. | Field officers cannot view complaint details, notes, citizen evidence photos, or work on assigned complaints. |
| 2 | **Manual Officer Login Blocked by UI** | **P0 - Critical** | `AuthPage.tsx` officer department buttons are hardcoded to invoke `startDemoLogin()`. No dropdown exists for real officers. | `frontend/src/pages/auth/AuthPage.tsx` | Add a proper department `<select>` dropdown and separate "Demo Login" quick-actions from real credential inputs. | Only hardcoded demo officers can ever log in. New or real officers are permanently locked out of the frontend. |
| 3 | **Direct API Rejection for `role: "officer"`** | **P0 - Critical** | `auth.controller.js` line 164 maps only `"authority"` to `"department"`, leaving `"officer"` as is, which mismatches `user.role === "department"`. | `backend/src/controllers/auth.controller.js` | Update mapping: `const requestedRole = (role === "authority" \|\| role === "officer") ? "department" : role;`. | Any external client, testing script, or mobile app posting `role: "officer"` is rejected with HTTP 403. |
| 4 | **Missing Database Query Indexes** | **P1 - Major** | `Complaint` model has 0 compound indexes for department, assigned officer, or status. `Notification` model lacks indexes on `userId` and `createdAt`. | `backend/src/models/Complaint.js`, `backend/src/models/Notification.js` | Add compound indexes: `{ assignedTo: 1, status: 1 }`, `{ category: 1, status: 1 }`, and `{ userId: 1, createdAt: -1 }`. | Severe database degradation and latency spikes as complaint count exceeds a few hundred records. |
| 5 | **Notification Navigation 404 Routes** | **P1 - Major** | `NotificationContext.tsx` fallback links point to non-existent routes (`/department/ai-insights`, `/admin/complaints`, etc.). | `frontend/src/contexts/NotificationContext.tsx` | Map notification category URLs to valid registered routes (`/department/dashboard`, `/department/assigned`, etc.). | Users clicking notifications land on broken 404 "Page Not Found" screens. |
| 6 | **Outdated & Destructive Seed Script (`seedAdmin.js`)** | **P1 - Major** | Script uses outdated email patterns, weak plaintext passwords, and lacks officer member mapping logic. | `backend/src/seed/seedAdmin.js`, `backend/package.json` | Refactor seed script to align with current demo accounts, role hierarchy, and member mapping. | Running `npm run seed:demo` will corrupt the demo database and break existing logins. |
| 7 | **Missing Backend ESLint Configuration** | **P1 - Major** | `backend/package.json` defines `"lint": "eslint ."`, but no ESLint configuration file exists in `backend/`. | `backend/package.json`, `backend/.eslintrc.json` | Add `.eslintrc.json` extending standard Node.js/Express linting rules. | CI/CD pipelines fail immediately on backend lint step; no static code analysis available for backend. |
| 8 | **Three Unrouted Admin Pages (683 Lines of Dead Code)** | **P2 - Incomplete** | `AnalyticsDashboard.tsx`, `HeatmapView.tsx`, and `AuthorityPerformance.tsx` exist in `frontend/src/pages/admin/` but are never routed in `App.tsx`. | `frontend/src/App.tsx`, `frontend/src/components/DashboardLayout.tsx` | Register routes `/admin/analytics`, `/admin/heatmap`, and `/admin/performance` or formally archive them. | Completed features are unreachable by system administrators. |
| 9 | **Prototype Mock Storage Injected into Live Component** | **P2 - Incomplete** | `NotificationDropdown.tsx` imports from legacy prototype file `runtimeData.js` with hardcoded `LOCAL_USER_ID = "user1"`. | `frontend/src/components/shared/NotificationDropdown.tsx`, `frontend/src/services/runtimeData.js` | Remove `runtimeData.js` imports; bind notification dropdown strictly to `NotificationContext`. Archive `runtimeData.js`. | Ghost mock notifications conflict with live backend notification state. |
| 10 | **High/Critical NPM Vulnerabilities in Backend & Frontend** | **P3 - Security** | Known CVEs in `proxy-addr` (critical IP spoofing), `tinypool` (prototype pollution/RCE), `body-parser`, and `vite`. | `backend/package.json`, `frontend/package.json` | Run targeted updates for vulnerable packages: `npm update proxy-addr body-parser` and `npm update vite tinypool`. | Security risks from IP spoofing and DoS vectors in production. |

---

## 2. Phased Implementation Roadmap

### Phase 1: P0 — Immediate Critical Fixes (Estimated: 2–3 Hours)
*Goal: Restore field officer functionality and unblock manual logins.*
1. **Fix `ComplaintDetail.tsx` (Defect F-01)**:
   - Modify the data loader to conditionally fetch members only when `user.departmentRole !== "officer"`, or wrap `membersApi.list()` in `.catch(() => ({ members: [] }))`.
   - Hide the assignment/reassignment dropdown controls when viewing as an officer (officers cannot assign).
2. **Fix `AuthPage.tsx` Manual Officer Login (Defect F-02)**:
   - Replace the hijacking buttons under the "Officer" tab with a proper department `<select>` dropdown.
   - Separate demo one-click logins into a dedicated "Demo Fast Login" drawer or button section so manual inputs are never overwritten.
3. **Fix Backend Role Mapping for Direct API Invocations (Defect B-03)**:
   - In `backend/src/controllers/auth.controller.js`, update `requestedRole`:
     ```javascript
     const requestedRole = (role === "authority" || role === "officer") ? "department" : role;
     ```

---

### Phase 2: P1 — Major Architectural & Reliability Improvements (Estimated: 3–4 Hours)
*Goal: Guarantee query performance, notification navigation, and CI linting.*
1. **Implement Database Indexes (Defect B-02)**:
   - Add Mongoose indexes to `Complaint.js`:
     - `complaintSchema.index({ assignedTo: 1, status: 1 });`
     - `complaintSchema.index({ category: 1, status: 1 });`
     - `complaintSchema.index({ createdBy: 1, createdAt: -1 });`
   - Add Mongoose indexes to `Notification.js`:
     - `notificationSchema.index({ userId: 1, createdAt: -1 });`
     - `notificationSchema.index({ userId: 1, isRead: 1 });`
2. **Fix Notification Routing Links (Defect F-03)**:
   - Update `CATEGORY_UI_META` in `frontend/src/contexts/NotificationContext.tsx`:
     - Replace `/department/ai-insights` with `/department/dashboard`.
     - Replace `/department/complaints` with `/department/assigned`.
     - Replace `/admin/complaints` with `/admin/dashboard`.
     - Update admin complaint notification hydration to point to an admin view or dashboard modal instead of citizen view.
3. **Add Backend ESLint Configuration (Defect B-01)**:
   - Create `backend/.eslintrc.json` with standard Node.js/ES2022 rules so `npm run lint` passes in CI.
4. **Update `seedAdmin.js` (Defect B-04)**:
   - Refactor `seedAdmin.js` to match the exact accounts, modern password hashes, and active Member mappings configured in the demo database.

---

### Phase 3: P2 — Incomplete Modules & Codebase Cleanup (Estimated: 2–3 Hours)
*Goal: Integrate dead code and clean up prototype relics.*
1. **Integrate or Archive Unrouted Admin Pages (Defect F-07)**:
   - Wire `AnalyticsDashboard.tsx` to route `/admin/analytics` and add link to `DashboardLayout.tsx`.
   - Wire `HeatmapView.tsx` to route `/admin/heatmap` and add link to `DashboardLayout.tsx`.
   - Wire `AuthorityPerformance.tsx` to route `/admin/performance` or embed as a tab in Admin Dashboard.
2. **Decommission Prototype Mock Utility (Defect F-04)**:
   - Remove `runtimeData.js` imports from `NotificationDropdown.tsx`.
   - Migrate any remaining local notification logic directly to `NotificationContext`.
   - Delete `frontend/src/services/runtimeData.js`.
3. **Upgrade Error Boundary in `SafeNotificationContext.tsx` (Defect F-05)**:
   - Replace standard JS `try/catch` with a genuine React Class Error Boundary (`componentDidCatch`).

---

### Phase 4: P3 — Code Quality, Filesystem Hygiene & Security Upgrades (Estimated: 1–2 Hours)
*Goal: Eliminate vestigial files and patch security vulnerabilities.*
1. **Clean Up Filesystem Artifacts**:
   - Delete stray Python scripts: `frontend/fix_cards.py`, `fix_complaint.py`, `fix_profile.py`, `fix_remaining.py`, `revert_cards.py`.
   - Delete `frontend/gitignore.txt` and `frontend/bun.lock`.
   - Delete empty directories: `backend/src/scripts/` and `frontend/src/data/`.
   - Delete orphaned root `package-lock.json`.
   - Rename trailing-dot backup folders in `backend/backups/`.
   - Remove `backend/src/seed/.cph/`.
2. **Dependency Security Updates**:
   - Run targeted updates in backend and frontend to resolve critical/high CVEs without breaking semantic version compatibility.
3. **Resolve Fast Refresh ESLint Warnings**:
   - Move non-component exports from UI primitive files to dedicated utility files.

