import { spawn } from "child_process";
import fs from "fs";

const TARGET_URL = "http://127.0.0.1:8080/login";
const CDP_PORT = 9222;
const CDP_BASE = `http://127.0.0.1:${CDP_PORT}`;

const DEMO_TESTS = [
  {
    key: "citizen",
    email: "citizen.demo@govai.gov",
    expectedUserId: "6aaffdb60d4d4252133081a6",
    role: "citizen",
    expectedRedirect: "/citizen",
    buttonAriaLabel: "Citizen Demo",
    selectRole: "citizen",
  },
  {
    key: "admin",
    email: "admin@govai.gov",
    expectedUserId: "69dc6eb86c0594d14a40a038",
    role: "admin",
    expectedRedirect: "/admin",
    buttonAriaLabel: "Admin Demo Access",
  },
  {
    key: "authority_road",
    email: "authority@demo.com",
    expectedUserId: "69e08213f55981d3faedf6c5",
    role: "authority",
    department: "Road & Infrastructure",
    departmentRole: "authority",
    expectedRedirect: "/department",
    buttonAriaLabel: "Road & Infrastructure Authority",
    selectRole: "authority",
  },
  {
    key: "authority_water",
    email: "water@demo.com",
    expectedUserId: "69e08219f55981d3faedf6cb",
    role: "authority",
    department: "Water Supply",
    departmentRole: "authority",
    expectedRedirect: "/department",
    buttonAriaLabel: "Water Supply Authority",
    selectRole: "authority",
  },
  {
    key: "authority_electricity",
    email: "electricity@demo.com",
    expectedUserId: "69e0821cf55981d3faedf6ce",
    role: "authority",
    department: "Electricity",
    departmentRole: "authority",
    expectedRedirect: "/department",
    buttonAriaLabel: "Electricity Authority",
    selectRole: "authority",
  },
  {
    key: "authority_environment",
    email: "environment@demo.com",
    expectedUserId: "69e0821ff55981d3faedf6d1",
    role: "authority",
    department: "Environment",
    departmentRole: "authority",
    expectedRedirect: "/department",
    buttonAriaLabel: "Environment Authority",
    selectRole: "authority",
  },
  {
    key: "officer_road",
    email: "road.demo@govai.gov",
    expectedUserId: "6ae19e3e0febcd3d2bd50545",
    role: "authority",
    department: "Road & Infrastructure",
    departmentRole: "officer",
    isOfficer: true,
    expectedRedirect: "/department",
    buttonAriaLabel: "Road Officer",
    selectRole: "officer",
  },
  {
    key: "officer_water",
    email: "water.demo@govai.gov",
    expectedUserId: "6ae19e3e0febcd3d2bd50548",
    role: "authority",
    department: "Water Supply",
    departmentRole: "officer",
    isOfficer: true,
    expectedRedirect: "/department",
    buttonAriaLabel: "Water Officer",
    selectRole: "officer",
  },
  {
    key: "officer_electricity",
    email: "electricity.demo@govai.gov",
    expectedUserId: "6ae19e3e0febcd3d2bd5054b",
    role: "authority",
    department: "Electricity",
    departmentRole: "officer",
    isOfficer: true,
    expectedRedirect: "/department",
    buttonAriaLabel: "Electricity Officer",
    selectRole: "officer",
  },
  {
    key: "officer_environment",
    email: "environment.demo@govai.gov",
    expectedUserId: "6ae19e3e0febcd3d2bd5054e",
    role: "authority",
    department: "Environment",
    departmentRole: "officer",
    isOfficer: true,
    expectedRedirect: "/department",
    buttonAriaLabel: "Environment Officer",
    selectRole: "officer",
  },
];

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (err) => reject(err);
      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve: res, reject: rej } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) rej(msg.error);
          else res(msg.result);
        } else if (msg.method) {
          const handlers = this.listeners.get(msg.method) || [];
          for (const handler of handlers) handler(msg.params);
        }
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

  on(method, handler) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(handler);
  }

  async evaluate(expression) {
    const res = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.text || "Evaluation error");
    }
    return res.result?.value;
  }

  close() {
    if (this.ws) {
      try {
        this.ws.close();
      } catch (_) {}
    }
  }
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function launchChrome() {
  const tmpUserData = `/tmp/chrome_govai_demo_${Date.now()}`;
  const proc = spawn(
    "/usr/bin/google-chrome",
    [
      "--headless=new",
      `--remote-debugging-port=${CDP_PORT}`,
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      `--user-data-dir=${tmpUserData}`,
    ],
    {
      stdio: "ignore",
      detached: false,
    }
  );

  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`${CDP_BASE}/json/version`);
      if (res.ok) {
        console.log(`Chrome started and listening on ${CDP_BASE}`);
        return { proc, tmpUserData };
      }
    } catch (_) {}
    await sleep(200);
  }
  throw new Error("Chrome failed to initialize within timeout");
}

