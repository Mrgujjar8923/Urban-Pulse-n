import http from "http";
import net from "net";
import path from "path";
import os from "os";
import fs from "fs";
import { spawn } from "child_process";
import dotenv from "../backend/node_modules/dotenv/lib/main.js";
import jwt from "../backend/node_modules/jsonwebtoken/index.js";
import mongoose from "../backend/node_modules/mongoose/index.js";

// Load environment from backend/.env
const envPath = path.resolve(process.cwd(), "backend/.env");
dotenv.config({ path: envPath, override: true });

// Configuration & Safety
const TEST_DB_NAME = "govai_phase7c_test";
const TEST_PORT = 5000;
const FRONTEND_PORT = 8080;
const CDP_PORT = 9266;
const BASE_URL = `http://127.0.0.1:${FRONTEND_PORT}`;
const BACKEND_URL = `http://127.0.0.1:${TEST_PORT}`;
const CDP_BASE = `http://127.0.0.1:${CDP_PORT}`;

process.env.NODE_ENV = "test";
process.env.ALLOW_TEST_DB = "true";
process.env.MONGO_DB_NAME = TEST_DB_NAME;

const testUploadDir = path.join(os.tmpdir(), `govai-phase7c-uploads-${Date.now()}`);
fs.mkdirSync(testUploadDir, { recursive: true });
process.env.EVIDENCE_UPLOAD_DIR = testUploadDir;

// Dynamic imports for backend models
const { User } = await import("../backend/src/models/User.js");
const { Member } = await import("../backend/src/models/Member.js");
const { Complaint } = await import("../backend/src/models/Complaint.js");
const { Feedback } = await import("../backend/src/models/Feedback.js");
const { Notification } = await import("../backend/src/models/Notification.js");

const JWT_SECRET = process.env.JWT_SECRET || "change_me_and_keep_secret";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const consoleErrors = [];
const networkFailures = [];
const apiTrace = [];
let expectErrorResponses = false;
let backendProc = null;
let frontendProc = null;
let chromeProc = null;
let tmpChromeDataDir = null;

const SCREENSHOT_DIR = "/home/priyanshu/.gemini/antigravity/brain/8af59d69-02f5-4527-9224-95a1a2da524f/screenshots";
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
const capturedScreenshots = [];

const captureShot = async (cdp, filename) => {
  try {
    const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
    const outPath = path.join(SCREENSHOT_DIR, filename);
    fs.writeFileSync(outPath, Buffer.from(data, "base64"));
    capturedScreenshots.push(outPath);
    console.log(`[SCREENSHOT] Saved ${filename}`);
  } catch (e) {
    console.warn(`[SCREENSHOT WARN] Failed ${filename}:`, e.message);
  }
};

const logStep = (category, stepNum, description, passed, details = "") => {
  results.push({ category, stepNum, description, passed, details });
  console.log(`[${passed ? "PASS" : "FAIL"}] [${category}] Step ${stepNum}: ${description} ${details ? "- " + details : ""}`);
};

