# GovAI Project Structure & Architecture Audit

**Audit Date:** October 31, 2026  
**Auditor:** Senior Software Architect, Backend/Frontend Engineer & Application Security Auditor  
**Audit Scope:** Read-Only Complete Structural Audit  
**Target:** GovAI Resolve Application (Monorepo: `backend/` and `frontend/`)

---

## 1. Directory Tree & Inventory

The repository is structured as a dual-tier client-server application without a formal monorepo orchestration tool (e.g., Turborepo, Nx, or pnpm workspaces). The root contains two independent project folders: `backend/` (Node.js/Express/Mongoose) and `frontend/` (React 18/TypeScript/Vite/Tailwind CSS/Radix UI).

```
.
├── backend/
│   ├── backups/
│   │   ├── backup_20261030114105./
│   │   └── backup_20261030141147./
│   ├── scripts/
│   │   ├── check-officer-accounts.js
│   │   ├── check-officer-detail-blocker.js
│   │   ├── check-unlinked-officers.js
│   │   ├── create-department-authorities.js
│   │   ├── debug-officer-dashboard.js
│   │   ├── demoAccounts.js
│   │   ├── ensure-demo-accounts.js
│   │   ├── inspect-database.js
│   │   ├── inspect-demo-state.js
│   │   ├── inspect-officer-database.js
│   │   ├── inspect-officer-state.js
│   │   ├── link-remaining-officers.js
│   │   ├── prepare-local-demo-db.js
│   │   ├── reset-all-demo-passwords.js
│   │   ├── run-officer-dashboard-audit.js
│   │   ├── run-officer-link-audit.js
│   │   ├── test-all-demo-logins.js
│   │   ├── update-demo-passwords.js
│   │   ├── verify-authority-hierarchy.js
│   │   ├── verify-demo-auth-endpoints.js
│   │   ├── verify-demo-environment.js
│   │   ├── verify-demo-passwords.js
│   │   └── verify-officer-dashboard.js
│   ├── src/
│   │   ├── config/
│   │   │   ├── cors.js
│   │   │   ├── db.js
│   │   │   └── sla.js
│   │   ├── controllers/
│   │   │   ├── assistant.controller.js
│   │   │   ├── auth.controller.js
│   │   │   ├── complaint.controller.js
│   │   │   ├── feedback.controller.js
│   │   │   ├── member.controller.js
│   │   │   └── notification.controller.js
│   │   ├── middleware/
│   │   │   ├── auth.middleware.js
│   │   │   ├── error.middleware.js
│   │   │   ├── role.middleware.js
│   │   │   └── upload.middleware.js
│   │   ├── models/
│   │   │   ├── Complaint.js
│   │   │   ├── Feedback.js
│   │   │   ├── Member.js
│   │   │   ├── Notification.js
│   │   │   └── User.js
│   │   ├── routes/
│   │   │   ├── assistant.routes.js
│   │   │   ├── auth.routes.js
│   │   │   ├── complaint.routes.js
│   │   │   ├── feedback.routes.js
│   │   │   ├── member.routes.js
│   │   │   └── notification.routes.js
│   │   ├── scripts/          <-- EMPTY DIRECTORY
│   │   ├── seed/
│   │   │   ├── .cph/         <-- VESTIGIAL VSCODE EXTENSION FOLDER
│   │   │   │   └── .seedAdmin.js.cph-history
│   │   │   └── seedAdmin.js
│   │   ├── services/
│   │   │   ├── complaintAccess.service.js
│   │   │   ├── complaintNotification.service.js
│   │   │   ├── complaintWorkflow.service.js
│   │   │   ├── gemini.service.js
│   │   │   ├── memberMapping.service.js
│   │   │   ├── notificationSocket.service.js
│   │   │   ├── slaEscalation.service.js
│   │   │   └── sla.service.js
│   │   ├── app.js
│   │   └── server.js
│   ├── test/
│   │   ├── admin-authority-hierarchy.test.js
│   │   ├── auth-role-mapping.test.js
│   │   ├── complaint-access-control.test.js
│   │   ├── member-mapping.test.js
│   │   ├── notification-lifecycle.test.js
│   │   ├── officer-dashboard-scenarios.test.js
│   │   └── sla-lifecycle.test.js
│   ├── .env
│   ├── .gitignore
│   ├── package.json
│   └── package-lock.json
├── frontend/
│   ├── public/
│   │   ├── favicon.ico
│   │   ├── placeholder.svg
│   │   └── robots.txt
│   ├── src/
│   │   ├── components/
│   │   │   ├── shared/
│   │   │   │   ├── ApiErrorPanel.tsx
│   │   │   │   ├── NotificationDropdown.tsx
│   │   │   │   └── StatusBadge.tsx
│   │   │   ├── ui/ (28 Radix/Tailwind component primitives)
│   │   │   ├── DashboardLayout.tsx
│   │   │   └── NavLink.tsx       <-- DEAD / UNUSED COMPONENT
│   │   ├── contexts/
│   │   │   ├── AuthContext.tsx
│   │   │   ├── NotificationContext.tsx
│   │   │   ├── SafeNotificationContext.tsx
│   │   │   └── ThemeContext.tsx
│   │   ├── data/                 <-- EMPTY DIRECTORY
│   │   ├── hooks/
│   │   │   ├── use-mobile.tsx
│   │   │   └── use-toast.ts
│   │   ├── lib/
│   │   │   └── utils.ts
│   │   ├── pages/
│   │   │   ├── admin/
│   │   │   │   ├── AdminDashboard.tsx
│   │   │   │   ├── AIInsights.tsx
│   │   │   │   ├── AnalyticsDashboard.tsx   <-- UNROUTED / DEAD CODE (355 lines)
│   │   │   │   ├── AuthorityApprovals.tsx
│   │   │   │   ├── AuthorityPerformance.tsx <-- UNROUTED / DEAD CODE (131 lines)
│   │   │   │   ├── HeatmapView.tsx          <-- UNROUTED / DEAD CODE (197 lines)
│   │   │   │   └── UserManagement.tsx
│   │   │   ├── assistant/
│   │   │   │   └── AssistantPage.tsx
│   │   │   ├── auth/
│   │   │   │   ├── AuthPage.tsx
│   │   │   │   └── PendingApprovalPage.tsx
│   │   │   ├── authority/
│   │   │   │   ├── AuthorityDashboard.tsx
│   │   │   │   ├── ComplaintDetail.tsx
│   │   │   │   ├── DepartmentAnalytics.tsx
│   │   │   │   ├── MemberManagement.tsx
│   │   │   │   └── OfficerDashboard.tsx
│   │   │   ├── citizen/
│   │   │   │   ├── CitizenDashboard.tsx
│   │   │   │   ├── CitizenProfile.tsx
│   │   │   │   ├── CitizenReport.tsx
│   │   │   │   └── TrackComplaint.tsx
│   │   │   ├── notifications/
│   │   │   │   └── NotificationCenterPage.tsx
│   │   │   ├── Index.tsx                    <-- DEAD / UNUSED COMPONENT (5 lines)
│   │   │   ├── LandingPage.tsx
│   │   │   └── NotFound.tsx
│   │   ├── services/
│   │   │   ├── adminApi.ts
│   │   │   ├── apiClient.ts
│   │   │   ├── assistantApi.ts
│   │   │   ├── authApi.ts
│   │   │   ├── complaintsApi.ts
│   │   │   ├── notificationService.ts
│   │   │   └── runtimeData.js               <-- LEGACY MOCK UTILITY (174 lines)
│   │   ├── types/
│   │   │   ├── admin.ts
│   │   │   ├── complaint.ts
│   │   │   ├── notifications.ts
│   │   │   └── user.ts
│   │   ├── App.css
│   │   ├── App.tsx
│   │   ├── index.css
│   │   ├── main.tsx
│   │   └── vite-env.d.ts
│   ├── bun.lock                             <-- VESTIGIAL LOCKFILE
│   ├── fix_cards.py                         <-- VESTIGIAL PYTHON SCRIPT
│   ├── fix_complaint.py                     <-- VESTIGIAL PYTHON SCRIPT
│   ├── fix_profile.py                       <-- VESTIGIAL PYTHON SCRIPT
│   ├── fix_remaining.py                     <-- VESTIGIAL PYTHON SCRIPT
│   ├── gitignore.txt                        <-- STRAY FILE
│   ├── revert_cards.py                      <-- VESTIGIAL PYTHON SCRIPT
│   ├── .env
│   ├── .gitignore
│   ├── package.json
│   ├── package-lock.json
│   ├── tsconfig.json
│   ├── tsconfig.app.json
│   ├── tsconfig.node.json
│   └── vite.config.ts
└── package-lock.json                        <-- ORPHANED ROOT LOCKFILE (83 bytes)
```