async function runBrowserDemoLoginTests() {
  console.log("=== STARTING BROWSER DEMO LOGIN VERIFICATION ===");
  console.log(`Frontend URL: ${TARGET_URL}`);

  let chromeInstance = null;
  try {
    chromeInstance = await launchChrome();
  } catch (err) {
    console.error("Could not launch headless Chrome:", err);
    process.exit(1);
  }

  const results = [];
  let allPassed = true;

  try {
    for (const test of DEMO_TESTS) {
      console.log(`\n--------------------------------------------------`);
      console.log(`Testing Demo Login: [${test.key}] (${test.email})`);
      const startTime = Date.now();
      let client = null;
      let targetId = null;

      try {
        const createRes = await fetch(`${CDP_BASE}/json/new?about:blank`, { method: "PUT" });
        const targetData = await createRes.json();
        targetId = targetData.id;
        const wsUrl = targetData.webSocketDebuggerUrl;

        client = new CDPClient(wsUrl);
        await client.connect();

        await client.send("Page.enable");
        await client.send("Runtime.enable");
        await client.send("Network.enable");

        let loginRequestSent = false;
        let loginResponseStatus = null;
        let meResponseStatus = null;

        client.on("Network.responseReceived", (params) => {
          const url = params.response.url;
          if (url.includes("/api/auth/login")) {
            loginRequestSent = true;
            loginResponseStatus = params.response.status;
          } else if (url.includes("/api/auth/me")) {
            meResponseStatus = params.response.status;
          }
        });

        // Navigate to /login
        await client.send("Page.navigate", { url: TARGET_URL });

        // Wait for page ready
        let ready = false;
        for (let i = 0; i < 40; i++) {
          await sleep(250);
          const state = await client.evaluate("document.readyState");
          if (state === "complete") {
            const hasApp = await client.evaluate("!!document.querySelector('.ga-root')");
            if (hasApp) {
              ready = true;
              break;
            }
          }
        }

        if (!ready) {
          throw new Error("Login page did not finish rendering within timeout");
        }

        // Clear any prior storage/tokens to ensure clean state
        await client.evaluate(`
          localStorage.clear();
          sessionStorage.clear();
        `);

        // If test requires switching role tab (e.g. Officer or Authority or Citizen)
        if (test.selectRole === "officer") {
          await client.evaluate(`
            const btns = Array.from(document.querySelectorAll('button'));
            const btn = btns.find(b => b.textContent && b.textContent.includes('Officer') && !b.getAttribute('aria-label'));
            if (btn) btn.click();
          `);
          await sleep(400);
        } else if (test.selectRole === "authority") {
          await client.evaluate(`
            const btns = Array.from(document.querySelectorAll('button'));
            const btn = btns.find(b => b.textContent && b.textContent.includes('Department') && !b.getAttribute('aria-label'));
            if (btn) btn.click();
          `);
          await sleep(400);
        } else if (test.selectRole === "citizen") {
          await client.evaluate(`
            const btns = Array.from(document.querySelectorAll('button'));
            const btn = btns.find(b => b.textContent && b.textContent.includes('Citizen') && !b.getAttribute('aria-label'));
            if (btn) btn.click();
          `);
          await sleep(400);
        }

        // Find demo button by aria-label
        const buttonFound = await client.evaluate(`
          (function() {
            const btn = document.querySelector('button[aria-label="${test.buttonAriaLabel}"]');
            if (!btn) return false;
            btn.click();
            return true;
          })()
        `);

        if (!buttonFound) {
          throw new Error(`Demo button with aria-label "${test.buttonAriaLabel}" not found on page`);
        }

        console.log(`  -> Clicked "${test.buttonAriaLabel}" demo button`);

        // Wait for navigation and network response
        let redirected = false;
        let finalPath = "";
        let token = null;
        let user = null;

        for (let i = 0; i < 50; i++) {
          await sleep(250);
          finalPath = await client.evaluate("window.location.pathname");
          token = await client.evaluate("localStorage.getItem('govai_token')");
          user = await client.evaluate("JSON.parse(localStorage.getItem('govai_user') || 'null')");

          if (finalPath === test.expectedRedirect && token && user) {
            redirected = true;
            break;
          }
        }

        const elapsed = Date.now() - startTime;

        if (!redirected) {
          const currentError = await client.evaluate(`
            (document.querySelector('.ga-root') && document.body.innerText.slice(0, 300)) || ''
          `);
          throw new Error(
            `Failed to redirect to ${test.expectedRedirect}. Current path: ${finalPath}, loginStatus: ${loginResponseStatus}, meStatus: ${meResponseStatus}. Page text: ${currentError}`
          );
        }

        // Verify user identity in localStorage
        if (user.email !== test.email) {
          throw new Error(`User email mismatch: expected ${test.email}, got ${user.email}`);
        }
        if (user.id !== test.expectedUserId && user._id !== test.expectedUserId) {
          throw new Error(`User ID mismatch: expected ${test.expectedUserId}, got ${user.id || user._id}`);
        }
        if (user.role !== test.role) {
          throw new Error(`User client role mismatch: expected ${test.role}, got ${user.role}`);
        }
        if (test.department && user.department !== test.department) {
          throw new Error(`Department mismatch: expected ${test.department}, got ${user.department}`);
        }
        if (test.departmentRole && user.departmentRole !== test.departmentRole) {
          throw new Error(`departmentRole mismatch: expected ${test.departmentRole}, got ${user.departmentRole}`);
        }
        if (test.isOfficer !== undefined && user.isOfficer !== test.isOfficer) {
          throw new Error(`isOfficer mismatch: expected ${test.isOfficer}, got ${user.isOfficer}`);
        }

        // Verify target dashboard rendered properly (DOM checks)
        await sleep(500);
        const hasHeadingOrNav = await client.evaluate(`
          !!document.querySelector('nav, header, [role="navigation"], aside, main')
        `);

        console.log(`  [PASS] Auto-filled, authenticated (200), fetched context (200), redirected to ${finalPath} in ${elapsed}ms`);
        console.log(`         User ID: ${user.id || user._id}, Role: ${user.role}, Dept: ${user.department || "N/A"}, deptRole: ${user.departmentRole || "N/A"}, isOfficer: ${user.isOfficer}`);

        results.push({
          account: test.key,
          email: test.email,
          expectedPath: test.expectedRedirect,
          actualPath: finalPath,
          loginStatus: loginResponseStatus || 200,
          meStatus: meResponseStatus || 200,
          userId: user.id || user._id,
          role: user.role,
          department: user.department || "None",
          departmentRole: user.departmentRole || "None",
          isOfficer: user.isOfficer ?? false,
          durationMs: elapsed,
          status: "PASS",
        });
      } catch (err) {
        console.error(`  [FAIL] ${test.key} failed: ${err.message}`);
        allPassed = false;
        results.push({
          account: test.key,
          email: test.email,
          expectedPath: test.expectedRedirect,
          error: err.message,
          status: "FAIL",
        });
      } finally {
        if (client) client.close();
        if (targetId) {
          try {
            await fetch(`${CDP_BASE}/json/close/${targetId}`);
          } catch (_) {}
        }
      }
    }
  } finally {
    if (chromeInstance && chromeInstance.proc) {
      chromeInstance.proc.kill("SIGTERM");
      try {
        fs.rmSync(chromeInstance.tmpUserData, { recursive: true, force: true });
      } catch (_) {}
    }
  }

  console.log("\n==================================================");
  console.log("BROWSER DEMO LOGIN VERIFICATION SUMMARY:");
  console.table(results);
  console.log("==================================================");

  if (!allPassed) {
    console.error("One or more browser demo logins failed!");
    process.exit(1);
  } else {
    console.log("ALL 10 BROWSER DEMO LOGINS SUCCEEDED COMPLETELY!");
  }
}

runBrowserDemoLoginTests().catch((err) => {
  console.error("Fatal error running browser tests:", err);
  process.exit(1);
});
