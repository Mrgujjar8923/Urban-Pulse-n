# GovAI Resolve: Comprehensive Viva Voce Examination Guide
## 45 Technical & Architecture Defense Questions for B.Tech Capstone Viva

**Project**: GovAI Resolve — AI-Powered Civic Complaint Governance Platform  
**Target Architecture**: MERN Stack (MongoDB, Express, React, Node.js) with Google Gemini Generative AI  

---

## Category 1: MERN Architecture & Full-Stack Fundamentals

### Q1: Why did you choose the MERN stack over traditional multi-page MVC frameworks (e.g. Django or Spring Boot)?
**Answer**: MERN enables a unified JavaScript/TypeScript ecosystem across both frontend and backend, reducing context switching and allowing shared data contracts. The React Single Page Application (SPA) provides an app-like user experience with dynamic client-side routing and instant UI updates. Node.js's non-blocking, asynchronous event-driven I/O is ideal for real-time WebSockets (Socket.IO) and concurrent I/O operations (file streaming, AI API calls). MongoDB's flexible BSON document model maps naturally to polymorphic civic grievance records with nested timelines and SLA objects.

### Q2: What is the role of Vite in your frontend architecture, and how does it differ from Webpack / Create-React-App?
**Answer**: Vite leverages native browser ES Modules (ESM) during development, serving source code without bundling. This delivers near-instant Cold Server Start (< 300ms) and millisecond Hot Module Replacement (HMR) regardless of project size. During production builds, Vite uses Rollup to perform tree-shaking, chunk optimization, and dynamic route-level code splitting (`React.lazy`), producing highly optimized production bundles.

### Q3: How is client-side state managed in GovAI Resolve?
**Answer**: We implement a separation of concerns:
- **Server Cache & Async State**: Managed by **TanStack React Query v5**, handling caching, deduplication, background re-validation, and optimistic updates.
- **Global Auth & Session State**: Managed via React Context API (`AuthContext`), exposing authenticated user identity, JWT token, and profile mutators.
- **Real-Time Notification State**: Managed via a dedicated `SafeNotificationContext` listening to Socket.IO events.
- **Local Component State**: Managed via standard React `useState` and `useReducer` hooks.

### Q4: How does route-level code splitting improve performance in GovAI Resolve?
**Answer**: Routes in `App.tsx` are wrapped in `React.lazy()` and `SuspenseWrapper`. Instead of downloading a massive monolithic JavaScript bundle on initial visit, the browser loads only the lightweight shell and Landing/Auth bundle. Heavy analytical dashboards (e.g. `HeatmapView.tsx`, `AnalyticsDashboard.tsx`) are fetched on demand only when an administrator navigates to those specific routes, slashing Initial Time-to-Interactive (TTI) and First Contentful Paint (FCP).

### Q5: What is an Error Boundary in React, and how is it utilized here?
**Answer**: An Error Boundary is a class component implementing `componentDidCatch` and `getDerivedStateFromError`. It catches JavaScript errors anywhere in the child component tree, logs the exception, and renders a fallback UI instead of crashing the entire React application into a blank white screen. In GovAI Resolve, the root `ErrorBoundary` protects the application from catastrophic component failures (e.g. map coordinate formatting anomalies).

---

## Category 2: MongoDB, Database Design & Query Optimization

### Q6: Why did you choose MongoDB over a relational database like PostgreSQL?
**Answer**: Civic grievance data is semi-structured and hierarchical: a complaint contains an evolving array of `timeline` audit events, variable `resolutionHistory` records, and dynamic `aiAnalysis` metadata. In a relational database, this requires 4 to 5 normalized tables with expensive multi-table `JOIN` operations on every read. MongoDB's document model allows complaints to be stored and retrieved as single coherent BSON documents, providing high write throughput and rapid point reads.

### Q7: What compound indexes are configured in your Mongoose models, and why?
**Answer**: We defined specific compound indexes based on query frequency:
1. `idx_complaints_creator_created`: `{ createdBy: 1, createdAt: -1 }` — Optimizes citizen complaint listing sorted by newest first.
2. `idx_complaints_category_created`: `{ category: 1, createdAt: -1 }` — Accelerates department authority queues.
3. `idx_complaints_dept_assigned_created`: `{ category: 1, assignedTo: 1, createdAt: -1 }` — Powers field officer queues (`my-assigned`).
4. `idx_complaints_sla_deadline_status`: `{ "sla.deadline": 1, status: 1 }` — Enables the background SLA escalation job to query overdue complaints without scanning the collection.
5. `idx_notifications_user_created`: `{ userId: 1, createdAt: -1 }` — Accelerates user notification feeds.

