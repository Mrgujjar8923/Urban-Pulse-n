# GovAI Exhaustive Edge-Case & Failure Mode Register

**Audit Date:** October 31, 2026  
**Auditor:** Senior Software Architect, Backend/Frontend Engineer & Application Security Auditor  
**Document:** System-Wide Edge-Case & Failure Mode Matrix

---

## 1. Authentication & Registration Edge Cases

| ID | Scenario | Expected Behavior | Actual Behavior | Severity | Risk Status |
|----|----------|-------------------|-----------------|----------|-------------|
| AR-01 | Citizen logs in with valid credentials | Issued token with `role: "citizen"`, redirects to citizen portal | Normal behavior verified | Low | Passed |
| AR-02 | Citizen attempts to login under "Authority" or "Officer" tab | Rejection: `"This account is registered as citizen"` (403) | Handled by `auth.controller.js` line 169 | Medium | Passed |
| AR-03 | Authority logs in under "Officer" tab | Rejection: Authority account lacks active Member record | Handled by `findValidMappingForUser` (403) | Medium | Passed |
| AR-04 | Officer logs in under "Authority" tab | Rejection: Department authority check rejects user with `departmentRole === "officer"` | Handled by `auth.controller.js` line 178 | Medium | Passed |
| AR-05 | User account status is `"pending"` | Login blocked with `"Your account is pending admin approval."` (403) | Handled by `auth.controller.js` line 153 | High | Passed |
| AR-06 | User account status is `"rejected"` | Login blocked with `"Your account has been rejected."` (403) | Handled by `auth.controller.js` line 157 | High | Passed |
| AR-07 | Officer user has no Member record | Login blocked with clear error explaining unlinked member record | Handled by `auth.controller.js` line 192 | High | Passed |
| AR-08 | Officer user linked to Member of different department | Login blocked: department mismatch between User and Member | Handled by `memberMapping.service.js` line 44 | High | Passed |
| AR-09 | Multiple Member records exist for single `userId` | Login blocked: ambiguous mapping detected | Handled by `memberMapping.service.js` line 34 | High | Passed |
| AR-10 | Real officer attempts to sign in via UI (non-demo) | Form permits department selection and submits typed credentials | **FAILED**: UI demo buttons hijack credentials; manual login blocked | High | **OPEN DEFECT** |
| AR-11 | Direct REST client posts `{ role: "officer" }` | Normalized to `"department"` and processed | **FAILED**: Backend compares `"department" !== "officer"` and rejects with 403 | Medium | **OPEN DEFECT** |
| AR-12 | Officer Member status is `"On Leave"` | Login blocked: inactive member cannot act as active field officer | Handled by `memberMapping.service.js` line 47 | Medium | Passed |
| AR-13 | Password hashing on registration/reset | Salt rounds >= 10, bcrypt hash stored | Handled by `User.js` pre-save hook | High | Passed |

---

## 2. Complaint Access & RBAC Edge Cases

| ID | Scenario | Expected Behavior | Actual Behavior | Severity | Risk Status |
|----|----------|-------------------|-----------------|----------|-------------|
| CA-01 | Citizen views own complaint | Allowed (200 OK) | Handled by `complaintAccess.service.js` line 46 | Low | Passed |
| CA-02 | Citizen attempts to view another citizen's complaint | HTTP 403 Forbidden | Blocked by `complaintAccess.service.js` line 49 | Critical | Passed |
| CA-03 | Citizen attempts to update complaint status directly | HTTP 403 Forbidden | `updateComplaintStatus` restricted to authority/officer | Critical | Passed |
| CA-04 | Authority views complaint in their department | Allowed (200 OK) | Handled by `complaintAccess.service.js` line 22 | Low | Passed |
| CA-05 | Authority views complaint of another department | HTTP 403 Forbidden | Blocked by `complaintAccess.service.js` line 26 | Critical | Passed |
| CA-06 | Field Officer views complaint assigned to them | Allowed (200 OK) | Backend returns 200, but **Frontend crashes in `ComplaintDetail.tsx`** | Critical | **OPEN DEFECT** |
| CA-07 | Field Officer views unassigned complaint in their department | HTTP 403 Forbidden | Blocked by `complaintAccess.service.js` line 34 | High | Passed |
| CA-08 | Field Officer views complaint assigned to another officer | HTTP 403 Forbidden | Blocked by `complaintAccess.service.js` line 38 | High | Passed |
| CA-09 | Field Officer views complaint of another department | HTTP 403 Forbidden | Blocked by `complaintAccess.service.js` line 30 | Critical | Passed |
| CA-10 | Admin views any complaint across all departments | Allowed (200 OK) | Handled by `complaintAccess.service.js` line 18 | Low | Passed |
| CA-11 | Querying complaint with non-existent or invalid MongoDB ObjectId | Returns 404 or 400 with structured JSON error | Mongoose validation caught by error middleware | Low | Passed |