---

## 2. Configuration & Build Audit

### 2.1 Backend Package & Dependencies
- **Runtime Environment:** Node.js v20+, CommonJS modules (`"type"` not set, `.js` interpreted as CommonJS).
- **Core Dependencies:**
  - `express`: ^4.19.2
  - `mongoose`: ^8.5.1
  - `cors`: ^2.8.5
  - `dotenv`: ^16.4.5
  - `jsonwebtoken`: ^9.0.2
  - `bcryptjs`: ^2.4.3
  - `socket.io`: ^4.7.5
  - `multer`: ^1.4.5-lts.1
  - `@google/genai`: ^0.1.1 (Gemini API)
- **Vulnerabilities (`npm audit`):**
  - **1 Critical**: `proxy-addr` (IP address spoofing via improper parsing).
  - **4 High**: `body-parser` (URL-encoded body limit bypass / memory exhaust), `brace-expansion`, `js-yaml`, `lodash`.
  - **15 Moderate**: Express subdependencies.
- **Scripts:**
  - `start`: `node src/server.js`
  - `dev`: `nodemon src/server.js`
  - `test`: `node --test test` (Node built-in test runner)
  - `lint`: `eslint .` (Fails with Exit Code 2 because no ESLint configuration file exists in `backend/`).
  - `seed:demo`: `node src/seed/seedAdmin.js` (CRITICAL DANGER: Seeds outdated authority records with obsolete passwords; would wipe demo DB integrity).