### Q8: Why is `autoIndex: false` set in production Mongoose configurations?
**Answer**: When `autoIndex` is enabled, Mongoose executes `createIndex` calls for every schema index every time the application server starts. In production Atlas clusters with thousands of documents, building indexes during startup causes severe I/O spikes, blocks database operations, and can crash startup scripts. Disabling `autoIndex` in production ensures indexes are built once administratively, allowing application instances to start instantaneously.

### Q9: How do you enforce deterministic pagination, and what is "page drift"?
**Answer**: Page drift occurs when new records are inserted while a user is paginating, causing items to shift between pages if the sort order is ambiguous. We prevent this by sorting queries using a deterministic tie-breaker: `{ createdAt: -1, _id: -1 }`. Because MongoDB `_id` values are monotonically increasing unique ObjectIds, two records created within the exact same millisecond maintain a guaranteed, deterministic sort order.

### Q10: How do you guarantee that a field officer user account can only be linked to at most one Department Member?
**Answer**: In the `Member` schema, we declare:
```javascript
memberSchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { userId: { $type: "objectId" } } }
);
```
The `partialFilterExpression` ensures that unlinked members (`userId: null`) do not violate the unique constraint, while guaranteeing that any non-null `userId` can appear in at most one member document across the database.

---

## Category 3: Google Gemini Generative AI Integration

### Q11: Which Gemini model does GovAI Resolve use, and why?
**Answer**: The system uses `gemini-2.5-flash` via the Google Generative Language REST API. It was selected because Flash offers sub-2 second response latency, high JSON-mode instruction adherence, multimodal vision capabilities, and cost efficiency compared to larger models like Gemini Pro or Ultra, making it optimal for synchronous HTTP request-response pipelines.

### Q12: How do you ensure Gemini returns structured data suitable for backend parsing?
**Answer**: We configure the API payload with `generationConfig: { responseMimeType: "application/json" }` and engineer a strict system instruction providing a target JSON schema. The prompt explicitly specifies required keys: `category`, `priority`, `urgencyScore`, `confidence`, `detectedIssue`, `affectedArea`, `recommendedAction`, and `detectedLanguage`.

### Q13: What happens if Gemini API experiences downtime, rate limits, or network timeouts?
**Answer**: The complaint submission pipeline is **fault-tolerant and decoupled**:
1. The complaint record is saved and committed to MongoDB **first** with a safe default baseline SLA (`Medium` priority, 72 hours).
2. The Gemini AI call is wrapped in an isolated `try...catch` block.
3. If Gemini fails (timeout, 429 quota, network drop, malformed JSON), the error is logged, `aiAnalysis.status` is set to `"failed"` or `"manual_review_required"`, and the user's complaint submission still succeeds with `201 Created`.
4. Department authorities can trigger an on-demand re-analysis via `POST /api/complaints/:id/retry-ai` once external API connectivity is restored.

### Q14: How does multilingual translation work in GovAI Resolve?
**Answer**: In the system prompt, Gemini is instructed to inspect the linguistic script of the text. If non-English input is detected (e.g. Hindi in Devanagari script), the model outputs the identified language (`detectedLanguage`) and synthesizes an English translation (`englishTranslation`). The backend persists this translation in `complaint.aiAnalysis`, enabling municipal officers who do not speak regional dialects to comprehend and act upon the grievance immediately.

### Q15: How is temperature configured in your Gemini calls?
**Answer**: We set temperature to a low value (`0.2`). In analytical and classification tasks, high temperature produces creative randomness and hallucinations. A low temperature forces the model to be deterministic, factual, and strictly compliant with municipal taxonomy and department boundaries.

---

## Category 4: Authentication, RBAC & Security

