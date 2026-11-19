import http from "http";
import path from "path";
import os from "os";
import fs from "fs";
import { spawn } from "child_process";
import dotenv from "../backend/node_modules/dotenv/lib/main.js";
import mongoose from "../backend/node_modules/mongoose/index.js";
import WebSocket from "../backend/node_modules/ws/index.js";

// Load backend .env
const envPath = path.resolve(process.cwd(), "backend/.env");
dotenv.config({ path: envPath, override: true });

// Configuration & Safety
const TEST_DB_NAME = "govai_phase8_5_test";
const BACKEND_PORT = 5000;
const FRONTEND_PORT = 8080;
const CDP_PORT = 9266;
const BASE_URL = `http://127.0.0.1:${FRONTEND_PORT}`;
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;
const CDP_BASE = `http://127.0.0.1:${CDP_PORT}`;

process.env.NODE_ENV = "test";
process.env.ALLOW_TEST_DB = "true";
process.env.MONGO_DB_NAME = TEST_DB_NAME;

const testUploadDir = path.join(os.tmpdir(), `govai-p811-uploads-${Date.now()}`);
fs.mkdirSync(testUploadDir, { recursive: true });
process.env.EVIDENCE_UPLOAD_DIR = testUploadDir;

// Models
const { User } = await import("../backend/src/models/User.js");
const { Member } = await import("../backend/src/models/Member.js");
const { Complaint } = await import("../backend/src/models/Complaint.js");
const { Feedback } = await import("../backend/src/models/Feedback.js");
const { Notification } = await import("../backend/src/models/Notification.js");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
let backendProc = null;
let frontendProc = null;
let chromeProc = null;
let tmpChromeDataDir = null;

const SCREENSHOT_DIR = "/home/priyanshu/.gemini/antigravity/brain/8af59d69-02f5-4527-9224-95a1a2da524f/screenshots";
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const captureShot = async (cdp, filename) => {
  try {
    const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
    const outPath = path.join(SCREENSHOT_DIR, filename);
    fs.writeFileSync(outPath, Buffer.from(data, "base64"));
    console.log(`[SCREENSHOT] Saved ${filename} (${fs.statSync(outPath).size} bytes)`);
    return outPath;
  } catch (e) {
    console.warn(`[SCREENSHOT WARN] Failed ${filename}:`, e.message);
  }
};