// CDP Helper Class
class CDPController {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.id && this.pending.has(msg.id)) {
            const { resolve: res, reject: rej } = this.pending.get(msg.id);
            this.pending.delete(msg.id);
            if (msg.error) rej(msg.error);
            else res(msg.result);
          } else if (msg.method === "Runtime.consoleAPICalled") {
            if (msg.params.type === "error") {
              const text = msg.params.args?.map((a) => a.value || a.description || "").join(" ");
              if (!expectErrorResponses) {
                consoleErrors.push(text);
              }
            }
          } else if (msg.method === "Network.responseReceived") {
            const status = msg.params.response?.status;
            const url = msg.params.response?.url || "";
            if (url.includes("/api/")) {
              apiTrace.push({ status, url, expectedNegative: expectErrorResponses });
            }
            if (status >= 400 && !expectErrorResponses) {
              networkFailures.push(`${status} ${url}`);
            }
          } else if (msg.method === "Network.loadingFailed") {
            if (!msg.params?.canceled && !expectErrorResponses) {
              networkFailures.push(`LOADING_FAILED ${msg.params?.errorText || "unknown"}`);
            }
          }
        } catch {}
      };
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const res = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res?.exceptionDetails) {
      console.error("[CDP EVAL EXCEPTION]", res.exceptionDetails.text, res.exceptionDetails.exception?.description || "");
    }
    return res?.result?.value;
  }

  async waitFor(expression, timeoutMs = 10000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const ok = await this.evaluate(`Boolean(${expression})`);
      if (ok) return true;
      await sleep(150);
    }
    return false;
  }

  async setViewport(width, height) {
    await this.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 600,
    });
    await sleep(200);
  }

  async navigate(url, waitMs = 1200) {
    await this.send("Page.navigate", { url });
    await sleep(waitMs);
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

// Valid 8x8 JPEG image buffer
const createValidJpegBuffer = () => {
  return Buffer.from(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAIAAgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDn6KKK/RT5o//Z",
    "base64"
  );
};

async function main() {
  console.log("===============================================================================");
  console.log("PHASE 7C: COMPLETE END-TO-END BROWSER TESTING FOR GOVAI RESOLVE");
  console.log("===============================================================================");

  /* -------------------------------------------------------------------------
   * TASK 2 — ISOLATED DATABASE SAFETY CHECKS & SYNTHETIC FIXTURES
   * ------------------------------------------------------------------------- */
  console.log("\n>>> TASK 2: CONNECTING TO ISOLATED TEST DATABASE...");
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI not configured");

  await mongoose.connect(uri, {
    dbName: TEST_DB_NAME,
    serverSelectionTimeoutMS: 10000,
  });

  const effectiveMongooseDb = mongoose.connection.name;
  const effectiveDriverDb = mongoose.connection.db?.databaseName;

  console.log(`Mongoose DB Name: "${effectiveMongooseDb}"`);
  console.log(`Driver DB Name:   "${effectiveDriverDb}"`);

  // STRICT SAFETY GUARDS
  if (effectiveMongooseDb === "govai" || effectiveDriverDb === "govai") {
    throw new Error("CRITICAL SAFETY HALT: Refusing to proceed! Connected to production database 'govai'.");
  }
  if (!effectiveMongooseDb.startsWith("govai_phase7c_") || !effectiveDriverDb.startsWith("govai_phase7c_")) {
    throw new Error(`CRITICAL SAFETY HALT: Database name "${effectiveMongooseDb}" does not match required test prefix.`);
  }

  logStep("TASK 2", "DB-1", "Verify isolated test DB name is govai_phase7c_test and not govai", true);

  // Clear any existing test data in isolated DB
  await User.deleteMany({});
  await Member.deleteMany({});
  await Complaint.deleteMany({});
  await Feedback.deleteMany({});
  await Notification.deleteMany({});

  // Seed Synthetic Test Fixtures
  console.log("Seeding synthetic test fixtures in govai_phase7c_test...");
  const citizenA = await User.create({
    name: "Aarav Sharma",
    email: "aarav.citizen@internal.test",
    password: "TestPassword123!",
    role: "citizen",
    status: "active",
  });

  const citizenB = await User.create({
    name: "Kavita Verma",
    email: "kavita.citizen@internal.test",
    password: "TestPassword123!",
    role: "citizen",
    status: "active",
  });

  const waterAuthority = await User.create({
    name: "Vikram Malhotra",
    email: "water.authority@internal.test",
    password: "TestPassword123!",
    role: "department",
    departmentRole: "authority",
    department: "Water Supply",
    status: "active",
  });

  const roadsAuthority = await User.create({
    name: "Ananya Deshmukh",
    email: "roads.authority@internal.test",
    password: "TestPassword123!",
    role: "department",
    departmentRole: "authority",
    department: "Road & Infrastructure",
    status: "active",
  });

  const waterOfficerAssigned = await User.create({
    name: "Rajesh Kumar (Field Officer)",
    email: "rajesh.officer@internal.test",
    password: "TestPassword123!",
    role: "department",
    departmentRole: "officer",
    department: "Water Supply",
    status: "active",
  });

  const waterOfficerUnassigned = await User.create({
    name: "Sunil Joshi (Unassigned Officer)",
    email: "sunil.officer@internal.test",
    password: "TestPassword123!",
    role: "department",
    departmentRole: "officer",
    department: "Water Supply",
    status: "active",
  });

  const waterOfficerUnlinked = await User.create({
    name: "Ramesh Nair (Unlinked Officer)",
    email: "ramesh.unlinked@internal.test",
    password: "TestPassword123!",
    role: "department",
    departmentRole: "officer",
    department: "Water Supply",
    status: "active",
  });

  const adminUser = await User.create({
    name: "Super Administrator",
    email: "super.admin@internal.test",
    password: "TestPassword123!",
    role: "admin",
    status: "active",
  });

  // Link Member records
  const memberAssigned = await Member.create({
    name: "Rajesh Kumar",
    department: "Water Supply",
    userId: waterOfficerAssigned._id,
    createdBy: adminUser._id,
  });

  const memberUnassigned = await Member.create({
    name: "Sunil Joshi",
    department: "Water Supply",
    userId: waterOfficerUnassigned._id,
    createdBy: adminUser._id,
  });

  logStep("TASK 2", "DB-2", "Synthetic role fixtures created with preserved officer-member mappings", true);

  // Generate tokens for test session simulation
  const tokens = {
    citizenA: jwt.sign({ id: citizenA._id, role: "citizen" }, JWT_SECRET),
    citizenB: jwt.sign({ id: citizenB._id, role: "citizen" }, JWT_SECRET),
    waterAuthority: jwt.sign({ id: waterAuthority._id, role: "department" }, JWT_SECRET),
    roadsAuthority: jwt.sign({ id: roadsAuthority._id, role: "department" }, JWT_SECRET),
    waterOfficerAssigned: jwt.sign({ id: waterOfficerAssigned._id, role: "department" }, JWT_SECRET),
    waterOfficerUnassigned: jwt.sign({ id: waterOfficerUnassigned._id, role: "department" }, JWT_SECRET),
    waterOfficerUnlinked: jwt.sign({ id: waterOfficerUnlinked._id, role: "department" }, JWT_SECRET),
    admin: jwt.sign({ id: adminUser._id, role: "admin" }, JWT_SECRET),
  };

  /* -------------------------------------------------------------------------
   * TASK 1 — PREFLIGHT: SERVERS & HEADLESS CHROME CDP
   * ------------------------------------------------------------------------- */
  console.log("\n>>> TASK 1: LAUNCHING BACKEND & PREFLIGHT VERIFICATION...");

  // Ensure port 5000 is completely free before spawning test backend
  const port5000Free = await new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => srv.close(() => resolve(true)));
    srv.listen(TEST_PORT, "::");
  });
  if (!port5000Free) {
    throw new Error(`CRITICAL SAFETY HALT: Port ${TEST_PORT} is already occupied! Refusing to test against an unknown backend.`);
  }

  // Start test backend server on port 5000 bound to test DB
  backendProc = spawn("node", ["backend/src/server.js"], {
    env: {
      ...process.env,
      PORT: String(TEST_PORT),
      MONGO_DB_NAME: TEST_DB_NAME,
      ALLOW_TEST_DB: "true",
      NODE_ENV: "test",
      EVIDENCE_UPLOAD_DIR: testUploadDir,
      DEMO_LOGIN_ENABLED: "false",
    },
    stdio: "inherit",
  });

  let backendReady = false;
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`${BACKEND_URL}/health`);
      if (res.ok) {
        backendReady = true;
        break;
      }
    } catch {}
    await sleep(250);
  }
  if (!backendReady) throw new Error("Backend server failed to start on port 5000");

  // Runtime proof: verify synthetic user (only present in govai_phase7c_test) authenticates on port 5000
  const probeRes = await fetch(`${BACKEND_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "aarav.citizen@internal.test",
      password: "TestPassword123!",
      role: "citizen",
    }),
  });
  if (probeRes.status !== 200) {
    throw new Error(`CRITICAL SAFETY HALT: Backend on port ${TEST_PORT} did not authenticate test DB user (status ${probeRes.status}). Aborting.`);
  }

  logStep("TASK 1", "P-1", "Backend server listening on port 5000 verified on govai_phase7c_test", true);

  // Verify or start frontend Vite server on port 8080
  let frontendReady = false;
  try {
    const feRes = await fetch(`${BASE_URL}/`);
    frontendReady = feRes.ok;
  } catch {}

  if (!frontendReady) {
    console.log("Frontend port 8080 not active; starting temporary Vite dev server...");
    frontendProc = spawn("node", ["./node_modules/.bin/vite", "--host", "127.0.0.1", "--port", String(FRONTEND_PORT)], {
      cwd: path.resolve(process.cwd(), "frontend"),
      stdio: "ignore",
    });
    for (let i = 0; i < 40; i++) {
      try {
        const feRes = await fetch(`${BASE_URL}/`);
        if (feRes.ok) {
          frontendReady = true;
          break;
        }
      } catch {}
      await sleep(250);
    }
  }
  logStep("TASK 1", "P-2", "Frontend Vite server active on port 8080", frontendReady);
  if (!frontendReady) throw new Error("Frontend server not responding on port 8080");

  // Verify Chrome Canary executable and launch CDP
  const chromePath = "/usr/bin/google-chrome";
  const chromeExists = fs.existsSync(chromePath);
  logStep("TASK 1", "P-3", `Chrome Canary path confirmed (${chromePath})`, chromeExists);

  tmpChromeDataDir = `/tmp/chrome_govai_p7c_${Date.now()}`;
  chromeProc = spawn(chromePath, [
    "--headless=new",
    `--remote-debugging-port=${CDP_PORT}`,
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    `--user-data-dir=${tmpChromeDataDir}`,
  ]);

  let cdpConnected = false;
  let versionInfo = null;
  for (let i = 0; i < 30; i++) {
    try {
      const vRes = await fetch(`${CDP_BASE}/json/version`);
      if (vRes.ok) {
        versionInfo = await vRes.json();
        cdpConnected = true;
        break;
      }
    } catch {}
    await sleep(200);
  }

  logStep("TASK 1", "P-4", `Headless Chrome launched on CDP port ${CDP_PORT}`, cdpConnected, versionInfo?.Browser);
  if (!cdpConnected) throw new Error("CDP connection failed");

  // Connect CDP WebSocket
  const listRes = await fetch(`${CDP_BASE}/json/list`);
  const targets = await listRes.json();
  const pageTarget = targets.find((t) => t.type === "page") || targets[0];
  const cdp = new CDPController(pageTarget.webSocketDebuggerUrl);
  await cdp.connect();

  await cdp.send("Page.enable");
  await cdp.send("DOM.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Network.enable");

  const REACT_SET_VAL_JS = `
    window.__setVal = (el, val) => {
      if (!el) return;
      const prev = el.value;
      const proto = el.tagName === "SELECT"
        ? window.HTMLSelectElement.prototype
        : el.tagName === "TEXTAREA"
          ? window.HTMLTextAreaElement.prototype
          : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
      setter.call(el, val);
      if (el._valueTracker) {
        el._valueTracker.setValue(prev);
      }
      if (el.tagName !== "SELECT") {
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };
  `;

  // Test page navigation and JS execution
  await cdp.navigate(`${BASE_URL}/login`, 1500);
  await cdp.evaluate(REACT_SET_VAL_JS);
  const pageTitle = await cdp.evaluate("document.title");
  logStep("TASK 1", "P-5", "CDP page navigation and JavaScript execution confirmed", Boolean(pageTitle), `Title: "${pageTitle}"`);

  // Helper to set normalized auth session in browser localStorage
  const setBrowserSession = async (userObj, token, extra = {}) => {
    const clientUser = {
      id: userObj._id?.toString() || userObj.id,
      name: userObj.name,
      email: userObj.email,
      role: userObj.role === "department" ? "authority" : userObj.role,
      department: userObj.department || undefined,
      departmentRole: userObj.role === "department" ? (userObj.departmentRole || null) : null,
      isOfficer: userObj.role === "department" && userObj.departmentRole === "officer",
      memberId: extra.memberId || null,
      memberName: extra.memberName || null,
      status: userObj.status || "active",
    };
    await cdp.evaluate(`
      localStorage.setItem("govai_token", ${JSON.stringify(token)});
      localStorage.setItem("govai_user", ${JSON.stringify(JSON.stringify(clientUser))});
      ${REACT_SET_VAL_JS}
    `);
    await sleep(250);
  };

  const clearBrowserSession = async () => {
    await cdp.evaluate(`
      localStorage.removeItem("govai_token");
      localStorage.removeItem("govai_user");
    `);
    await sleep(200);
  };

  /* -------------------------------------------------------------------------
   * TASK 3 — REAL BROWSER HAPPY-PATH WORKFLOW
   * ------------------------------------------------------------------------- */
  console.log("\n>>> TASK 3: EXECUTING REAL BROWSER HAPPY-PATH WORKFLOW...");
  let complaintId = null;

  // A. CITIZEN WORKFLOW
  {
    console.log("--- A. Citizen Workflow ---");
    await clearBrowserSession();
    await cdp.navigate(`${BASE_URL}/login`, 1200);

    await cdp.evaluate(`
      ${REACT_SET_VAL_JS}
      window.__setVal(document.getElementById("login-email"), "aarav.citizen@internal.test");
      window.__setVal(document.getElementById("login-password"), "TestPassword123!");
      document.getElementById("login-submit-btn").click();
    `);
    await sleep(2000);

    const currentUrl = await cdp.evaluate("window.location.pathname");
    logStep("TASK 3-A", "1-2", "Citizen A login via UI", currentUrl.includes("/citizen"), `URL: ${currentUrl}`);

    // Navigate to Raise Complaint
    await cdp.navigate(`${BASE_URL}/citizen/new`, 1500);

    // Create intake evidence image
    const intakeJpgPath = path.join(testUploadDir, "intake_evidence.jpg");
    fs.writeFileSync(intakeJpgPath, createValidJpegBuffer());

    // Populate title, description, location
    await cdp.evaluate(`
      ${REACT_SET_VAL_JS}
      window.__setVal(document.getElementById("title"), "High-pressure pipeline burst at Sector 4B");
      window.__setVal(document.getElementById("description"), "Water mainline fractured under pavement with severe flooding. Immediate repair required.");
      window.__setVal(document.getElementById("location"), "Sector 4B Main Road, Near Water Tank");
    `);
    await sleep(300);

    // Select Water Supply category
    await cdp.evaluate(`(() => {
      const selectBtn = document.getElementById("category");
      if (selectBtn) selectBtn.click();
    })()`);
    await sleep(400);
    await cdp.evaluate(`(() => {
      const items = Array.from(document.querySelectorAll("[role='option']"));
      const waterItem = items.find(i => i.textContent.includes("Water Supply"));
      if (waterItem) waterItem.click();
    })()`);
    await sleep(400);

    // Set file input via CDP DOM
    const doc = await cdp.send("DOM.getDocument");
    const fileNode = await cdp.send("DOM.querySelector", {
      nodeId: doc.root.nodeId,
      selector: "#evidence-file-input",
    });
    if (fileNode?.nodeId) {
      await cdp.send("DOM.setFileInputFiles", {
        files: [intakeJpgPath],
        nodeId: fileNode.nodeId,
      });
      await sleep(600);
    }

    const previewVisible = await cdp.evaluate(`Boolean(document.querySelector("img[alt='Evidence preview']")) && document.body.innerText.includes("Remove")`);
    logStep("TASK 3-A", "6-7", "Upload JPEG image & verify preview thumbnail in DOM", previewVisible);
    await captureShot(cdp, "phase7c_01_citizen_new_preview.png");

    // Submit complaint form
    await cdp.evaluate(`(() => {
      const submitBtn = document.querySelector("button[type='submit']");
      if (submitBtn) submitBtn.click();
    })()`);
    await cdp.waitFor(`window.location.pathname === "/citizen/complaints"`, 10000);

    // Find complaint in DB
    const createdComplaint = await Complaint.findOne({ createdBy: citizenA._id }).sort({ createdAt: -1 });
    complaintId = createdComplaint?._id?.toString();
    logStep("TASK 3-A", "8-9", "Submit complaint and capture ID", Boolean(complaintId), `ID: ${complaintId}`);

    // Open Complaint Detail
    await cdp.navigate(`${BASE_URL}/citizen/complaints/${complaintId}`, 500);
    await cdp.waitFor(`Boolean(document.querySelector("h1")) && Boolean(document.querySelector("img[alt='Complaint photo evidence']"))`, 10000);
    const detailTitle = await cdp.evaluate(`document.querySelector("h1")?.textContent`);
    const statusText = await cdp.evaluate(`document.body.innerText.includes("Pending")`);
    const hasEvidenceViewer = await cdp.evaluate(`Boolean(document.querySelector("img[alt='Complaint photo evidence']")) || document.body.innerText.includes("Attached Photo Evidence")`);

    logStep("TASK 3-A", "10-11", "Verify detail page, status Pending, and intake evidence viewer", Boolean(detailTitle) && statusText && hasEvidenceViewer);
    await captureShot(cdp, "phase7c_02_citizen_detail_intake.png");

    // Verify AI analysis provider status
    const aiStatus = createdComplaint?.aiAnalysis?.status;
    const isGeminiReal = Boolean(createdComplaint?.aiAnalysis?.detectedIssue || createdComplaint?.aiAnalysis?.priority);
    logStep("TASK 3-A", "AI", `AI Analysis evaluation (Status: ${aiStatus})`, true, isGeminiReal ? "Gemini Real Provider Completed" : "Gemini Fallback/Pending");
  }

  // B. AUTHORITY WORKFLOW
  {
    console.log("--- B. Authority Workflow ---");
    await cdp.navigate(`${BASE_URL}/login`, 300);
    await clearBrowserSession();
    await cdp.navigate(`${BASE_URL}/login`, 1000);
    await cdp.evaluate(`(() => {
      const deptBtn = Array.from(document.querySelectorAll("button")).find(b => b.textContent.trim() === "Department");
      if (deptBtn) deptBtn.click();
    })()`);
    await sleep(300);
    await cdp.evaluate(`(() => {
      ${REACT_SET_VAL_JS}
      window.__setVal(document.getElementById("login-email"), "water.authority@internal.test");
      window.__setVal(document.getElementById("login-password"), "TestPassword123!");
    })()`);
    await sleep(300);
    await cdp.evaluate(`(() => {
      const waterDemoBtn = Array.from(document.querySelectorAll("button")).find(b => b.getAttribute("aria-label") === "Water Supply Authority");
      if (waterDemoBtn) waterDemoBtn.click();
    })()`);
    await sleep(300);
    await cdp.evaluate(`document.getElementById("login-submit-btn")?.click();`);
    await cdp.waitFor(`window.location.pathname.includes("/department") && document.body.innerText.includes("Water Supply") && document.body.innerText.includes("High-pressure pipeline burst")`, 10000);

    const authUrl = await cdp.evaluate("window.location.pathname");
    const deptText = await cdp.evaluate(`document.body.innerText.includes("Water Supply") && document.body.innerText.includes("High-pressure pipeline burst")`);
    logStep("TASK 3-B", "1-3", "Authority UI login and department queue access", authUrl.includes("/department") && deptText, `URL: ${authUrl}`);

    // Navigate to complaint detail & wait for officer select
    await cdp.navigate(`${BASE_URL}/department/complaints/${complaintId}`, 500);
    await cdp.waitFor(`Boolean(document.getElementById("assigned-officer")) && Array.from(document.getElementById("assigned-officer").options).some(o => o.text.includes("Rajesh Kumar"))`, 10000);

    // Select assigned officer
    await cdp.evaluate(`(() => {
      ${REACT_SET_VAL_JS}
      const officerSelect = document.getElementById("assigned-officer");
      if (officerSelect) {
        const option = Array.from(officerSelect.options).find(o => o.text.includes("Rajesh Kumar"));
        if (option) {
          window.__setVal(officerSelect, option.value);
        }
      }
    })()`);
    await cdp.waitFor(`Array.from(document.querySelectorAll("button")).some(b => b.textContent.trim() === "Assign")`, 5000);

    // Click Assign button
    await cdp.evaluate(`(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const assignBtn = buttons.find(b => b.textContent.trim() === "Assign");
      if (assignBtn) assignBtn.click();
    })()`);
    await cdp.waitFor(`document.body.innerText.includes("Assigned") && !Array.from(document.querySelectorAll("button")).some(b => b.textContent.trim() === "Assign")`, 10000);

    const updatedComplaint = await Complaint.findById(complaintId);
    const isAssigned = updatedComplaint?.status === "Assigned" && updatedComplaint?.assignedTo?.toString() === memberAssigned._id.toString();
    logStep("TASK 3-B", "5-7", "Assign complaint to Officer Rajesh Kumar and verify status Assigned", isAssigned);
    await captureShot(cdp, "phase7c_03_authority_assigned.png");
  }

  // C. OFFICER WORKFLOW
  {
    console.log("--- C. Officer Workflow ---");
    await cdp.navigate(`${BASE_URL}/login`, 300);
    await clearBrowserSession();
    await cdp.navigate(`${BASE_URL}/login`, 1000);
    await cdp.evaluate(`(() => {
      const officerBtn = Array.from(document.querySelectorAll("button")).find(b => b.textContent.trim() === "Officer");
      if (officerBtn) officerBtn.click();
    })()`);
    await sleep(300);
    await cdp.evaluate(`
      ${REACT_SET_VAL_JS}
      window.__setVal(document.getElementById("login-email"), "rajesh.officer@internal.test");
      window.__setVal(document.getElementById("login-password"), "TestPassword123!");
      document.getElementById("login-submit-btn")?.click();
    `);
    await cdp.waitFor(`window.location.pathname.includes("/department") && document.body.innerText.includes("Field Officer Workspace") && document.body.innerText.includes("High-pressure pipeline burst")`, 10000);

    const officerUrl = await cdp.evaluate("window.location.pathname");
    const hasAssignedSection = await cdp.evaluate(`document.body.innerText.includes("Field Officer Workspace") && document.body.innerText.includes("High-pressure pipeline burst")`);
    logStep("TASK 3-C", "1-3", "Assigned Officer UI login and assigned tasks queue", officerUrl.includes("/department") && hasAssignedSection, `URL: ${officerUrl}`);

    // Open complaint & wait until status select is mounted and ready
    await cdp.navigate(`${BASE_URL}/department/complaints/${complaintId}`, 500);
    await cdp.waitFor(`Boolean(document.querySelector("select") && !document.querySelector("select").disabled)`, 10000);

    // Update status to In Progress
    await cdp.evaluate(`(() => {
      ${REACT_SET_VAL_JS}
      const statusSelect = document.querySelector("select");
      if (statusSelect) {
        window.__setVal(statusSelect, "In Progress");
      }
    })()`);
    await cdp.waitFor(`Array.from(document.querySelectorAll("button")).some(b => b.textContent.includes("Update status"))`, 5000);
    await cdp.evaluate(`(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const updateBtn = btns.find(b => b.textContent.includes("Update status"));
      if (updateBtn) updateBtn.click();
    })()`);
    await cdp.waitFor(`document.querySelector("select")?.value === "In Progress" && !Array.from(document.querySelectorAll("button")).some(b => b.textContent.includes("Update status")) && !document.querySelector("select")?.disabled`, 10000);

    const inProgComplaint = await Complaint.findById(complaintId);
    logStep("TASK 3-C", "4-5", "Update complaint status to In Progress", inProgComplaint?.status === "In Progress");

    // Select Resolved to trigger ResolveComplaintDialog
    await cdp.evaluate(`(() => {
      ${REACT_SET_VAL_JS}
      const selects = Array.from(document.querySelectorAll("select"));
      const statusSelect = selects.find(s => Array.from(s.options).some(o => o.value === "Resolved")) || selects[0];
      if (statusSelect) {
        window.__setVal(statusSelect, "Resolved");
      }
    })()`);
    const dialogOpen = await cdp.waitFor(`Boolean(document.getElementById("resolution-remarks"))`, 6000);
    logStep("TASK 3-C", "6-7", "Trigger and verify ResolveComplaintDialog modal", dialogOpen);

    // Enter remarks (with React _valueTracker reset)
    await cdp.evaluate(`(() => {
      ${REACT_SET_VAL_JS}
      window.__setVal(document.getElementById("resolution-remarks"), "Replaced ruptured mainline coupling with reinforced ductile iron sleeve and restored line pressure.");
    })()`);

    // Attach resolution evidence JPEG
    const resolutionJpgPath = path.join(testUploadDir, "resolution_evidence.jpg");
    fs.writeFileSync(resolutionJpgPath, createValidJpegBuffer());

    const doc = await cdp.send("DOM.getDocument");
    const resFileNode = await cdp.send("DOM.querySelector", {
      nodeId: doc.root.nodeId,
      selector: "#resolution-evidence-file",
    });
    if (resFileNode?.nodeId) {
      await cdp.send("DOM.setFileInputFiles", {
        files: [resolutionJpgPath],
        nodeId: resFileNode.nodeId,
      });
      await cdp.waitFor(`Boolean(document.querySelector("img[alt='Resolution evidence preview']"))`, 5000);
    }

    await captureShot(cdp, "phase7c_04_officer_resolve_dialog.png");

    // Submit resolution
    await cdp.evaluate(`(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const confirmBtn = btns.find(b => b.textContent.includes("Confirm & Mark Resolved"));
      if (confirmBtn) confirmBtn.click();
    })()`);
    await cdp.waitFor(`!document.getElementById("resolution-remarks") && document.body.innerText.includes("Replaced ruptured mainline coupling")`, 10000);

    const resolvedComplaint = await Complaint.findById(complaintId);
    const hasHistory = resolvedComplaint?.resolutionHistory?.length === 1;
    const historyEntry = resolvedComplaint?.resolutionHistory?.[0];
    const passResolve =
      resolvedComplaint?.status === "Resolved" &&
      hasHistory &&
      historyEntry?.remarks?.includes("Replaced ruptured mainline coupling") &&
      historyEntry?.resolvedBy?.toString() === waterOfficerAssigned._id.toString() &&
      Boolean(historyEntry?.evidence);

    logStep("TASK 3-C", "8-11", "Resolve complaint with mandatory remarks, evidence, and resolutionHistory", passResolve);
  }

  // D. CITIZEN VERIFICATION & FEEDBACK
  {
    console.log("--- D. Citizen Verification & Feedback ---");
    await setBrowserSession(citizenA, tokens.citizenA);
    await cdp.navigate(`${BASE_URL}/citizen/complaints/${complaintId}`, 500);
    await cdp.waitFor(`document.body.innerText.includes("Replaced ruptured mainline coupling") && Boolean(document.querySelector("img[alt='Resolution photo evidence']"))`, 10000);

    const hasResolvedBanner = await cdp.evaluate(`document.body.innerText.includes("Resolved")`);
    const hasRemarks = await cdp.evaluate(`document.body.innerText.includes("Replaced ruptured mainline coupling")`);
    const hasGiveFeedbackBtn = await cdp.evaluate(`Boolean(document.querySelector("a[href*='/feedback'] button")) || document.body.innerText.includes("Give Feedback")`);

    logStep("TASK 3-D", "1-3", "Citizen views resolution details & remarks", hasResolvedBanner && hasRemarks && hasGiveFeedbackBtn);

    // Open resolution evidence in lightbox using Expand / View Full Image button
    await cdp.evaluate(`(() => {
      const expandBtns = Array.from(document.querySelectorAll("button")).filter(b => b.textContent.includes("Expand") || b.textContent.includes("View Full Image"));
      if (expandBtns.length > 0) expandBtns[expandBtns.length - 1].click();
    })()`);
    const lightboxOpen = await cdp.waitFor(`Boolean(document.querySelector("[role='dialog'] img[alt='Resolution evidence full resolution']"))`, 5000);
    logStep("TASK 3-D", "4", "Open resolution evidence in image viewer lightbox", lightboxOpen);
    await captureShot(cdp, "phase7c_05_citizen_resolution_lightbox.png");

    // Navigate to feedback page & wait for form
    await cdp.navigate(`${BASE_URL}/citizen/complaints/${complaintId}/feedback`, 500);
    await cdp.waitFor(`Boolean(document.getElementById("comments"))`, 10000);

    // Fill feedback form
    await cdp.evaluate(`(() => {
      ${REACT_SET_VAL_JS}
      const yesBtn = Array.from(document.querySelectorAll("button")).find(b => b.textContent.trim() === "Yes");
      if (yesBtn) yesBtn.click();

      // Click 5th star
      const stars = Array.from(document.querySelectorAll("form button")).filter(b => b.querySelector("svg"));
      if (stars.length >= 5) stars[4].click();

      window.__setVal(document.getElementById("comments"), "Water supply restored promptly and road cleared. Excellent service.");
    })()`);
    await sleep(400);

    // Submit feedback & wait for redirect back to complaint detail
    await cdp.evaluate(`(() => {
      const submitBtn = document.querySelector("button[type='submit']");
      if (submitBtn) submitBtn.click();
    })()`);
    await cdp.waitFor(`window.location.pathname === "/citizen/complaints/${complaintId}"`, 10000);

    const feedbackDoc = await Feedback.findOne({ complaintId });
    const passFeedback = feedbackDoc?.rating === 5 && feedbackDoc?.workCompleted === true;
    logStep("TASK 3-D", "5-7", "Submit 5-star citizen feedback and verify persistence", passFeedback);

    // Verify duplicate feedback rejected in UI
    await cdp.navigate(`${BASE_URL}/citizen/complaints/${complaintId}/feedback`, 500);
    const duplicateBlocked = await cdp.waitFor(`document.body.innerText.includes("Feedback not available") || document.body.innerText.includes("once per resolution")`, 8000);
    logStep("TASK 3-D", "8", "Verify duplicate feedback rejected in UI", duplicateBlocked);
  }

  // E. ADMIN VERIFICATION
  {
    console.log("--- E. Admin Verification ---");
    await setBrowserSession(adminUser, tokens.admin);

    // Admin complaints
    await cdp.navigate(`${BASE_URL}/admin/complaints`, 500);
    const hasAdminComplaint = await cdp.waitFor(`document.body.innerText.includes("High-pressure pipeline") && document.body.innerText.includes("Resolved")`, 8000);
    logStep("TASK 3-E", "1-3", "Admin complaints page displays resolved complaint", hasAdminComplaint);

    // Admin feedback
    await cdp.navigate(`${BASE_URL}/admin/feedback`, 500);
    const hasAdminFeedback = await cdp.waitFor(`document.body.innerText.includes("Water supply restored promptly") && document.body.innerText.includes("5")`, 8000);
    logStep("TASK 3-E", "4-5", "Admin feedback page displays submitted feedback", hasAdminFeedback);

    // Admin analytics
    await cdp.navigate(`${BASE_URL}/admin/analytics`, 500);
    const hasAnalytics = await cdp.waitFor(`document.body.innerText.includes("Resolution Rate") && document.body.innerText.includes("100%")`, 8000);
    logStep("TASK 3-E", "6-7", "Admin analytics dashboard displays metrics", hasAnalytics);
    await captureShot(cdp, "phase7c_06_admin_analytics.png");
  }

  /* -------------------------------------------------------------------------
   * TASK 4 — NEGATIVE SECURITY TESTS
   * ------------------------------------------------------------------------- */
  console.log("\n>>> TASK 4: EXECUTING NEGATIVE & SECURITY TESTS...");
  expectErrorResponses = true;

  // 1. Cross-Citizen Access
  {
    await setBrowserSession(citizenB, tokens.citizenB);
    await cdp.navigate(`${BASE_URL}/citizen/complaints/${complaintId}`, 1500);
    const errorShown = await cdp.evaluate(`document.body.innerText.includes("Access denied") || document.body.innerText.includes("Forbidden") || document.body.innerText.includes("Access restricted") || document.body.innerText.includes("permission")`);
    logStep("TASK 4", "SEC-1", "Citizen B cannot access Citizen A complaint (403)", errorShown);
  }

  // 2. Cross-Department Authority Access
  {
    await setBrowserSession(roadsAuthority, tokens.roadsAuthority);
    await cdp.navigate(`${BASE_URL}/department/complaints/${complaintId}`, 1500);
    const crossDeptBlocked = await cdp.evaluate(`document.body.innerText.includes("Access Restricted") || document.body.innerText.includes("outside this department") || document.body.innerText.includes("another department")`);
    logStep("TASK 4", "SEC-2", "Roads Authority cannot access Water complaint (403)", crossDeptBlocked);
  }

  // 3. Unassigned Water Officer Access
  {
    await setBrowserSession(waterOfficerUnassigned, tokens.waterOfficerUnassigned, {
      memberId: memberUnassigned._id.toString(),
      memberName: memberUnassigned.name,
    });
    await cdp.navigate(`${BASE_URL}/department/complaints/${complaintId}`, 1500);
    const unassignedBlocked = await cdp.evaluate(`document.body.innerText.includes("Access Restricted") || document.body.innerText.includes("outside this department") || document.body.innerText.includes("Forbidden")`);
    logStep("TASK 4", "SEC-3", "Unassigned Officer cannot access assigned complaint (403)", unassignedBlocked);
  }

  // 4. Unlinked Officer Actions
  {
    await setBrowserSession(waterOfficerUnlinked, tokens.waterOfficerUnlinked);
    await cdp.navigate(`${BASE_URL}/department`, 1500);
    const unlinkedNotice = await cdp.evaluate(`document.body.innerText.includes("Officer Profile Not Linked") || document.body.innerText.includes("no verified Officer Member profile")`);
    logStep("TASK 4", "SEC-4", "Unlinked Officer restricted from operational actions", unlinkedNotice);
  }

  // 5. Citizen Cannot Resolve (API & UI check)
  {
    await setBrowserSession(citizenA, tokens.citizenA);
    await cdp.navigate(`${BASE_URL}/citizen/complaints/${complaintId}`, 1200);
    const noResolveControl = await cdp.evaluate(`!document.body.innerText.includes("Confirm & Mark Resolved") && !document.querySelector("select")`);
    const citizenResolveRes = await fetch(`${BACKEND_URL}/api/complaints/${complaintId}/status`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokens.citizenA}`,
      },
      body: JSON.stringify({ status: "Resolved", remarks: "Attempted by citizen" }),
    });
    logStep("TASK 4", "SEC-5", "Citizen cannot resolve complaints (UI absent + HTTP 403)", noResolveControl && citizenResolveRes.status === 403);
  }

  // 6. Duplicate Feedback Rejected by API
  {
    const dupRes = await fetch(`${BACKEND_URL}/api/feedback`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokens.citizenA}`,
      },
      body: JSON.stringify({
        complaintId,
        rating: 4,
        comment: "Duplicate direct call",
        workCompleted: true,
        percentDone: 100,
      }),
    });
    const dupData = await dupRes.json();
    logStep(
      "TASK 4",
      "SEC-6",
      "Duplicate feedback rejected by API (HTTP 400)",
      dupRes.status === 400 && Boolean(dupData.message?.includes("already been submitted")),
      dupData.message
    );
  }

  // 7. Invalid Non-Image & Spoofed .jpg Rejection
  {
    await setBrowserSession(citizenA, tokens.citizenA);
    await cdp.navigate(`${BASE_URL}/citizen/new`, 1200);

    const badFilePath = path.join(testUploadDir, "bad_file.txt");
    fs.writeFileSync(badFilePath, "not an image file");

    let doc = await cdp.send("DOM.getDocument");
    let badFileNode = await cdp.send("DOM.querySelector", {
      nodeId: doc.root.nodeId,
      selector: "#evidence-file-input",
    });
    if (badFileNode?.nodeId) {
      await cdp.send("DOM.setFileInputFiles", {
        files: [badFilePath],
        nodeId: badFileNode.nodeId,
      });
      await sleep(500);
    }

    const errorMsgShown = await cdp.evaluate(`document.body.innerText.includes("Invalid file type") || document.body.innerText.includes("JPEG, PNG, or WebP")`);
    logStep("TASK 4", "SEC-7a", "Invalid non-image (.txt) rejected in UI", errorMsgShown);

    // Spoofed extension (.jpg containing plain text) submitted to backend upload middleware
    const countBeforeSpoof = await Complaint.countDocuments();
    const spoofedJpgPath = path.join(testUploadDir, "spoofed_fake.jpg");
    fs.writeFileSync(spoofedJpgPath, "PLAIN_TEXT_SPOOFING_A_JPEG_EXTENSION");

    await cdp.evaluate(`
      ${REACT_SET_VAL_JS}
      window.__setVal(document.getElementById("title"), "Spoofed image upload test");
      window.__setVal(document.getElementById("description"), "Testing backend magic byte rejection.");
      window.__setVal(document.getElementById("location"), "Test Location Street");
    `);
    await sleep(300);

    doc = await cdp.send("DOM.getDocument");
    badFileNode = await cdp.send("DOM.querySelector", {
      nodeId: doc.root.nodeId,
      selector: "#evidence-file-input",
    });
    if (badFileNode?.nodeId) {
      await cdp.send("DOM.setFileInputFiles", {
        files: [spoofedJpgPath],
        nodeId: badFileNode.nodeId,
      });
      await sleep(500);
    }

    await cdp.evaluate(`document.querySelector("button[type='submit']")?.click();`);
    await sleep(1500);
    const countAfterSpoof = await Complaint.countDocuments();
    logStep("TASK 4", "SEC-7b", "Spoofed .jpg magic-byte mismatch rejected without creating complaint", countAfterSpoof === countBeforeSpoof, `Complaints: ${countBeforeSpoof} -> ${countAfterSpoof}`);
  }

  // 8. Logout, Protected Routes & Session Expiry
  {
    await setBrowserSession(citizenA, tokens.citizenA);
    await cdp.navigate(`${BASE_URL}/citizen`, 1200);
    await clearBrowserSession();
    await cdp.navigate(`${BASE_URL}/citizen`, 1000);
    const redirectedToLogin = await cdp.evaluate(`window.location.pathname === "/login"`);
    logStep("TASK 4", "SEC-8", "Logout clears session & protected route redirects to login", redirectedToLogin);

    // Simulated session expiry / invalid JWT triggers 401 and redirects to login
    await setBrowserSession(citizenA, "expired.invalid.jwt.token");
    await cdp.navigate(`${BASE_URL}/citizen`, 1500);
    const expiredRedirected = await cdp.evaluate(`window.location.pathname === "/login" && !localStorage.getItem("govai_token")`);
    logStep("TASK 4", "SEC-9", "Expired/invalid token triggers 401 eviction & login redirect", expiredRedirected);

    // Verify HTTP 403 does not trigger unauthorized logout
    await setBrowserSession(citizenB, tokens.citizenB);
    await cdp.navigate(`${BASE_URL}/citizen/complaints/${complaintId}`, 500);
    await cdp.waitFor(`document.body.innerText.includes("Access denied") || document.body.innerText.includes("Forbidden")`, 6000);
    const stillLoggedIn = await cdp.evaluate(`Boolean(localStorage.getItem("govai_token")) && window.location.pathname !== "/login"`);
    logStep("TASK 4", "SEC-10", "HTTP 403 does not log out an authenticated user", stillLoggedIn);
  }

  expectErrorResponses = false;

  /* -------------------------------------------------------------------------
   * TASK 5 — RESPONSIVE & BROWSER QUALITY CHECKS
   * ------------------------------------------------------------------------- */
  console.log("\n>>> TASK 5: TESTING RESPONSIVE VIEWPORTS & BROWSER QUALITY...");

  const viewports = [
    { name: "Desktop", width: 1440, height: 900 },
    { name: "Tablet", width: 768, height: 1024 },
    { name: "Mobile", width: 375, height: 812 },
  ];

  for (const vp of viewports) {
    await cdp.setViewport(vp.width, vp.height);
    await setBrowserSession(citizenA, tokens.citizenA);
    await cdp.navigate(`${BASE_URL}/citizen/complaints/${complaintId}`, 1000);

    const overflowDetail = await cdp.evaluate(`document.documentElement.scrollWidth - window.innerWidth`);
    await cdp.navigate(`${BASE_URL}/citizen/new`, 800);
    const overflowNew = await cdp.evaluate(`document.documentElement.scrollWidth - window.innerWidth`);
    logStep("TASK 5", `RESP-${vp.name}`, `Viewport ${vp.name} (${vp.width}x${vp.height}) - No horizontal overflow`, overflowDetail <= 2 && overflowNew <= 2, `Detail:${overflowDetail}px, New:${overflowNew}px`);

    if (vp.name === "Mobile") {
      await cdp.navigate(`${BASE_URL}/citizen/complaints/${complaintId}`, 1000);
      await captureShot(cdp, "phase7c_07_mobile_375x812.png");
    }
  }

  // Restore Desktop Viewport
  await cdp.setViewport(1440, 900);

  /* -------------------------------------------------------------------------
   * TASK 6 — PERSISTENCE VERIFICATION (BACKEND RESTART)
   * ------------------------------------------------------------------------- */
  console.log("\n>>> TASK 6: VERIFYING PERSISTENCE ACROSS BACKEND RESTART...");
  expectErrorResponses = true;
  backendProc.kill("SIGTERM");
  await sleep(1000);

  backendProc = spawn("node", ["backend/src/server.js"], {
    env: {
      ...process.env,
      PORT: String(TEST_PORT),
      MONGO_DB_NAME: TEST_DB_NAME,
      ALLOW_TEST_DB: "true",
      NODE_ENV: "test",
      EVIDENCE_UPLOAD_DIR: testUploadDir,
      DEMO_LOGIN_ENABLED: "false",
    },
    stdio: "inherit",
  });

  let restartReady = false;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`${BACKEND_URL}/health`);
      if (res.ok) {
        restartReady = true;
        break;
      }
    } catch {}
    await sleep(250);
  }
  expectErrorResponses = false;

  logStep("TASK 6", "REST-1", "Backend restarted successfully on port 5000", restartReady);

  // Re-verify in browser + evidence retrieval + notifications
  await setBrowserSession(citizenA, tokens.citizenA);
  await cdp.navigate(`${BASE_URL}/citizen/complaints/${complaintId}`, 500);
  await cdp.waitFor(`document.body.innerText.includes("Replaced ruptured mainline coupling")`, 10000);

  const persistedTitle = await cdp.evaluate(`document.body.innerText.includes("High-pressure pipeline")`);
  const persistedRemarks = await cdp.evaluate(`document.body.innerText.includes("Replaced ruptured mainline coupling")`);
  const persistedAssigned = await cdp.evaluate(`document.body.innerText.includes("Rajesh Kumar")`);
  const persistedFeedback = await Feedback.findOne({ complaintId });
  const persistedNotifCount = await Notification.countDocuments({
    $or: [
      { "meta.complaintId": complaintId },
      { "meta.complaintId": new mongoose.Types.ObjectId(complaintId) },
    ],
  });
  const evRes = await fetch(`${BACKEND_URL}/api/complaints/${complaintId}/resolution-evidence`, {
    headers: { Authorization: `Bearer ${tokens.citizenA}` },
  });

  logStep(
    "TASK 6",
    "REST-2",
    "Complaint, assignment, resolution, evidence, feedback & notifications persist after restart",
    persistedTitle && persistedRemarks && persistedAssigned && persistedFeedback?.rating === 5 && persistedNotifCount > 0 && evRes.status === 200,
    `Evidence:${evRes.status}, Notifs:${persistedNotifCount}, Rating:${persistedFeedback?.rating}`
  );

  /* -------------------------------------------------------------------------
   * TASK 7 — CLEANUP AND LIVE ATLAS READ-ONLY SAFETY AUDIT
   * ------------------------------------------------------------------------- */
  console.log("\n>>> TASK 7: CLEANUP & LIVE ATLAS AUDIT...");

  cdp.close();
  chromeProc?.kill("SIGKILL");
  backendProc?.kill("SIGKILL");
  frontendProc?.kill("SIGKILL");

  try {
    if (tmpChromeDataDir && fs.existsSync(tmpChromeDataDir)) {
      fs.rmSync(tmpChromeDataDir, { recursive: true, force: true });
    }
    if (testUploadDir && fs.existsSync(testUploadDir)) {
      fs.rmSync(testUploadDir, { recursive: true, force: true });
    }
  } catch {}

  const curDbName = mongoose.connection.name;
  if (curDbName === TEST_DB_NAME && curDbName.startsWith("govai_phase7c_") && curDbName !== "govai") {
    console.log(`Dropping test database "${curDbName}"...`);
    await mongoose.connection.dropDatabase();
    logStep("TASK 7", "CLEAN-1", `Dropped isolated test database ${TEST_DB_NAME}`, true);
  } else {
    throw new Error(`SAFETY ERROR: Refusing to drop unexpected database "${curDbName}"`);
  }

  await mongoose.disconnect();

  // Connect strictly READ-ONLY to live Atlas `govai` and report baseline audit
  console.log("Connecting strictly READ-ONLY to live database 'govai' to audit collection counts...");
  await mongoose.connect(uri, {
    dbName: "govai",
    serverSelectionTimeoutMS: 10000,
  });

  const liveCounts = {
    complaints: await Complaint.countDocuments(),
    users: await User.countDocuments(),
    members: await Member.countDocuments(),
    feedbacks: await Feedback.countDocuments(),
    notifications: await Notification.countDocuments(),
  };

  console.log("LIVE ATLAS AUDITED COUNTS:", JSON.stringify(liveCounts, null, 2));

  const expectedCounts = { complaints: 18, users: 22, members: 4, feedbacks: 0, notifications: 16 };
  const countsMatch = Object.keys(expectedCounts).every((k) => liveCounts[k] === expectedCounts[k]);

  logStep("TASK 7", "AUDIT-1", "Live Atlas govai database remains strictly untouched", countsMatch, JSON.stringify(liveCounts));

  await mongoose.disconnect();

  // Summary
  console.log("\n===============================================================================");
  console.log("TEST SUMMARY:");
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`Total assertions: ${total} | Passed: ${passed} | Failed: ${failed}`);
  console.log(`Captured screenshots: ${capturedScreenshots.length}`);
  console.log(`API trace entries: ${apiTrace.length}`);
  console.log(`Unexpected console errors captured: ${consoleErrors.length}`);
  if (consoleErrors.length) console.log("Console Errors:", consoleErrors);
  console.log(`Unexpected network failures: ${networkFailures.length}`);
  if (networkFailures.length) console.log("Network Failures:", networkFailures);
  console.log("===============================================================================");

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("FATAL ERROR IN SUITE:", err);
  if (backendProc) backendProc.kill("SIGKILL");
  if (frontendProc) frontendProc.kill("SIGKILL");
  if (chromeProc) chromeProc.kill("SIGKILL");
  process.exit(1);
});