### Q16: How is user authentication implemented in GovAI Resolve?
**Answer**: Authentication is stateless using **JSON Web Tokens (JWT)**. Upon successful login (`POST /api/auth/login`), the backend verifies the password using `bcrypt.compare`. If valid, it signs a JWT containing the user's `_id`, `role`, and `departmentRole`, signed with a 32-byte secret using HMAC-SHA256 with a 7-day expiration. The client attaches this token as a `Bearer <token>` in the HTTP `Authorization` header for all protected API requests.

### Q17: What are the four user tiers in your Role-Based Access Control (RBAC) model?
**Answer**:
1. **Citizen (`role: "citizen"`)**: Can create complaints, view own complaints, track progress, view evidence, submit feedback, and reopen tickets.
2. **Department Authority (`role: "department", departmentRole: "authority"`)**: Full oversight of complaints matching their department category, can assign complaints to officers, monitor SLA compliance, and trigger AI re-analysis.
3. **Field Officer (`role: "department", departmentRole: "officer"`)**: Access restricted strictly to complaints assigned to their member ID (`assignedTo`), can transition status to `In Progress` and resolve with photo evidence.
4. **Municipal Administrator (`role: "admin"`)**: Global cross-department visibility, executive analytics, geospatial heatmap, officer linking, department approvals, and data export.

### Q18: How do you prevent horizontal privilege escalation in the backend?
**Answer**: Authentication alone is insufficient; authorization must verify resource ownership. In `complaint.controller.js`, queries enforce data isolation at the database query level:
- Citizen endpoints query `{ createdBy: req.user._id }`.
- Department endpoints enforce `buildDepartmentComplaintFilter(req.user.department)`.
- Field officer endpoints enforce `buildOfficerComplaintFilter(req.user.department, member._id)`.
Even if an attacker guesses a valid complaint ID belonging to another citizen or department, the query returns `403 Forbidden` or `404 Not Found`.

### Q19: How is password recovery implemented securely without exposing tokens?
**Answer**:
1. The citizen requests a reset via `POST /api/auth/forgot-password`.
2. The server generates a cryptographically secure 64-character random hex token (`crypto.randomBytes(32)`).
3. The server computes a SHA-256 hash of this token and saves **only the hash** to MongoDB with a 15-minute expiration timestamp (`user.passwordResetToken = hash`).
4. The unhashed raw token is sent via transactional email.
5. In production, logs only record masked email addresses (`p***u@govai.gov`) and **never** log the reset token.
6. The user submits the token and new password to `POST /api/auth/reset-password`, which hashes the provided token and performs a constant-time lookup.

### Q20: What is CSV Formula Injection (CWE-1236), and how did you mitigate it in `AdminReports.tsx`?
**Answer**: CSV Formula Injection occurs when untrusted user input starting with formula execution characters (`=`, `+`, `-`, `@`, `\t`, `\r`) is exported to a CSV file. When an administrator opens the file in Microsoft Excel or Google Sheets, the spreadsheet software executes the cell as a dynamic formula, potentially executing arbitrary shell commands or exfiltrating data. In `AdminReports.tsx`, our `sanitizeCsvCell` function checks if a string begins with any of these trigger characters and prepends a single apostrophe (`'`), forcing the spreadsheet application to treat the content strictly as text.

---

## Category 5: Real-Time WebSockets & Notifications

### Q21: How does Socket.IO integrate with Express in GovAI Resolve?
**Answer**: In `server.js`, an HTTP server instance (`http.createServer(app)`) wraps the Express application. Socket.IO is initialized on this shared HTTP server. During the WebSocket handshake, Socket.IO inspects the client's JWT token, verifies its signature, decodes the user ID, and automatically joins the socket client to a private room: `user:${userId}`.

### Q22: How does cross-tab notification synchronization work?
**Answer**: When a user marks a notification as read, clears notifications, or marks all as read in Tab 1, an HTTP request updates the MongoDB database. Upon successful database update, the server emits a Socket.IO event (`notification:read`, `notification:read_all`, or `notification:cleared`) to the room `user:${userId}`. Tab 2, which is listening to that same room, receives the event instantly and updates its local React state and badge count without needing a page refresh.

### Q23: How do you prevent Socket.IO reconnection loops from flooding the database?
**Answer**:
1. The frontend client uses exponential backoff reconnection strategies with maximum retry intervals.
2. The notification drawer uses TanStack React Query with defined `staleTime` and deduplication keys, ensuring that reconnect events do not trigger redundant duplicate API fetches.
3. Database notification creation utilizes a unique sparse `dedupeKey` index, preventing duplicate alerts for the same operational event.

