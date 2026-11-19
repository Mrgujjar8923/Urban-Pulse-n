# GovAI Missing, Incomplete, Unused, and Vestigial Files Inventory

**Audit Date:** October 31, 2026  
**Auditor:** Senior Software Architect, Backend/Frontend Engineer & Application Security Auditor  
**Document:** File System Integrity & Dead Code Audit

---

## 1. Missing Expected Files

| File Path | Description | Impact |
|-----------|-------------|--------|
| `backend/.eslintrc.json` (or `eslint.config.js`) | ESLint configuration for backend | `npm run lint` crashes with Exit Code 2. Static analysis cannot run on backend code. |
| `package.json` (root) | Root project orchestration file | Root directory has an 83-byte `package-lock.json` without a `package.json`. |

---

## 2. Empty Directories

| Directory Path | Intended Purpose | Audit Observation |
|----------------|------------------|-------------------|
| `backend/src/scripts/` | Was intended for backend helper scripts | 0 files. Actual maintenance scripts were placed in `backend/scripts/`. |
| `frontend/src/data/` | Was intended for static mock/seed data | 0 files. Unused. |

---

## 3. Unrouted & Dead Code Files in Frontend

The following complete pages and components exist in the repository but are **never imported, referenced, or routed anywhere** in `App.tsx` or `DashboardLayout.tsx`:

### 3.1 `frontend/src/pages/admin/AnalyticsDashboard.tsx` (355 lines)
- **Features Implemented:** Department resolution rate bar charts, category breakdown pie charts, monthly trend graphs, SLA compliance badges, CSV export button, date range picker.
- **Status:** Dead Code. Never registered in `App.tsx`. The Admin navigation only links to `AdminDashboard`, `AIInsights`, `UserManagement`, and `AuthorityApprovals`.
- **Recommendation:** Either wire this page to route `/admin/analytics` and add it to `DashboardLayout.tsx`, or archive it.

### 3.2 `frontend/src/pages/admin/HeatmapView.tsx` (197 lines)
- **Features Implemented:** Geographic complaint clustering, intensity heatmaps, zone-level filters (North, South, East, West), urgency level filters.
- **Status:** Dead Code. Never registered in `App.tsx` or sidebar navigation.
- **Recommendation:** Wire to route `/admin/heatmap` if geospatial visualization is part of product scope, or archive it.

### 3.3 `frontend/src/pages/admin/AuthorityPerformance.tsx` (131 lines)
- **Features Implemented:** Department-by-department SLA performance table, officer workload counts, average response times, authority performance ratings.
- **Status:** Dead Code. Never registered in `App.tsx` or sidebar navigation.
- **Recommendation:** Integrate into Admin dashboard tabs or register at `/admin/performance`.

### 3.4 `frontend/src/pages/Index.tsx` (5 lines)
- **Code:**
  ```tsx
  import LandingPage from "./LandingPage";
  const Index = () => <LandingPage />;
  export default Index;
  ```
- **Status:** Redundant redirect wrapper. `App.tsx` directly imports and renders `<LandingPage />` at route `"/"`. `Index.tsx` is completely unused.

### 3.5 `frontend/src/components/NavLink.tsx` (28 lines)
- **Code:** Custom wrapper around React Router `Link` component.
- **Status:** Dead component. The entire application uses native `Link` from `react-router-dom` directly.

---

## 4. Legacy Mock Files

### 4.1 `frontend/src/services/runtimeData.js` (174 lines)
- **Features:** Early prototype local storage helper that mocks complaints, officers, and notifications using keys like `govai_complaints`, `govai_notifications`, `govai_members`.
- **Status:** Deprecated prototype artifact. However, `frontend/src/components/shared/NotificationDropdown.tsx` still imports `getLocalNotifications` and `saveLocalNotifications` from it, causing ghost state anomalies.
- **Recommendation:** Remove mock functions from `NotificationDropdown.tsx` and delete `runtimeData.js`.

---

## 5. Stray, Vestigial & Non-Standard Files

| File / Folder Path | Type | Issue / Recommendation |
|--------------------|------|------------------------|
| `frontend/fix_cards.py` | Python script (25 lines) | Stray one-off search/replace script from early refactor. Remove. |
| `frontend/fix_complaint.py` | Python script (13 lines) | Stray one-off patch script. Remove. |
| `frontend/fix_profile.py` | Python script (21 lines) | Stray one-off patch script. Remove. |
| `frontend/fix_remaining.py` | Python script (45 lines) | Stray one-off patch script. Remove. |
| `frontend/revert_cards.py` | Python script (26 lines) | Stray one-off patch script. Remove. |
| `frontend/gitignore.txt` | Stray text file (25 lines) | Accidental copy of `.gitignore`. Remove. |
| `frontend/bun.lock` | Bun package lockfile | Repository uses standard `package-lock.json` and `npm`. Remove to avoid tooling confusion. |
| `backend/src/seed/.cph/` | Hidden folder | VSCode Competitive Programming Helper extension cache. Remove. |
| `backend/backups/backup_20261030114105./` | Backup folder | Trailing dot in folder name breaks POSIX/Windows filesystem tooling. Rename or remove. |
| `backend/backups/backup_20261030141147./` | Backup folder | Trailing dot in folder name breaks POSIX/Windows filesystem tooling. Rename or remove. |
| `package-lock.json` (root) | Empty lockfile (83 bytes) | Orphaned lockfile at root without root `package.json`. Remove. |

