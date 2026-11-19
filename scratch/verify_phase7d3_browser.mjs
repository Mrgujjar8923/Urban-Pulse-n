import path from "path";
import fs from "fs";
import { spawn } from "child_process";
import WebSocket from "../backend/node_modules/ws/index.js";
import dotenv from "../backend/node_modules/dotenv/lib/main.js";
import mongoose from "../backend/node_modules/mongoose/index.js";

const FRONTEND_PORT = 8080;
const CDP_PORT = 9299;
const BASE_URL = `http://127.0.0.1:${FRONTEND_PORT}`;
const CDP_BASE = `http://127.0.0.1:${CDP_PORT}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SCREENSHOT_DIR = "/home/priyanshu/.gemini/antigravity/brain/8af59d69-02f5-4527-9224-95a1a2da524f/screenshots";
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const results = [];
const consoleErrors = [];
let chromeProc = null;
let tmpChromeDataDir = null;

const logStep = (category, stepNum, description, passed, details = "") => {
  results.push({ category, stepNum, description, passed, details });
  console.log(`[${passed ? "PASS" : "FAIL"}] [${category}] Step ${stepNum}: ${description} ${details ? "- " + details : ""}`);
};

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
      this.ws.onmessage = async (event) => {
        try {
          const raw = typeof event.data === "string" ? event.data : event.data.toString();
          const msg = JSON.parse(raw);
          if (msg.id && this.pending.has(msg.id)) {
            const { resolve: res, reject: rej } = this.pending.get(msg.id);
            this.pending.delete(msg.id);
            if (msg.error) rej(msg.error);
            else res(msg.result);
          } else if (msg.method === "Runtime.consoleAPICalled") {
            if (msg.params.type === "error") {
              const text = msg.params.args?.map((a) => a.value || a.description || "").join(" ");
              if (!text.includes("You are trying to animate boxShadow")) {
                consoleErrors.push(text);
              }
            }
          }
        } catch {}
      };
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
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
    if (res.exceptionDetails) {
      throw new Error(`Eval error: ${JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result?.value;
  }

  async setViewport(width, height) {
    await this.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
  }

  async navigate(url, waitMs = 1500) {
    await this.send("Page.navigate", { url });
    await sleep(waitMs);
  }

  async waitForSelector(selector, timeoutMs = 15000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const exists = await this.evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
      if (exists) return true;
      await sleep(250);
    }
    return false;
  }

  async captureScreenshot(filepath) {
    const { data } = await this.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(filepath, Buffer.from(data, "base64"));
    console.log(`  -> Screenshot captured: ${filepath}`);
  }

  async pressKey(key, code = key, keyCode = 0) {
    await this.send("Input.dispatchKeyEvent", {
      type: "keyDown",
      key,
      code,
      windowsVirtualKeyCode: keyCode,
      nativeVirtualKeyCode: keyCode,
    });
    await sleep(50);
    await this.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key,
      code,
      windowsVirtualKeyCode: keyCode,
      nativeVirtualKeyCode: keyCode,
    });
    await sleep(150);
  }

  async setSessionAuth(token, user) {
    const normalized = {
      ...user,
      id: user.id || user._id,
      _id: user._id || user.id,
      role: "admin",
    };
    await this.evaluate(`
      localStorage.setItem("govai_token", ${JSON.stringify(token)});
      localStorage.setItem("govai_user", ${JSON.stringify(JSON.stringify(normalized))});
    `);
    await sleep(200);
  }

  async close() {
    if (this.ws) {
      try { this.ws.close(); } catch {}
    }
  }
}