---

## Category 6: Evidence Storage & File Upload Security

### Q24: What is magic-byte inspection, and why is MIME-type checking alone insecure?
**Answer**: Standard web uploads determine file types based on the user-supplied file extension (e.g. `.jpg`) or the client's `Content-Type` header (e.g. `image/jpeg`). An attacker can easily rename a malicious PHP script or executable binary to `exploit.jpg`. Magic-byte inspection reads the first few raw binary bytes of the uploaded file buffer:
- JPEG: starts with bytes `FF D8 FF`
- PNG: starts with bytes `89 50 4E 47 0D 0A 1A 0A`
- WebP: starts with bytes `RIFF` ... `WEBP`
In `evidenceStorage.service.js`, our `detectImageSignature` function inspects the actual buffer bytes, rejecting any file that does not match genuine image signatures regardless of its extension.

### Q25: How do you protect against Directory Traversal (Path Traversal) attacks during evidence retrieval?
**Answer**: In `evidenceStorage.service.js`, `isSafeStorageKey` enforces strict path hygiene:
1. Rejects keys containing null bytes (`\0`).
2. Rejects keys containing `..` parent directory sequences.
3. Rejects absolute paths (`path.isAbsolute(key)`).
4. Resolves the requested key against the upload base directory and verifies that `path.relative(rootDir, resolvedPath)` does not begin with `..`.
5. Files are streamed through authenticated API routes (`/api/complaints/:id/evidence`) rather than served from a public static folder.

### Q26: What happens to physical evidence files when a complaint is deleted?
**Answer**: If a complaint is deleted via `DELETE /api/complaints/:id` by an authorized admin or owner, the complaint document is removed from MongoDB, and the `evidenceStorage.service.js` unlinks the corresponding physical image files from disk (`complaint.image` and any files in `resolutionHistory`). This prevents orphaned disk waste and storage leaks.

---

## Category 7: Service Level Agreements (SLA) & Workflow State Machine

### Q27: How are SLA durations calculated dynamically in GovAI Resolve?
**Answer**: SLA durations are mapped to priority ratings:
- `Critical`: **24 hours** (immediate life/safety hazards, e.g. gas leak, live electrical wire)
- `High`: **48 hours** (major civic disruptions, e.g. main road block, contaminated water)
- `Medium`: **72 hours** (standard municipal maintenance, e.g. streetlight outage, potholes)
- `Low`: **120 hours** (cosmetic/minor non-hazardous requests, e.g. tree trimming)
When Gemini AI analyzes a complaint and determines a priority, the SLA engine computes:
`deadline = startedAt + durationMinutes`.

### Q28: How does the background SLA escalation job function?
**Answer**: In `slaEscalation.service.js`, a background timer runs at configurable intervals (`SLA_ESCALATION_INTERVAL_MS`, default 5 minutes). It queries MongoDB for active complaints where `"sla.deadline" <= new Date()` and status is not `Resolved`. When an overdue complaint is detected, the engine:
1. Marks `sla.slaStatus = "Overdue"`.
2. Sets `sla.escalatedAt = new Date()`.
3. Appends an audit event (`sla_overdue_escalated`) to the complaint timeline.
4. Emits a real-time notification alert to the department authority.

### Q29: What is the formal state machine of a complaint in GovAI Resolve?
**Answer**:
- `Pending`: Initial state upon citizen submission; category and baseline SLA initialized.
- `Assigned`: Department authority delegates ticket to a specific field officer.
- `In Progress`: Field officer commences on-site inspection or repair.
- `Resolved`: Field officer submits resolution remarks and after-repair photo proof; SLA clock stops.
- `Reopened`: Citizen indicates defect is unresolved; transitions back to `In Progress` with previous SLA history preserved.

### Q30: How does GovAI Resolve prevent duplicate complaint submissions from impatient users double-clicking submit?
**Answer**: We employ dual-layer idempotency defense:
1. **Client Request ID**: The client generates a unique UUID (`clientRequestId`) sent in the payload. The database enforces a unique sparse index on `clientRequestId`. A rapid retry returns the existing complaint with `200 OK` rather than creating a duplicate.
2. **Temporal Deduplication**: If no UUID is sent, the controller queries MongoDB for any complaint by the same user with the identical title, description, and category created within the last **30 seconds**. If found, the existing complaint is returned.