### 2.2 Frontend Package & Dependencies
- **Build System:** Vite 5.3.3, TypeScript 5.2.2.
- **UI Frameworks:** React 18.3.1, Tailwind CSS 3.4.4, Radix UI suite, Lucide React 0.395.0.
- **Data & Visualization:** Lucide icons, Recharts 2.12.7, Socket.io-client 4.7.5.
- **Test Runner:** Vitest 1.6.0.
- **Vulnerabilities (`npm audit`):**
  - **2 Critical**: `tinypool` (Prototype pollution leading to remote code execution).
  - **4 High**: `source-map-js`, `undici`, `vite`, `zod`.
  - **17 Moderate**: Vite & build plugin dependencies.
- **Build Verification:**
  - `npx tsc --noEmit` passes with 0 errors.
  - `npx eslint .` passes with 0 errors and 13 Fast Refresh component warnings.
  - `npx vitest run` passes with 28/28 tests across 7 test suites.

---

## 3. Architecture & Data Flow

```
[Citizen / Authority / Officer Client]
                │
                ▼
      [Frontend React SPA]
  ┌─────────────┴─────────────┐
  ▼                           ▼
[REST Client: Axios]   [WebSocket: Socket.IO]
  │                           │
  ▼                           ▼
[Express Server: 5000] ───► [Socket Rooms: userId]
  │
  ├──► [auth.middleware (JWT Verification)]
  ├──► [role.middleware (Role & DepartmentRole Check)]
  │
  ▼
[Controllers & Services]
  ├── auth.controller.js
  ├── complaint.controller.js ───► complaintWorkflow.service.js
  │                           ───► complaintAccess.service.js
  │                           ───► sla.service.js
  ├── member.controller.js   ───► memberMapping.service.js
  └── notification.controller.js ─► complaintNotification.service.js
                                   └──► notificationSocket.service.js
  │
  ▼
[MongoDB: Mongoose Schemas]
  ├── users (roles: citizen, department, admin; departmentRole: authority | officer)
  ├── members (userId ref, department, role: Field Officer / Supervisor, status)
  ├── complaints (assignedTo ref Member, category, priority, status)
  ├── notifications (userId ref User, dedupeKey, isRead, link)
  └── feedbacks (complaintId, rating, comments)
```

---

## 4. Key Structural Discrepancies & Issues

1. **Missing Backend ESLint Configuration**:
   - `npm run lint` inside `backend/` terminates immediately with:
     `Oops! Something went wrong! :( ESLint couldn't find a configuration file.`
   - No `.eslintrc.json` or `eslint.config.js` is present in the `backend/` directory.

2. **Empty Directories**:
   - `backend/src/scripts/` (0 files). The real backend maintenance scripts are located in `backend/scripts/`.
   - `frontend/src/data/` (0 files).

3. **Orphaned Root Lockfile**:
   - A 83-byte `package-lock.json` exists in the repository root containing empty packages, while the root has no `package.json`.

4. **Stray Backup Folders with Trailing Dot Syntax**:
   - `backend/backups/backup_20261030114105./`
   - `backend/backups/backup_20261030141147./`
   - These folders cause potential traversal issues on certain Linux/Unix and Windows shells.

5. **Vestigial Developer Artifacts**:
   - `frontend/fix_cards.py`, `frontend/fix_complaint.py`, `frontend/fix_profile.py`, `frontend/fix_remaining.py`, `frontend/revert_cards.py`.
   - `frontend/gitignore.txt`.
   - `frontend/bun.lock` (project uses npm).
   - `backend/src/seed/.cph/` (VSCode competitive programming extension metadata).