async function runVerification() {
  console.log("===============================================================================");
  console.log("PHASE 7D.3: REAL-BROWSER CHROME CDP ACCESSIBILITY VERIFICATION");
  console.log("===============================================================================");

  // Step 0: Check MongoDB invariant baseline
  console.log("\n>>> TASK 0: VERIFYING MONGODB ATLAS INVARIANT (READ-ONLY)...");
  dotenv.config({ path: "./backend/.env" });
  await mongoose.connect(process.env.MONGO_URI, { dbName: "govai" });
  const baselineCounts = {
    complaints: await mongoose.connection.collection("complaints").countDocuments(),
    users: await mongoose.connection.collection("users").countDocuments(),
    members: await mongoose.connection.collection("members").countDocuments(),
    feedbacks: await mongoose.connection.collection("feedbacks").countDocuments(),
    notifications: await mongoose.connection.collection("notifications").countDocuments(),
  };
  console.log("Baseline MongoDB counts:", baselineCounts);
  logStep("SAFETY", "0.1", `MongoDB baseline recorded (${baselineCounts.complaints} complaints, ${baselineCounts.users} users, ${baselineCounts.members} members, ${baselineCounts.feedbacks} feedbacks, ${baselineCounts.notifications} notifications)`,
    baselineCounts.complaints === 19 && baselineCounts.users === 22 && baselineCounts.members === 4 && baselineCounts.feedbacks === 0 && baselineCounts.notifications === 17,
    JSON.stringify(baselineCounts)
  );

  // Preflight Auth
  console.log("\n>>> TASK 1: AUTHENTICATION PREFLIGHT...");
  const adminAuthRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@govai.gov", password: "12345678", role: "admin" }),
  });
  const adminAuth = await adminAuthRes.json();
  logStep("AUTH", "1.1", "Admin JWT obtained", Boolean(adminAuth?.token));

  // Launch Chrome
  console.log("\n>>> TASK 2: LAUNCHING HEADLESS CHROME WITH CDP...");
  tmpChromeDataDir = `/tmp/chrome_govai_p7d3_${Date.now()}`;
  chromeProc = spawn("/usr/bin/google-chrome", [
    "--headless=new",
    `--remote-debugging-port=${CDP_PORT}`,
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    `--user-data-dir=${tmpChromeDataDir}`,
  ]);

  let cdpConnected = false;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`${CDP_BASE}/json/version`);
      if (res.ok) {
        cdpConnected = true;
        break;
      }
    } catch {}
    await sleep(250);
  }

  if (!cdpConnected) {
    throw new Error(`Failed to connect to CDP on port ${CDP_PORT}`);
  }
  logStep("CDP", "2.1", `Connected to Chrome CDP on port ${CDP_PORT}`, true);

  const targetsRes = await fetch(`${CDP_BASE}/json/list`);
  const targets = await targetsRes.json();
  const pageTarget = targets.find((t) => t.type === "page") || targets[0];
  const cdp = new CDPController(pageTarget.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.setViewport(1280, 800);

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. AUTHENTICATION TABS & ROLE RADIOGROUP
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n>>> TASK 3: AUTHENTICATION TABS & ROLE RADIOGROUP ACCESSIBILITY (/login)...");
  await cdp.navigate(`${BASE_URL}/login`);

  const authTabCheck = await cdp.evaluate(`
    (() => {
      const tablist = document.querySelector('[role="tablist"][aria-label="Authentication mode"]');
      const loginTab = document.getElementById("auth-tab-login");
      const signupTab = document.getElementById("auth-tab-signup");
      const loginPanel = document.getElementById("auth-panel-login");

      const roleGroup = document.querySelector('[role="radiogroup"][aria-label="Select login role"]');
      const citizenRadio = document.getElementById("login-role-citizen");
      const deptRadio = document.getElementById("login-role-authority");
      const officerRadio = document.getElementById("login-role-officer");

      return {
        hasTablist: Boolean(tablist),
        loginTabSelected: loginTab?.getAttribute("aria-selected"),
        loginTabControls: loginTab?.getAttribute("aria-controls"),
        signupTabSelected: signupTab?.getAttribute("aria-selected"),
        signupTabControls: signupTab?.getAttribute("aria-controls"),
        loginPanelRole: loginPanel?.getAttribute("role"),
        loginPanelLabelledBy: loginPanel?.getAttribute("aria-labelledby"),

        hasRoleGroup: Boolean(roleGroup),
        citizenChecked: citizenRadio?.getAttribute("aria-checked"),
        citizenRole: citizenRadio?.getAttribute("role"),
        deptChecked: deptRadio?.getAttribute("aria-checked"),
        officerChecked: officerRadio?.getAttribute("aria-checked"),
      };
    })()
  `);

  const authSemanticsPassed =
    authTabCheck.hasTablist &&
    authTabCheck.loginTabSelected === "true" &&
    authTabCheck.loginTabControls === "auth-panel-login" &&
    authTabCheck.signupTabSelected === "false" &&
    authTabCheck.loginPanelRole === "tabpanel" &&
    authTabCheck.loginPanelLabelledBy === "auth-tab-login" &&
    authTabCheck.hasRoleGroup &&
    authTabCheck.citizenRole === "radio" &&
    authTabCheck.citizenChecked === "true" &&
    authTabCheck.deptChecked === "false" &&
    authTabCheck.officerChecked === "false";

  logStep("AUTH_ACCESSIBILITY", "3.1", "Tablist, tabs, panel, and role radiogroup semantics present", authSemanticsPassed, JSON.stringify(authTabCheck));

  // Test Arrow navigation on role radiogroup
  await cdp.evaluate(`document.getElementById("login-role-citizen")?.focus()`);
  await cdp.pressKey("ArrowRight", "ArrowRight", 39);
  await sleep(300);

  const deptRadioAfterArrow = await cdp.evaluate(`
    (() => {
      const deptRadio = document.getElementById("login-role-authority");
      const citizenRadio = document.getElementById("login-role-citizen");
      return {
        deptChecked: deptRadio?.getAttribute("aria-checked"),
        citizenChecked: citizenRadio?.getAttribute("aria-checked"),
        activeElementId: document.activeElement?.id
      };
    })()
  `);

  const deptRadioArrowPassed = deptRadioAfterArrow.deptChecked === "true" && deptRadioAfterArrow.citizenChecked === "false";
  logStep("AUTH_ACCESSIBILITY", "3.2", "Arrow navigation on role radiogroup cycles selection", deptRadioArrowPassed, JSON.stringify(deptRadioAfterArrow));

  // Test Arrow navigation on mode tabs
  await cdp.evaluate(`document.getElementById("auth-tab-login")?.focus()`);
  await cdp.pressKey("ArrowRight", "ArrowRight", 39);
  await sleep(400);

  const tabArrowCheck = await cdp.evaluate(`
    (() => {
      const signupTab = document.getElementById("auth-tab-signup");
      const signupPanel = document.getElementById("auth-panel-signup");
      const signupRoleGroup = document.querySelector('[role="radiogroup"][aria-label="Select registration role"]');
      return {
        signupTabSelected: signupTab?.getAttribute("aria-selected"),
        signupPanelExists: Boolean(signupPanel),
        signupRoleGroupExists: Boolean(signupRoleGroup)
      };
    })()
  `);

  const tabArrowPassed = tabArrowCheck.signupTabSelected === "true" && tabArrowCheck.signupPanelExists && tabArrowCheck.signupRoleGroupExists;
  logStep("AUTH_ACCESSIBILITY", "3.3", "Arrow navigation switches to Signup tab and displays signup panel with role radiogroup", tabArrowPassed, JSON.stringify(tabArrowCheck));

  await cdp.captureScreenshot(path.join(SCREENSHOT_DIR, "phase7d3_auth_keyboard_navigation.png"));

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. ADMIN COMPLAINT TABLE SORTING ACCESSIBILITY
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n>>> TASK 4: ADMIN COMPLAINTS TABLE SORTING ACCESSIBILITY (/admin/complaints)...");

  // Inject authenticated admin session
  await cdp.setSessionAuth(adminAuth.token, adminAuth.user);
  await cdp.navigate(`${BASE_URL}/admin/complaints`, 1000);
  await cdp.waitForSelector("table thead th button", 15000);
  await sleep(500);

  const tableHeaderCheck = await cdp.evaluate(`
    (() => {
      const ths = Array.from(document.querySelectorAll("table thead th"));
      return ths.map(th => {
        const btn = th.querySelector("button");
        return {
          text: th.textContent.trim().split("\\n")[0].trim(),
          scope: th.getAttribute("scope"),
          ariaSort: th.getAttribute("aria-sort"),
          hasButton: Boolean(btn),
          btnType: btn?.getAttribute("type"),
          iconAriaHidden: th.querySelector("svg")?.getAttribute("aria-hidden")
        };
      });
    })()
  `);

  const headersWithSort = tableHeaderCheck.filter(h => h.ariaSort !== null && h.ariaSort !== undefined);
  const sortHeadersPassed =
    headersWithSort.length === 4 &&
    headersWithSort.every(h => h.scope === "col" && h.hasButton && h.btnType === "button");

  logStep("TABLE_SORTING", "4.1", "Sortable headers have scope=col, semantic button, and aria-sort", sortHeadersPassed, JSON.stringify(headersWithSort));

  // Click Reference header to sort and verify aria-sort updates
  await cdp.evaluate(`
    (() => {
      const refBtn = Array.from(document.querySelectorAll("table thead th button")).find(b => b.textContent.includes("Reference"));
      refBtn?.click();
    })()
  `);
  await sleep(400);

  const refSortedCheck = await cdp.evaluate(`
    (() => {
      const refTh = Array.from(document.querySelectorAll("table thead th")).find(th => th.textContent.includes("Reference"));
      return {
        ariaSort: refTh?.getAttribute("aria-sort"),
        iconHidden: refTh?.querySelector("svg")?.getAttribute("aria-hidden")
      };
    })()
  `);

  const refSortPassed = refSortedCheck.ariaSort === "descending" && refSortedCheck.iconHidden === "true";
  logStep("TABLE_SORTING", "4.2", "Clicking Reference header updates aria-sort to descending and icon is aria-hidden", refSortPassed, JSON.stringify(refSortedCheck));

  // Click again to toggle to ascending
  await cdp.evaluate(`
    (() => {
      const refBtn = Array.from(document.querySelectorAll("table thead th button")).find(b => b.textContent.includes("Reference"));
      refBtn?.click();
    })()
  `);
  await sleep(400);

  const refAscCheck = await cdp.evaluate(`
    (() => {
      const refTh = Array.from(document.querySelectorAll("table thead th")).find(th => th.textContent.includes("Reference"));
      return refTh?.getAttribute("aria-sort");
    })()
  `);

  logStep("TABLE_SORTING", "4.3", "Clicking Reference again updates aria-sort to ascending", refAscCheck === "ascending", `aria-sort: ${refAscCheck}`);

  await cdp.captureScreenshot(path.join(SCREENSHOT_DIR, "phase7d3_admin_table_aria_sort.png"));

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. CHATBOT ACCESSIBILITY (LIVE REGION, DIALOG ROLE, ESCAPE CLOSE)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n>>> TASK 5: CHATBOT ACCESSIBILITY (LIVE REGION, ESCAPE KEY)...");

  // Open chatbot
  const openChatResult = await cdp.evaluate(`
    (() => {
      const launcher = document.querySelector('button[aria-label="Open AI Assistant"]');
      if (!launcher) return { error: "Launcher not found" };
      launcher.click();
      return { clicked: true };
    })()
  `);
  await sleep(800);

  const chatA11yCheck = await cdp.evaluate(`
    (() => {
      const dialog = document.querySelector('[role="dialog"][aria-label="GovAI Assistant Chat"]');
      const liveRegion = dialog?.querySelector('[role="log"][aria-live="polite"]');
      const promptGroup = dialog?.querySelector('[role="group"][aria-label="Suggested questions"]');
      const closeBtn = dialog?.querySelector('button[aria-label="Close AI Assistant"]');

      return {
        hasDialog: Boolean(dialog),
        dialogModal: dialog?.getAttribute("aria-modal"),
        hasLiveRegion: Boolean(liveRegion),
        liveAtomic: liveRegion?.getAttribute("aria-atomic"),
        hasPromptGroup: Boolean(promptGroup),
        closeBtnType: closeBtn?.getAttribute("type")
      };
    })()
  `);

  const chatA11yPassed = chatA11yCheck.hasDialog && chatA11yCheck.hasLiveRegion && chatA11yCheck.hasPromptGroup && chatA11yCheck.closeBtnType === "button";
  logStep("CHATBOT", "5.1", "Chatbot dialog role, live region (role=log, aria-live=polite), and prompt group present", chatA11yPassed, JSON.stringify(chatA11yCheck));

  await cdp.captureScreenshot(path.join(SCREENSHOT_DIR, "phase7d3_chatbot_accessibility.png"));

  // Test Escape key dismissal
  await cdp.pressKey("Escape", "Escape", 27);
  await sleep(500);

  const chatClosedCheck = await cdp.evaluate(`
    (() => {
      const dialog = document.querySelector('[role="dialog"][aria-label="GovAI Assistant Chat"]');
      return { dialogClosed: !dialog };
    })()
  `);

  logStep("CHATBOT", "5.2", "Pressing Escape closes the chatbot panel", chatClosedCheck.dialogClosed, JSON.stringify(chatClosedCheck));

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. SHARED COMPONENTS ACCESSIBILITY (NAVBAR, NOTIFICATIONS, THEME TOGGLE)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n>>> TASK 6: SHARED COMPONENTS (NAVBAR, NOTIFICATIONS, THEMETOGGLE)...");

  const sharedA11yCheck = await cdp.evaluate(`
    (() => {
      // Navbar active link
      const activeLink = document.querySelector("a.dashboard-nav-link.is-active, a[aria-current='page']");
      const activeCurrent = activeLink?.getAttribute("aria-current");

      // Theme toggle button
      const themeToggle = document.querySelector('button[aria-label="Toggle theme"]');
      const themeToggleType = themeToggle?.getAttribute("type");

      // Notification button
      const notifBtn = document.querySelector('button[aria-label*="Notifications"]');

      return {
        activeCurrent,
        themeToggleType,
        hasNotifBtn: Boolean(notifBtn)
      };
    })()
  `);

  const sharedPassed = sharedA11yCheck.activeCurrent === "page" && sharedA11yCheck.themeToggleType === "button" && sharedA11yCheck.hasNotifBtn;
  logStep("SHARED_COMPONENTS", "6.1", "Navbar link has aria-current=page and ThemeToggle has type=button", sharedPassed, JSON.stringify(sharedA11yCheck));

  // Open notification popover to verify action buttons and unread sr-only text
  await cdp.evaluate(`
    (() => {
      const notifBtn = document.querySelector('button[aria-label*="Notifications"]');
      notifBtn?.click();
    })()
  `);
  await sleep(600);

  const notifDropdownCheck = await cdp.evaluate(`
    (() => {
      const markAll = document.querySelector('button[aria-label="Mark all notifications as read"]');
      const clearAll = document.querySelector('button[aria-label="Clear all notifications"]');
      const viewAll = Array.from(document.querySelectorAll("button")).find(b => b.textContent.includes("View all notifications"));

      return {
        markAllType: markAll?.getAttribute("type"),
        clearAllType: clearAll?.getAttribute("type"),
        viewAllType: viewAll?.getAttribute("type")
      };
    })()
  `);

  const notifDropdownPassed =
    notifDropdownCheck.markAllType === "button" &&
    notifDropdownCheck.clearAllType === "button" &&
    notifDropdownCheck.viewAllType === "button";

  logStep("SHARED_COMPONENTS", "6.2", "Notification Dropdown actions have type=button and accessible names", notifDropdownPassed, JSON.stringify(notifDropdownCheck));

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. CLEANUP & DATABASE INVARIANT CONFIRMATION
  // ─────────────────────────────────────────────────────────────────────────────
  await cdp.close();
  if (chromeProc) {
    chromeProc.kill("SIGTERM");
    await sleep(500);
  }
  try {
    if (tmpChromeDataDir && fs.existsSync(tmpChromeDataDir)) {
      fs.rmSync(tmpChromeDataDir, { recursive: true, force: true });
    }
  } catch {}

  console.log("\n>>> TASK 7: FINAL MONGODB ATLAS INVARIANT CONFIRMATION...");
  const finalCounts = {
    complaints: await mongoose.connection.collection("complaints").countDocuments(),
    users: await mongoose.connection.collection("users").countDocuments(),
    members: await mongoose.connection.collection("members").countDocuments(),
    feedbacks: await mongoose.connection.collection("feedbacks").countDocuments(),
    notifications: await mongoose.connection.collection("notifications").countDocuments(),
  };
  await mongoose.disconnect();
  console.log("Final MongoDB counts:", finalCounts);

  const zeroDbWrites =
    finalCounts.complaints === baselineCounts.complaints &&
    finalCounts.users === baselineCounts.users &&
    finalCounts.members === baselineCounts.members &&
    finalCounts.feedbacks === baselineCounts.feedbacks &&
    finalCounts.notifications === baselineCounts.notifications;

  logStep("SAFETY", "7.1", "Zero database writes confirmed — exact baseline maintained", zeroDbWrites, JSON.stringify(finalCounts));

  // Summary
  console.log("\n===============================================================================");
  console.log("PHASE 7D.3 REAL-BROWSER ACCESSIBILITY VERIFICATION SUMMARY");
  console.log("===============================================================================");
  const passedCount = results.filter((r) => r.passed).length;
  console.log(`Total checks: ${results.length} | Passed: ${passedCount} | Failed: ${results.length - passedCount}`);

  if (passedCount === results.length) {
    console.log("ALL REAL-BROWSER ACCESSIBILITY CHECKS PASSED WITH 100% SUCCESS!");
  } else {
    console.error("SOME REAL-BROWSER CHECKS FAILED!");
    process.exit(1);
  }
}

runVerification().catch((err) => {
  console.error("FATAL REAL-BROWSER VERIFICATION ERROR:", err);
  if (chromeProc) chromeProc.kill("SIGTERM");
  try {
    if (tmpChromeDataDir && fs.existsSync(tmpChromeDataDir)) {
      fs.rmSync(tmpChromeDataDir, { recursive: true, force: true });
    }
  } catch {}
  process.exit(1);
});