---

## Category 8: Advanced Admin & Geospatial Heatmap

### Q31: How is the geospatial heatmap implemented without external proprietary map APIs (like Google Maps SDK)?
**Answer**: To eliminate external API costs and quota constraints, the heatmap is built using an interactive Scalable Vector Graphics (SVG) vector projection component in React (`HeatmapView.tsx`). Coordinate pins are projected onto a scaled viewBox using mathematical linear coordinate interpolation. It features interactive zoom and pan transforms, proximity cluster aggregation, unmapped location fallback tables, and popovers displaying complaint reference numbers while masking citizen PII.

### Q32: How did you remediate the cluster popover crash in Phase 8.6?
**Answer**: The backend API normalizes MongoDB `_id` into `item.id`. The frontend component was attempting to access `item._id.slice(-6)`, throwing an uncaught `TypeError: Cannot read properties of undefined (reading 'slice')`. We resolved this by implementing defensive identifier resolution:
```typescript
const complaintId = item.id || (item as any)._id || "";
const displayRef = item.reference || (complaintId ? `CMP-${String(complaintId).slice(-6).toUpperCase()}` : "CMP-UNKNOWN");
```
and guarding numerical coordinates with `typeof item.latitude === "number" ? item.latitude.toFixed(4) : "—"`.

---

## Category 9: Production Readiness, Graceful Shutdown & DevOps

### Q33: What is graceful shutdown, and how is it implemented in `server.js`?
**Answer**: Graceful shutdown ensures that when the Node.js process receives termination signals (`SIGTERM` from Docker/Kubernetes or `SIGINT` from Ctrl+C), it does not abruptly sever active connections. Our `gracefulShutdown` handler:
1. Stops the background SLA escalation timer.
2. Calls `httpServer.close()` to stop accepting new HTTP requests and wait for inflight requests to complete.
3. Disconnects all connected Socket.IO clients cleanly.
4. Closes the MongoDB Mongoose connection (`mongoose.connection.close(false)`).
5. Employs a 10-second watchdog timer (`setTimeout(..., 10000).unref()`) to force termination if any resource hangs.

### Q34: What is the purpose of `app.set("trust proxy", 1)` in Express?
**Answer**: When deploying behind a reverse proxy (e.g. Nginx, Cloudflare, AWS ALB), client requests arrive from the proxy's IP address. By setting `trust proxy`, Express inspects the `X-Forwarded-For` and `X-Forwarded-Proto` headers to determine the genuine client IP address. This is critical for our IP-based rate limiters (`express-rate-limit`) so that the limiter throttles the actual client rather than blocking the reverse proxy itself.

### Q35: How does Helmet enhance HTTP security in GovAI Resolve?
**Answer**: Helmet automatically configures standard security response headers:
- `X-Content-Type-Options: nosniff`: Prevents browsers from MIME-sniffing away from the declared content type.
- `X-Frame-Options: SAMEORIGIN`: Defends against Clickjacking attacks.
- `Strict-Transport-Security (HSTS)`: Enforces secure HTTPS connections.
- `Cross-Origin-Resource-Policy: cross-origin`: Configured to permit cross-origin image preview streaming and API fetches.

---

## Category 10: Academic Viva Defense & System Evaluation

### Q36: What was the most challenging technical bug you encountered during this project, and how did you resolve it?
**Answer**: The most subtle issue was the synthetic click event mismatch on eligible officer cards in `AdminDepartments.tsx`. The cards were initially rendered as `<div>` elements with `onClick` listeners. In automated browser testing and accessibility tools, calling `.click()` failed to trigger React 18's synthetic state batching, leaving the confirmation button disabled. We resolved it by refactoring the cards into semantic `<button type="button">` elements with visible focus rings, `aria-pressed`, and full keyboard navigation (`Enter` and `Space`), fixing both accessibility and automated test reliability.