---

## 3. Officer Assignment & Complaint Workflow Edge Cases

| ID | Scenario | Expected Behavior | Actual Behavior | Severity | Risk Status |
|----|----------|-------------------|-----------------|----------|-------------|
| WF-01 | Authority assigns unassigned complaint to active Member | Status changes to `"In Progress"`, notifications dispatched to citizen & officer | Handled by `complaintWorkflow.service.js` line 145 | High | Passed |
| WF-02 | Authority attempts to assign complaint to Member of different department | HTTP 400 Bad Request: department mismatch | Blocked by `complaintWorkflow.service.js` line 133 | High | Passed |
| WF-03 | Authority reassigns complaint from Officer A to Officer B | Status updated, notifications dispatched to citizen, Officer A, and Officer B | Handled by `complaintNotification.service.js` | Medium | Passed |
| WF-04 | Authority assigns complaint to unlinked Member (no `userId`) | Assignment succeeds; notification safely skipped without throwing unhandled error | Handled safely by `complaintNotification.service.js` | High | Passed |
| WF-05 | Officer attempts to reassign complaint to another officer | HTTP 403 Forbidden: only authorities can reassign | Blocked by `complaintWorkflow.service.js` line 113 | High | Passed |
| WF-06 | Officer marks complaint "Resolved" without notes | HTTP 400 Bad Request: resolution notes required | Handled by `complaintWorkflow.service.js` line 52 | Medium | Passed |
| WF-07 | Officer marks complaint "Resolved" with valid notes | Status updated to `"Resolved"`, citizen notified, resolution timestamp saved | Handled by `complaintWorkflow.service.js` line 60 | High | Passed |
| WF-08 | Officer attempts to transition "Closed" complaint back to "In Progress" | HTTP 400 Bad Request: invalid state transition | Blocked by `complaintWorkflow.service.js` line 44 | Medium | Passed |
| WF-09 | Citizen submits feedback on resolved complaint | Feedback saved in database, linked to complaint | Handled by `feedback.controller.js` | Low | Passed |
| WF-10 | Citizen attempts to submit feedback before resolution | HTTP 400 Bad Request: complaint must be resolved | Handled by `feedback.controller.js` line 22 | Medium | Passed |

---

## 4. SLA & Escalation Edge Cases

| ID | Scenario | Expected Behavior | Actual Behavior | Severity | Risk Status |
|----|----------|-------------------|-----------------|----------|-------------|
| SLA-01 | Complaint created with High priority | SLA deadline calculated (24 hours); reminder timer scheduled | Handled by `sla.service.js` | High | Passed |
| SLA-02 | Complaint reaches 75% of SLA deadline | Warning notification dispatched to assigned officer & authority | Handled by `slaEscalation.service.js` | Medium | Passed |
| SLA-03 | Complaint exceeds 100% SLA without resolution | Status flagged as `slaBreached: true`, escalation level incremented | Handled by `slaEscalation.service.js` | High | Passed |
| SLA-04 | Officer resolves complaint after SLA deadline has breached | Resolved successfully, but `slaBreached` remains `true` for historical auditing | Handled by `complaintWorkflow.service.js` | High | Passed |
| SLA-05 | Complaint resolved before SLA deadline | SLA timer cancelled/marked complete; no breach recorded | Handled by `sla.service.js` | Medium | Passed |

---

## 5. Concurrent Operations & Real-Time Edge Cases

| ID | Scenario | Expected Behavior | Actual Behavior | Severity | Risk Status |
|----|----------|-------------------|-----------------|----------|-------------|
| CO-01 | Simultaneous status updates by Authority and Officer | Sequential processing via Mongoose document versioning (`__v`) | Managed by MongoDB document write lock | Medium | Passed |
| CO-02 | Socket client disconnects during active session | Room membership cleaned up; reconnects automatically on network resume | Handled by Socket.IO client auto-reconnection | Low | Passed |
| CO-03 | Notification socket emit fails (network drop) | Database notification already committed; user sees notification on page reload | Verified: DB persist precedes socket emit | High | Passed |
| CO-04 | Notification deduplication on duplicate actions | Dedupe key prevents redundant notification spam in DB | Handled by `Notification.js` unique index on `dedupeKey` | Medium | Passed |
| CO-05 | Client clicks notification link with outdated route | System falls back gracefully or routes to dashboard | **FAILED**: Renders 404 NotFound page for `/department/ai-insights`, etc. | Medium | **OPEN DEFECT** |