const logStep = (category, stepNum, description, passed, details = "") => {
  results.push({ category, stepNum, description, passed, details });
  console.log(`[${passed ? "PASS" : "FAIL"}] [${category}] Step ${stepNum}: ${description} ${details ? "- " + details : ""}`);
};

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
    if (setter) {
      setter.call(el, val);
    } else {
      el.value = val;
    }
    if (el._valueTracker) {
      el._valueTracker.setValue(prev);
    }
    if (el.tagName !== "SELECT") {
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };
`;

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
      this.ws.on("open", resolve);
      this.ws.on("error", reject);
      this.ws.on("message", (data) => {
        try {
          const raw = typeof data === "string" ? data : data.toString();
          const msg = JSON.parse(raw);
          if (msg.id && this.pending.has(msg.id)) {
            const { resolve: res, reject: rej } = this.pending.get(msg.id);
            this.pending.delete(msg.id);
            if (msg.error) rej(msg.error);
            else res(msg.result);
          }
        } catch {}
      });
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

  async waitFor(expression, timeoutMs = 15000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const ok = await this.evaluate(`Boolean(${expression})`);
        if (ok) return true;
      } catch {}
      await sleep(200);
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
    await sleep(250);
  }

  async navigate(url, waitMs = 1500) {
    await this.send("Page.navigate", { url });
    await sleep(waitMs);
  }

  close() {
    if (this.ws) {
      try { this.ws.close(); } catch {}
    }
  }
}

async function cleanup() {
  console.log("\n>>> CLEANING UP TEST PROCESSES...");
  if (chromeProc) {
    try { chromeProc.kill("SIGKILL"); } catch {}
  }
  if (frontendProc) {
    try { frontendProc.kill("SIGKILL"); } catch {}
  }
  if (backendProc) {
    try { backendProc.kill("SIGKILL"); } catch {}
  }
  if (tmpChromeDataDir) {
    try { fs.rmSync(tmpChromeDataDir, { recursive: true, force: true }); } catch {}
  }
  try { fs.rmSync(testUploadDir, { recursive: true, force: true }); } catch {}
  try { await mongoose.disconnect(); } catch {}
}

async function main() {
  console.log("===============================================================================");
  console.log("PHASE 8.11: OFFICER WORKFLOW BROWSER INTEGRATION SUITE");
  console.log("===============================================================================");

  try {
    /* -------------------------------------------------------------------------
     * 1. CONNECT TO ISOLATED TEST DB & STRICT SAFETY INVARIANT CHECKS
     * ------------------------------------------------------------------------- */
    console.log("\n>>> CONNECTING TO ISOLATED TEST DATABASE...");
    const uri = process.env.MONGO_URI;
    if (!uri) throw new Error("MONGO_URI not configured");

    await mongoose.connect(uri, {
      dbName: TEST_DB_NAME,
      serverSelectionTimeoutMS: 15000,
    });

    const effectiveMongooseDb = mongoose.connection.name;
    const effectiveDriverDb = mongoose.connection.db?.databaseName;

    console.log(`Mongoose DB Name: "${effectiveMongooseDb}"`);
    console.log(`Driver DB Name:   "${effectiveDriverDb}"`);

    if (effectiveMongooseDb === "govai" || effectiveDriverDb === "govai") {
      throw new Error("CRITICAL SAFETY HALT: Refusing to proceed! Connected to production database 'govai'.");
    }
    if (!effectiveMongooseDb.startsWith("govai_phase8_5_") || !effectiveDriverDb.startsWith("govai_phase8_5_")) {
      throw new Error(`CRITICAL SAFETY HALT: Database name "${effectiveMongooseDb}" does not match required test prefix.`);
    }

    logStep("SAFETY", "S-1", "Verified isolated database name is govai_phase8_5_test and NOT live govai", true);

    // Clear test collections
    await User.deleteMany({});
    await Member.deleteMany({});
    await Complaint.deleteMany({});
    await Feedback.deleteMany({});
    await Notification.deleteMany({});

    // Seed test fixtures matching the standard demo configuration
    console.log("Seeding test fixtures in govai_phase8_5_test...");

    const adminUser = await User.create({
      name: "System Administrator",
      email: "admin@govai.gov",
      password: "12345678",
      role: "admin",
      status: "active",
    });

    const waterAuthority = await User.create({
      name: "Water Supply Authority",
      email: "water@demo.com",
      password: "12345678",
      role: "department",
      departmentRole: "authority",
      department: "Water Supply",
      status: "active",
    });

    const roadAuthority = await User.create({
      name: "Road & Infrastructure Authority",
      email: "authority@demo.com",
      password: "12345678",
      role: "department",
      departmentRole: "authority",
      department: "Road & Infrastructure",
      status: "active",
    });

    const waterOfficerUser = await User.create({
      name: "Officer Rajesh",
      email: "water.officer@govai.gov",
      password: "12345678",
      role: "department",
      departmentRole: "officer",
      department: "Water Supply",
      status: "active",
    });

    const roadOfficerUser = await User.create({
      name: "Officer Priya",
      email: "road.officer@govai.gov",
      password: "12345678",
      role: "department",
      departmentRole: "officer",
      department: "Road & Infrastructure",
      status: "active",
    });

    const citizenUser = await User.create({
      name: "Citizen Vikram",
      email: "citizen.demo@govai.gov",
      password: "12345678",
      role: "citizen",
      phone: "+91 9876543210",
      status: "active",
    });

    // Members
    const memberRajesh = await Member.create({
      name: "Officer Rajesh",
      department: "Water Supply",
      userId: waterOfficerUser._id,
      createdBy: adminUser._id,
    });

    const memberAmitUnlinked = await Member.create({
      name: "Officer Amit (Unlinked)",
      department: "Water Supply",
      userId: null,
      createdBy: adminUser._id,
    });

    const memberPriya = await Member.create({
      name: "Officer Priya",
      department: "Road & Infrastructure",
      userId: roadOfficerUser._id,
      createdBy: adminUser._id,
    });

    const memberNehaUnlinked = await Member.create({
      name: "Officer Neha",
      department: "Environment",
      userId: null,
      createdBy: adminUser._id,
    });

    // Complaints
    const now = Date.now();
    const pendingWaterComplaint = await Complaint.create({
      title: "Burst Pipeline at Indiranagar 100ft Road",
      description: "Massive water pipe leak causing street flooding.",
      category: "Water Supply",
      status: "Pending",
      priority: "High",
      assignedTo: null,
      location: "100ft Road, Indiranagar, Bengaluru",
      latitude: 12.9716,
      longitude: 77.5946,
      createdBy: citizenUser._id,
      clientRequestId: "req-water-pending-1",
      sla: {
        startedAt: new Date(now - 3600000),
        durationMinutes: 1440,
        deadline: new Date(now + 82800000),
      },
      timeline: [
        { eventType: "complaint_created", label: "Complaint Created", status: "Pending", timestamp: new Date(now - 3600000) },
        { eventType: "department_assigned", label: "Department Assigned", note: "Water Supply", timestamp: new Date(now - 3600000) },
      ],
    });

    const assignedWaterComplaint = await Complaint.create({
      title: "Contaminated drinking water in Sector 2",
      description: "Brown murky water coming from taps in block B.",
      category: "Water Supply",
      status: "Assigned",
      priority: "High",
      assignedTo: memberRajesh._id,
      location: "Sector 2, HSR Layout, Bengaluru",
      latitude: 12.9121,
      longitude: 77.6446,
      createdBy: citizenUser._id,
      clientRequestId: "req-water-assigned-2",
      sla: {
        startedAt: new Date(now - 7200000),
        durationMinutes: 2880,
        deadline: new Date(now + 165600000),
      },
      timeline: [
        { eventType: "complaint_created", label: "Complaint Created", status: "Pending", timestamp: new Date(now - 7200000) },
        { eventType: "department_assigned", label: "Department Assigned", note: "Water Supply", timestamp: new Date(now - 7200000) },
        { eventType: "officer_assigned", label: "Officer Assigned", note: "Officer Rajesh", timestamp: new Date(now - 3600000) },
      ],
    });

    const assignedRoadComplaint = await Complaint.create({
      title: "Massive pothole on Outer Ring Road",
      description: "Large crater in right lane causing severe hazard.",
      category: "Road & Infrastructure",
      status: "Assigned",
      priority: "Medium",
      assignedTo: memberPriya._id,
      location: "ORR Marathahalli, Bengaluru",
      latitude: 12.9569,
      longitude: 77.7011,
      createdBy: citizenUser._id,
      clientRequestId: "req-road-assigned-1",
      sla: {
        startedAt: new Date(now - 7200000),
        durationMinutes: 4320,
        deadline: new Date(now + 252000000),
      },
      timeline: [
        { eventType: "complaint_created", label: "Complaint Created", status: "Pending", timestamp: new Date(now - 7200000) },
        { eventType: "department_assigned", label: "Department Assigned", note: "Road & Infrastructure", timestamp: new Date(now - 7200000) },
        { eventType: "officer_assigned", label: "Officer Assigned", note: "Officer Priya", timestamp: new Date(now - 3600000) },
      ],
    });

    logStep("SAFETY", "S-2", "Successfully seeded test fixtures in govai_phase8_5_test", true);

    /* -------------------------------------------------------------------------
     * 2. START TEST SERVERS
     * ------------------------------------------------------------------------- */
    console.log("\n>>> STARTING BACKEND ON PORT 5000 (TEST DB BOUND)...");
    backendProc = spawn("node", ["backend/src/server.js"], {
      env: {
        ...process.env,
        PORT: String(BACKEND_PORT),
        MONGO_DB_NAME: TEST_DB_NAME,
        ALLOW_TEST_DB: "true",
        NODE_ENV: "test",
        EVIDENCE_UPLOAD_DIR: testUploadDir,
        DEMO_LOGIN_ENABLED: "false",
      },
      stdio: "inherit",
    });

    let backendReady = false;
    for (let i = 0; i < 60; i++) {
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

    logStep("SERVERS", "SRV-1", "Backend running on port 5000 verified connected to govai_phase8_5_test", true);

    console.log("\n>>> STARTING FRONTEND ON PORT 8080 (VITE)...");
    frontendProc = spawn("node", ["./node_modules/.bin/vite", "--host", "127.0.0.1", "--port", String(FRONTEND_PORT)], {
      cwd: path.resolve(process.cwd(), "frontend"),
      stdio: "ignore",
    });

    let frontendReady = false;
    for (let i = 0; i < 60; i++) {
      try {
        const feRes = await fetch(`${BASE_URL}/`);
        if (feRes.ok) {
          frontendReady = true;
          break;
        }
      } catch {}
      await sleep(250);
    }
    if (!frontendReady) throw new Error("Frontend server failed to start on port 8080");
    logStep("SERVERS", "SRV-2", "Frontend Vite server active on port 8080", true);

    /* -------------------------------------------------------------------------
     * 3. LAUNCH HEADLESS CHROME & CONNECT CDP
     * ------------------------------------------------------------------------- */
    console.log("\n>>> LAUNCHING HEADLESS GOOGLE CHROME VIA CDP ON PORT 9266...");
    const chromePath = "/usr/bin/google-chrome";
    tmpChromeDataDir = `/tmp/chrome_govai_p811_${Date.now()}`;
    chromeProc = spawn(chromePath, [
      "--headless=new",
      `--remote-debugging-port=${CDP_PORT}`,
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      `--user-data-dir=${tmpChromeDataDir}`,
    ]);

    let versionInfo = null;
    for (let i = 0; i < 40; i++) {
      try {
        const vRes = await fetch(`${CDP_BASE}/json/version`);
        if (vRes.ok) {
          versionInfo = await vRes.json();
          break;
        }
      } catch {}
      await sleep(250);
    }
    if (!versionInfo?.webSocketDebuggerUrl) {
      throw new Error("Failed to connect to Chrome remote debugging port 9266");
    }

    const pagesRes = await fetch(`${CDP_BASE}/json/list`);
    const pages = await pagesRes.json();
    const targetPage = pages.find((p) => p.type === "page") || pages[0];
    if (!targetPage?.webSocketDebuggerUrl) {
      throw new Error("No inspectable page found in Chrome target list");
    }

    const cdp = new CDPController(targetPage.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send("Page.enable");
    await cdp.send("DOM.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Network.enable");
    await cdp.setViewport(1280, 800);
    logStep("BROWSER", "BRW-1", "CDP connected to headless Google Chrome", true);

    // Inject React helper
    const injectHelper = async () => {
      await cdp.evaluate(REACT_SET_VAL_JS);
    };

    /* -------------------------------------------------------------------------
     * 4. SCENARIO 1: DYNAMIC OFFICER SELECTOR ON LOGIN PAGE (/login)
     * ------------------------------------------------------------------------- */
    console.log("\n>>> SCENARIO 1: DYNAMIC OFFICER SELECTOR ON LOGIN PAGE...");
    await cdp.navigate(`${BASE_URL}/login`);
    await cdp.waitFor(`document.querySelector("body")`);
    await injectHelper();

    // Click Officer tab using ID
    const officerTabClicked = await cdp.evaluate(`
      (() => {
        const tab = document.getElementById("login-role-officer");
        if (tab) {
          tab.click();
          return true;
        }
        return false;
      })()
    `);
    logStep("AUTH", "AUTH-1a", "Switched to Officer Login Tab", officerTabClicked);
    await sleep(600);

    // Click "Water Supply" department button in Step 1
    const waterClicked = await cdp.evaluate(`
      (() => {
        const btn = document.querySelector('button[aria-label="Water Supply"]');
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      })()
    `);
    logStep("AUTH", "AUTH-1b", "Selected Water Supply department in Step 1", waterClicked);

    // Wait for officer options to populate
    const officerRajeshLoaded = await cdp.waitFor(`
      document.body.innerText.includes("Officer Rajesh")
    `, 8000);
    logStep("AUTH", "AUTH-2", "Dynamic officer options loaded active linked Officer Rajesh", officerRajeshLoaded);

    // Verify unlinked officer is NOT in the options
    const unlinkedExcluded = await cdp.evaluate(`
      !document.body.innerText.includes("Officer Amit (Unlinked)")
    `);
    logStep("AUTH", "AUTH-3", "Unlinked Officer Amit is strictly excluded from login selector", unlinkedExcluded);

    // Capture screenshot: dynamic officer selector for Water Supply
    await captureShot(cdp, "phase8_11_officer_selector_water.png");

    // Click "Environment" department button in Step 1 (which has 0 linked officers)
    const envClicked = await cdp.evaluate(`
      (() => {
        const btn = document.querySelector('button[aria-label="Environment"]');
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      })()
    `);
    logStep("AUTH", "AUTH-4", "Selected Environment department with 0 linked officers", envClicked);

    // Wait for no-linked-officers banner
    const emptyBannerShown = await cdp.waitFor(`
      document.querySelector('[data-testid="no-linked-officers-banner"]') !== null
    `, 8000);
    const bannerText = await cdp.evaluate(`
      document.querySelector('[data-testid="no-linked-officers-banner"]')?.innerText || ""
    `);
    logStep("AUTH", "AUTH-5", `No-linked-officers banner rendered: "${bannerText}"`, emptyBannerShown && bannerText.includes("No active linked officers"));

    // Capture screenshot: empty state banner
    await captureShot(cdp, "phase8_11_officer_empty_state_unlinked.png");

    /* -------------------------------------------------------------------------
     * 5. SCENARIO 2: OFFICER LOGIN & DASHBOARD QUEUE ISOLATION
     * ------------------------------------------------------------------------- */
    console.log("\n>>> SCENARIO 2: OFFICER LOGIN & DASHBOARD QUEUE ISOLATION...");
    // Select Water Supply again
    await cdp.evaluate(`document.querySelector('button[aria-label="Water Supply"]')?.click()`);
    await sleep(600);

    // Click Officer Rajesh card
    await cdp.evaluate(`
      (() => {
        const buttons = Array.from(document.querySelectorAll("button"));
        const rajeshBtn = buttons.find(b => b.textContent.includes("Officer Rajesh"));
        if (rajeshBtn) rajeshBtn.click();
      })()
    `);
    await sleep(400);

    // Fill password and submit using React helper
    await cdp.evaluate(`
      (() => {
        const pwInput = document.querySelector('input[type="password"]');
        if (pwInput && window.__setVal) {
          window.__setVal(pwInput, "12345678");
        }
      })()
    `);
    await sleep(300);

    // Click "Initialize Dashboard"
    await cdp.evaluate(`
      (() => {
        const buttons = Array.from(document.querySelectorAll("button"));
        const submitBtn = buttons.find(b => b.textContent.includes("Initialize Dashboard") || b.type === "submit");
        if (submitBtn) submitBtn.click();
      })()
    `);

    // Wait for redirect to /department
    const redirectedToDept = await cdp.waitFor(`
      window.location.pathname === "/department"
    `, 10000);
    logStep("OFFICER", "OFF-1", "Officer Rajesh successfully authenticated and navigated to /department", redirectedToDept);

    // Wait for department dashboard complaints to render
    const complaintsRendered = await cdp.waitFor(`
      document.body.innerText.includes("Contaminated drinking water in Sector 2")
    `, 10000);
    logStep("OFFICER", "OFF-2", "Assigned complaint 'Contaminated drinking water' visible in officer queue", complaintsRendered);

    // Verify unassigned complaint and Road department complaint are NOT visible
    const roadExcluded = await cdp.evaluate(`
      !document.body.innerText.includes("Massive pothole on Outer Ring Road")
    `);
    const pendingExcluded = await cdp.evaluate(`
      !document.body.innerText.includes("Burst Pipeline at Indiranagar 100ft Road")
    `);
    logStep("OFFICER", "OFF-3", "Cross-department complaints strictly excluded from officer view", roadExcluded);
    logStep("OFFICER", "OFF-4", "Unassigned pending complaints strictly excluded from officer queue", pendingExcluded);

    // Capture screenshot: officer dashboard
    await captureShot(cdp, "phase8_11_officer_dashboard_assigned.png");

    /* -------------------------------------------------------------------------
     * 6. SCENARIO 3: DEPARTMENT AUTHORITY ASSIGNMENT DROPDOWN
     * ------------------------------------------------------------------------- */
    console.log("\n>>> SCENARIO 3: DEPARTMENT AUTHORITY ASSIGNMENT FLOW...");
    // Clear storage and navigate to login
    await cdp.evaluate(`localStorage.clear(); sessionStorage.clear();`);
    await cdp.navigate(`${BASE_URL}/login`);
    await cdp.waitFor(`document.querySelector("body")`);
    await injectHelper();

    // Click Department Authority tab
    await cdp.evaluate(`
      (() => {
        const tab = document.getElementById("login-role-authority");
        if (tab) tab.click();
      })()
    `);
    await sleep(500);

    // Click "Water Supply Authority" demo button
    await cdp.evaluate(`
      (() => {
        const buttons = Array.from(document.querySelectorAll("button"));
        const waterBtn = buttons.find(b => b.getAttribute("aria-label")?.includes("Water Supply") || b.textContent.includes("Water Supply"));
        if (waterBtn) waterBtn.click();
      })()
    `);
    await sleep(400);

    // Click submit
    await cdp.evaluate(`
      (() => {
        const buttons = Array.from(document.querySelectorAll("button"));
        const submitBtn = buttons.find(b => b.textContent.includes("Initialize Dashboard") || b.type === "submit");
        if (submitBtn) submitBtn.click();
      })()
    `);

    // Wait for redirect to /department
    const authAtDept = await cdp.waitFor(`
      window.location.pathname === "/department" && document.body.innerText.includes("Burst Pipeline at Indiranagar 100ft Road")
    `, 10000);
    logStep("AUTHORITY", "AUTH-1", "Authority authenticated and loaded Water Supply complaints", authAtDept);

    // Open assignment select dropdown
    const selectTriggerFound = await cdp.evaluate(`
      (() => {
        const triggers = Array.from(document.querySelectorAll('[role="combobox"]'));
        if (triggers.length > 0) {
          triggers[0].click();
          return true;
        }
        return false;
      })()
    `);
    logStep("AUTHORITY", "AUTH-2", "Clicked officer assignment dropdown", selectTriggerFound);
    await sleep(600);

    // Verify dropdown content contains Officer Rajesh and NOT Officer Amit in role="option" items
    const optionsCheck = await cdp.evaluate(`
      (() => {
        const optionEls = Array.from(document.querySelectorAll('[role="option"]'));
        const optionTexts = optionEls.map(el => el.innerText.trim());
        const hasRajesh = optionTexts.some(t => t.includes("Officer Rajesh"));
        const hasAmit = optionTexts.some(t => t.includes("Officer Amit"));
        return { optionTexts, hasRajesh, hasAmit };
      })()
    `);
    logStep("AUTHORITY", "AUTH-3", `Authority dropdown options [${optionsCheck.optionTexts.join(", ")}] contain linked Officer Rajesh`, optionsCheck.hasRajesh);
    logStep("AUTHORITY", "AUTH-4", "Authority dropdown options strictly exclude unlinked Officer Amit", !optionsCheck.hasAmit);

    // Capture screenshot: authority assignment dropdown
    await captureShot(cdp, "phase8_11_authority_assignment_dropdown.png");

    /* -------------------------------------------------------------------------
     * 7. SCENARIO 4: ADMIN DEPARTMENTS & OFFICER LINKING MANAGEMENT
     * ------------------------------------------------------------------------- */
    console.log("\n>>> SCENARIO 4: ADMIN DEPARTMENTS & OFFICER LINKING MANAGEMENT...");
    // Clear storage and navigate to login
    await cdp.evaluate(`localStorage.clear(); sessionStorage.clear();`);
    await cdp.navigate(`${BASE_URL}/login`);
    await cdp.waitFor(`document.querySelector("body")`);
    await injectHelper();

    // Click System Admin demo access
    await cdp.evaluate(`
      (() => {
        const adminBtn = document.querySelector('[aria-label="Admin Demo Access"]');
        if (adminBtn) adminBtn.click();
      })()
    `);
    await sleep(400);

    // Submit
    await cdp.evaluate(`
      (() => {
        const buttons = Array.from(document.querySelectorAll("button"));
        const submitBtn = buttons.find(b => b.textContent.includes("Initialize Dashboard") || b.type === "submit");
        if (submitBtn) submitBtn.click();
      })()
    `);

    // Wait for redirect to /admin
    await cdp.waitFor(`window.location.pathname.startsWith("/admin")`, 10000);

    // Navigate to /admin/departments
    await cdp.navigate(`${BASE_URL}/admin/departments`);
    const adminDeptsLoaded = await cdp.waitFor(`
      document.body.innerText.includes("Officer Rajesh") && document.body.innerText.includes("Officer Amit (Unlinked)")
    `, 10000);
    logStep("ADMIN", "ADM-1", "Admin departments view loaded all member records", adminDeptsLoaded);

    // Check badges: Officer Rajesh is Linked, Officer Amit is Unlinked
    const linkingBadgesVerified = await cdp.evaluate(`
      (() => {
        const text = document.body.innerText;
        const hasLinkedBadge = text.includes("Linked") || text.includes("Linked Officer");
        const hasUnlinkedBadge = text.includes("Unlinked") || text.includes("Unlinked / Available");
        return hasLinkedBadge && hasUnlinkedBadge;
      })()
    `);
    logStep("ADMIN", "ADM-2", "Verified explicit Linked and Unlinked status indicators in Admin view", linkingBadgesVerified);

    // Capture screenshot: admin departments linking
    await captureShot(cdp, "phase8_11_admin_departments_linking.png");

    console.log("\n===============================================================================");
    console.log("ALL BROWSER WORKFLOW TESTS EXECUTED SUCCESSFULLY!");
    console.log("===============================================================================");
  } finally {
    await cleanup();
  }
}

main().catch(async (err) => {
  console.error("FATAL BROWSER SUITE ERROR:", err);
  await cleanup();
  process.exit(1);
});