### Q37: If you had 6 more months on this project, what would you add?
**Answer**:
1. **Automated Computer Vision Verification**: Train a Vision-Language Model to compare the citizen's defect photo against the officer's resolution photo, automatically calculating a visual similarity and repair verification score.
2. **Distributed Cloud Storage**: Implement AWS S3 / MinIO drivers with signed URLs for horizontal multi-instance scaling.
3. **Predictive Municipal Maintenance**: Train time-series ML models on historical complaint GPS coordinates to forecast infrastructure failures (e.g. recurring water pipe bursts during winter freezes).
4. **Offline-First Mobile App**: React Native mobile application for field officers with local SQLite caching for areas with poor cellular reception.

### Q38: How do you know your application can handle concurrent users?
**Answer**:
1. Node.js handles I/O asynchronously on a single-threaded event loop backed by `libuv`.
2. Database operations use compound indexes, avoiding full collection scans.
3. Stateless JWT authentication eliminates server-side session memory locks.
4. Rate limiting protects the API from resource starvation.
5. In Phase 7E.12 and 8.5, automated headless Chrome browser suites executed multiple concurrent workflows (citizen submission, officer resolution, admin monitoring) with zero dropped connections or database race conditions.

### Q39: What is the difference between unit testing, integration testing, and E2E testing in your project?
**Answer**:
- **Unit Testing (Vitest)**: Tests isolated UI components and pure functions (e.g. date formatters, CSV sanitization, badge color helpers) with mocked APIs.
- **Integration Testing (Mocha/Chai/Supertest)**: Tests HTTP API endpoints against a real isolated MongoDB database, validating auth middleware, request validation, database writes, and response status codes.
- **E2E Testing (Chrome DevTools Protocol)**: Drives an authentic headless Chrome browser across real viewports, clicking buttons, submitting forms, verifying real-time DOM changes, and capturing full-page screenshot artifacts.

### Q40: What are the main social benefits of GovAI Resolve?
**Answer**: GovAI Resolve empowers ordinary citizens by democratizing access to public municipal services. It breaks language barriers through automated translation, reduces response times through AI categorization, guarantees that complaints cannot be dismissed without verifiable photographic proof, and gives city leadership the geospatial intelligence needed to allocate public funds efficiently.

### Q41: How do you handle Cross-Origin Resource Sharing (CORS) securely?
**Answer**: Rather than using wildcard `cors({ origin: "*" })`, GovAI Resolve uses a dynamic origin validator (`isAllowedOrigin`) in `config/cors.js`. It checks the incoming `Origin` header against an environment-configured whitelist (`FRONTEND_ORIGINS`), allowing localhost development ports (`8080`, `5173`) while blocking unauthorized external origins.

### Q42: What is the purpose of bcrypt salt rounds, and why did you choose 10?
**Answer**: The salt work factor determines the mathematical cost (number of iterations: $2^{10} = 1024$) required to hash a password. Work factor 10 is the industry standard balance: it takes ~60–80 milliseconds per hash on modern CPUs—fast enough not to cause user login latency, but computationally prohibitive for attackers attempting brute-force rainbow table attacks.

### Q43: How does the application prevent horizontal privilege escalation during complaint deletion?
**Answer**: In `complaint.controller.js`, `deleteComplaint` first queries the complaint by ID. It then inspects the authenticated user:
```javascript
const isOwner = complaint.createdBy.toString() === req.user._id.toString();
const isAdmin = req.user.role === "admin";
if (!isOwner && !isAdmin) {
  return res.status(403).json({ message: "You do not have permission to delete this complaint" });
}
```
A citizen cannot delete another citizen's complaint, and department authorities/officers cannot delete complaints—only the original creator or an admin possesses deletion rights.

### Q44: What is the significance of the `dedupeKey` in the Notification model?
**Answer**: The `dedupeKey` is a compound string (e.g. `complaint_assigned_${complaintId}_${officerId}`) enforced by a unique sparse index in MongoDB. If an authority rapidly clicks "Assign" multiple times, the database rejects duplicate notifications, preventing citizen and officer inboxes from being spammed with duplicate alerts for the exact same event.

### Q45: How does GovAI Resolve ensure citizen privacy on the public Admin Heatmap?
**Answer**: In `HeatmapView.tsx`, when an administrator or viewer clicks on a geospatial cluster pin, the popover displays the complaint reference ID, department category, status, and timestamp, but explicitly hides the citizen's personal name, phone number, and residential address, accompanied by an on-screen notice: *"Citizen personal identity details are protected under municipal privacy compliance."*
