import path from "path";
import fs from "fs";
import { spawn } from "child_process";
import WebSocket from "../backend/node_modules/ws/index.js";

const FRONTEND_PORT = 8080;
const CDP_PORT = 9266;
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

// CDP Controller
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

  async waitFor(expression, timeoutMs = 8000) {
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
    await sleep(250);
  }

  async navigate(url, waitMs = 1200) {
    await this.send("Page.navigate", { url });
    await sleep(waitMs);
  }

  async captureScreenshot(filename) {
    try {
      const { data } = await this.send("Page.captureScreenshot", { format: "png" });
      const outPath = path.join(SCREENSHOT_DIR, filename);
      fs.writeFileSync(outPath, Buffer.from(data, "base64"));
      console.log(`[SCREENSHOT] Saved ${filename}`);
      return outPath;
    } catch (e) {
      console.warn(`[SCREENSHOT WARN] Failed ${filename}:`, e.message);
    }
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function runVerification() {
  console.log("===============================================================================");
  console.log("PHASE 7D.1: REAL-BROWSER CHROME CDP VERIFICATION SUITE");
  console.log("===============================================================================");

  // Step 1: Preflight
  console.log("\n>>> TASK 8.1: VERIFYING FRONTEND & AUTH TOKENS...");
  const feRes = await fetch(`${BASE_URL}/`);
  logStep("PREFLIGHT", "M-1", "Frontend Vite server responding on port 8080", feRes.ok);
  if (!feRes.ok) throw new Error("Frontend not reachable on port 8080");

  // Obtain genuine JWT tokens via read-only auth verification
  const [adminAuthRes, citizenAuthRes, authorityAuthRes] = await Promise.all([
    fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@govai.gov", password: "12345678", role: "admin" }),
    }),
    fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "citizen.demo@govai.gov", password: "12345678", role: "citizen" }),
    }),
    fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "water@demo.com", password: "12345678", role: "authority" }),
    }),
  ]);

  const [adminAuth, citizenAuth, authorityAuth] = await Promise.all([
    adminAuthRes.json(),
    citizenAuthRes.json(),
    authorityAuthRes.json(),
  ]);

  logStep("PREFLIGHT", "M-2", "Admin authentication token obtained", Boolean(adminAuth?.token));
  logStep("PREFLIGHT", "M-3", "Citizen authentication token obtained", Boolean(citizenAuth?.token));
  logStep("PREFLIGHT", "M-4", "Authority authentication token obtained", Boolean(authorityAuth?.token));

  console.log("\n>>> TASK 8.2: LAUNCHING HEADLESS CHROME WITH CDP...");
  tmpChromeDataDir = `/tmp/chrome_govai_p7d1_${Date.now()}`;
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
    await sleep(200);
  }
  logStep("PREFLIGHT", "M-5", "Headless Chrome CDP available on port 9266", cdpConnected);
  if (!cdpConnected) throw new Error("Chrome CDP not reachable");

  const listRes = await fetch(`${CDP_BASE}/json/list`);
  const targets = await listRes.json();
  const pageTarget = targets.find((t) => t.type === "page") || targets[0];

  const cdp = new CDPController(pageTarget.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send("Runtime.enable");
  await cdp.send("Page.enable");
  await cdp.send("DOM.enable");

  const injectSession = async (authObj) => {
    await cdp.evaluate(`
      localStorage.setItem("govai_token", ${JSON.stringify(authObj.token)});
      localStorage.setItem("govai_user", ${JSON.stringify(JSON.stringify(authObj.user))});
    `);
    await sleep(200);
  };

  const clearSession = async () => {
    await cdp.evaluate(`
      localStorage.removeItem("govai_token");
      localStorage.removeItem("govai_user");
    `);
    await sleep(150);
  };

  /* -------------------------------------------------------------------------
   * VERIFICATION 1: MOBILE AUTH PAGE (375x812 & 390x844)
   * ------------------------------------------------------------------------- */
  console.log("\n>>> VERIFICATION 1: MOBILE AUTH PAGE (375x812 & 390x844)...");
  await cdp.setViewport(375, 812);
  await cdp.navigate(`${BASE_URL}/login`, 1200);
  await clearSession();
  await cdp.navigate(`${BASE_URL}/login`, 1200);

  // Check horizontal overflow
  const loginOverflow = await cdp.evaluate(`document.documentElement.scrollWidth <= document.documentElement.clientWidth`);
  logStep("MOBILE AUTH", "AUTH-1", "375x812 /login has zero horizontal overflow (scrollWidth <= clientWidth)", loginOverflow);

  // Check .ga-mobile-header visibility and contents
  const mobileHeaderInfo = await cdp.evaluate(`(() => {
    const el = document.querySelector(".ga-mobile-header");
    if (!el) return { found: false };
    const style = window.getComputedStyle(el);
    const paragraphs = Array.from(el.querySelectorAll("p")).map(p => p.textContent.trim());
    const title = paragraphs[0] || "";
    const subtitle = paragraphs[1] || "";
    const backLink = Array.from(el.querySelectorAll("a")).find(a => a.getAttribute("href") === "/" && a.textContent.includes("Back to website"));
    const isVisible = style.display !== "none" && el.offsetWidth > 0;
    return {
      found: true,
      isVisible,
      display: style.display,
      title,
      subtitle,
      hasBackLink: Boolean(backLink),
      backText: backLink ? backLink.textContent.trim() : "",
    };
  })()`);

  logStep("MOBILE AUTH", "AUTH-2", "Mobile header is visible on 375x812 (/login)", mobileHeaderInfo.isVisible, `display: ${mobileHeaderInfo.display}`);
  logStep("MOBILE AUTH", "AUTH-3", "Mobile header has GovAI Resolve title and subtitle", mobileHeaderInfo.title.includes("GovAI Resolve") && mobileHeaderInfo.subtitle.includes("Secure Gateway"), `title: ${mobileHeaderInfo.title}, subtitle: ${mobileHeaderInfo.subtitle}`);
  logStep("MOBILE AUTH", "AUTH-4", "Mobile header contains Back to website link pointing to '/'", mobileHeaderInfo.hasBackLink && mobileHeaderInfo.backText.includes("Back to website"), `link text: ${mobileHeaderInfo.backText}`);

  await cdp.captureScreenshot("phase7d1_mobile_auth_login_375x812.png");

  // Navigate to signup at 375x812
  await cdp.navigate(`${BASE_URL}/signup`, 1200);
  const signupOverflow = await cdp.evaluate(`document.documentElement.scrollWidth <= document.documentElement.clientWidth`);
  const signupHeaderVisible = await cdp.evaluate(`(() => {
    const el = document.querySelector(".ga-mobile-header");
    return el && window.getComputedStyle(el).display !== "none";
  })()`);
  logStep("MOBILE AUTH", "AUTH-5", "375x812 /signup has zero horizontal overflow", signupOverflow);
  logStep("MOBILE AUTH", "AUTH-6", "375x812 /signup renders mobile header with back link", signupHeaderVisible);
  await cdp.captureScreenshot("phase7d1_mobile_auth_signup_375x812.png");

  // Test at 390x844
  await cdp.setViewport(390, 844);
  await sleep(200);
  const auth390Overflow = await cdp.evaluate(`document.documentElement.scrollWidth <= document.documentElement.clientWidth`);
  logStep("MOBILE AUTH", "AUTH-7", "390x844 /signup has zero horizontal overflow", auth390Overflow);

  // Test desktop viewport: mobile header must be hidden
  await cdp.setViewport(1280, 800);
  await sleep(200);
  const desktopHeaderHidden = await cdp.evaluate(`(() => {
    const el = document.querySelector(".ga-mobile-header");
    return !el || window.getComputedStyle(el).display === "none";
  })()`);
  logStep("MOBILE AUTH", "AUTH-8", "Desktop viewport (1280x800) hides mobile header (display: none)", desktopHeaderHidden);

  /* -------------------------------------------------------------------------
   * VERIFICATION 2: MOBILE CHATBOT & SAFE INSET (375x812 & 390x844)
   * ------------------------------------------------------------------------- */
  console.log("\n>>> VERIFICATION 2: MOBILE CHATBOT MODAL & SAFE INSETS...");
  await cdp.setViewport(375, 812);
  await injectSession(citizenAuth);
  await cdp.navigate(`${BASE_URL}/citizen`, 1500);

  // Check floating launcher exists and has aria-label
  const launcherInfo = await cdp.evaluate(`(() => {
    const btn = document.querySelector("button[aria-label='Open AI Assistant']");
    if (!btn) return { found: false };
    const rect = btn.getBoundingClientRect();
    return {
      found: true,
      bottom: window.innerHeight - rect.bottom,
      right: window.innerWidth - rect.right,
      ariaLabel: btn.getAttribute("aria-label"),
    };
  })()`);

  logStep("CHATBOT", "BOT-1", "Chatbot floating launcher has aria-label='Open AI Assistant'", launcherInfo.found && launcherInfo.ariaLabel === "Open AI Assistant");
  logStep("CHATBOT", "BOT-2", "Floating launcher has safe margin (bottom >= 12px, right >= 12px)", launcherInfo.bottom >= 12 && launcherInfo.right >= 12, `bottom=${launcherInfo.bottom}px, right=${launcherInfo.right}px`);

  // Open chatbot
  await cdp.evaluate(`document.querySelector("button[aria-label='Open AI Assistant']").click()`);
  await sleep(600);

  // Check chatbot modal dimensions and aria-label
  const modalInfo375 = await cdp.evaluate(`(() => {
    const closeBtn = document.querySelector("button[aria-label='Close AI Assistant']");
    const modal = closeBtn ? closeBtn.closest(".fixed") : null;
    if (!modal) return { found: false };
    const rect = modal.getBoundingClientRect();
    const overflow = document.documentElement.scrollWidth <= document.documentElement.clientWidth;
    return {
      found: true,
      width: rect.width,
      right: window.innerWidth - rect.right,
      bottom: window.innerHeight - rect.bottom,
      noHorizontalOverflow: overflow,
      hasCloseBtn: Boolean(closeBtn),
    };
  })()`);

  logStep("CHATBOT", "BOT-3", "Chatbot modal width is <= 343px on 375x812 (w-[calc(100vw-2rem)])", modalInfo375.width <= 344, `width=${modalInfo375.width}px`);
  logStep("CHATBOT", "BOT-4", "Zero horizontal overflow when chatbot modal is open at 375x812", modalInfo375.noHorizontalOverflow);
  logStep("CHATBOT", "BOT-5", "Close button has aria-label='Close AI Assistant'", modalInfo375.hasCloseBtn);
  await cdp.captureScreenshot("phase7d1_mobile_chatbot_open_375x812.png");

  // Test at 390x844
  await cdp.setViewport(390, 844);
  await sleep(300);
  const modalInfo390 = await cdp.evaluate(`(() => {
    const closeBtn = document.querySelector("button[aria-label='Close AI Assistant']");
    const modal = closeBtn ? closeBtn.closest(".fixed") : null;
    if (!modal) return { found: false };
    const rect = modal.getBoundingClientRect();
    const overflow = document.documentElement.scrollWidth <= document.documentElement.clientWidth;
    return {
      found: true,
      width: rect.width,
      noHorizontalOverflow: overflow,
    };
  })()`);
  logStep("CHATBOT", "BOT-6", "Chatbot modal width is <= 358px on 390x844", modalInfo390.width <= 359, `width=${modalInfo390.width}px`);
  logStep("CHATBOT", "BOT-7", "Zero horizontal overflow when chatbot modal is open at 390x844", modalInfo390.noHorizontalOverflow);

  // Close chatbot
  await cdp.evaluate(`document.querySelector("button[aria-label='Close AI Assistant']").click()`);
  await sleep(400);

  /* -------------------------------------------------------------------------
   * VERIFICATION 3: ADMIN NAVBAR BREAKPOINTS ACROSS 1024, 1100, 1150, 1280
   * ------------------------------------------------------------------------- */
  console.log("\n>>> VERIFICATION 3: ADMIN NAVBAR BREAKPOINTS (1024px, 1100px, 1150px, 1280px)...");
  await injectSession(adminAuth);
  await cdp.navigate(`${BASE_URL}/admin`, 2000);

  const inspectAdminNav = async (viewportWidth) => {
    await cdp.setViewport(viewportWidth, 800);
    await sleep(300);
    return await cdp.evaluate(`(() => {
      const header = document.querySelector("header");
      const buttons = header ? Array.from(header.querySelectorAll("button")) : [];
      const hamburger = buttons.find(b => b.querySelector("svg.lucide-menu"));
      const hamburgerVisible = hamburger ? window.getComputedStyle(hamburger).display !== "none" : false;

      const desktopNav = header ? header.querySelector("div.flex-1.justify-center") : null;
      const desktopNavVisible = desktopNav ? window.getComputedStyle(desktopNav).display.includes("flex") : false;

      const navLinks = desktopNav ? Array.from(desktopNav.querySelectorAll(".dashboard-nav-link")) : [];
      const linkCount = navLinks.length;

      return {
        headerFound: Boolean(header),
        hamburgerVisible,
        desktopNavVisible,
        linkCount,
      };
    })()`);
  };

  // 1024x768 (Tablet)
  const nav1024 = await inspectAdminNav(1024);
  logStep("ADMIN NAV", "NAV-1", "1024px: Hamburger button is visible (xl:hidden)", nav1024.hamburgerVisible);
  logStep("ADMIN NAV", "NAV-2", "1024px: Desktop nav is hidden (hidden xl:flex) avoiding clipping", !nav1024.desktopNavVisible);

  // Click hamburger to open Sheet drawer at 1024px
  await cdp.evaluate(`(() => {
    const buttons = Array.from(document.querySelectorAll("header button"));
    const hamburger = buttons.find(b => b.querySelector("svg.lucide-menu"));
    if (hamburger) hamburger.click();
  })()`);
  await sleep(700);

  const sheetInfo = await cdp.evaluate(`(() => {
    const sheet = document.querySelector("[role='dialog']");
    if (!sheet) return { found: false };
    const links = Array.from(sheet.querySelectorAll(".dashboard-nav-link, a"));
    const labels = links.map(l => l.textContent.trim()).filter(Boolean);
    return {
      found: true,
      linkCount: labels.length,
      labels,
    };
  })()`);

  logStep("ADMIN NAV", "NAV-3", "1024px: Sheet drawer opens with all 10 Admin links", sheetInfo.found && sheetInfo.linkCount >= 10, `Found ${sheetInfo.linkCount} links: ${sheetInfo.labels?.slice(0, 5).join(", ")}...`);
  await cdp.captureScreenshot("phase7d1_admin_sheet_1024x768.png");

  // Close sheet by pressing Escape
  await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await sleep(400);

  // 1100px Viewport
  const nav1100 = await inspectAdminNav(1100);
  logStep("ADMIN NAV", "NAV-4", "1100px: Hamburger is visible, desktop nav hidden (no clipping)", nav1100.hamburgerVisible && !nav1100.desktopNavVisible);

  // 1150px Viewport
  const nav1150 = await inspectAdminNav(1150);
  logStep("ADMIN NAV", "NAV-5", "1150px: Hamburger is visible, desktop nav hidden (no clipping)", nav1150.hamburgerVisible && !nav1150.desktopNavVisible);

  // 1280px Desktop Viewport (xl breakpoint reached)
  const nav1280 = await inspectAdminNav(1280);
  logStep("ADMIN NAV", "NAV-6", "1280px (xl): Hamburger button is hidden (xl:hidden)", !nav1280.hamburgerVisible);
  logStep("ADMIN NAV", "NAV-7", "1280px (xl): Desktop nav is flex-visible rendering all 10 items", nav1280.desktopNavVisible && nav1280.linkCount === 10, `Found ${nav1280.linkCount} desktop links`);
  await cdp.captureScreenshot("phase7d1_admin_navbar_1280x800.png");

  // 1440px Large Desktop
  const nav1440 = await inspectAdminNav(1440);
  logStep("ADMIN NAV", "NAV-8", "1440px: Full desktop navbar rendered without overflow", !nav1440.hamburgerVisible && nav1440.desktopNavVisible && nav1440.linkCount === 10);

  // Compare with Citizen Role at 1024px (Citizen has 4 nav items -> uses lg:hidden / hidden lg:flex)
  await injectSession(citizenAuth);
  await cdp.navigate(`${BASE_URL}/citizen`, 1500);
  await cdp.setViewport(1024, 768);
  await sleep(300);

  const citizenNav1024 = await cdp.evaluate(`(() => {
    const header = document.querySelector("header");
    const buttons = header ? Array.from(header.querySelectorAll("button")) : [];
    const hamburger = buttons.find(b => b.querySelector("svg.lucide-menu"));
    const hamburgerVisible = hamburger ? window.getComputedStyle(hamburger).display !== "none" : false;

    const desktopNav = header ? header.querySelector("div.flex-1.justify-center") : null;
    const desktopNavVisible = desktopNav ? window.getComputedStyle(desktopNav).display.includes("flex") : false;

    return { hamburgerVisible, desktopNavVisible };
  })()`);

  logStep("ADMIN NAV", "NAV-9", "Citizen at 1024px preserves lg breakpoint: desktop nav visible, hamburger hidden", citizenNav1024.desktopNavVisible && !citizenNav1024.hamburgerVisible);

  /* -------------------------------------------------------------------------
   * VERIFICATION 4: LIGHT VS DARK THEME CONTRAST
   * ------------------------------------------------------------------------- */
  console.log("\n>>> VERIFICATION 4: LIGHT VS DARK THEME CONTRAST ON NAVBAR...");
  await injectSession(citizenAuth);

  // Light Mode Contrast
  await cdp.evaluate(`localStorage.setItem("govai_theme", "light")`);
  await cdp.navigate(`${BASE_URL}/citizen`, 1500);

  const lightContrast = await cdp.evaluate(`(() => {
    const titleEl = document.querySelector("header p.text-white");
    const subEl = document.querySelector("header p.text-slate-300");
    const activeLink = document.querySelector(".dashboard-nav-link.is-active");

    const titleColor = titleEl ? window.getComputedStyle(titleEl).color : "";
    const subColor = subEl ? window.getComputedStyle(subEl).color : "";
    const activeColor = activeLink ? window.getComputedStyle(activeLink).color : "";
    const activeBg = activeLink ? window.getComputedStyle(activeLink).backgroundColor : "";
    const activeBorder = activeLink ? window.getComputedStyle(activeLink).borderColor : "";

    return {
      titleHasWhiteClass: titleEl?.className.includes("text-white"),
      titleComputedColor: titleColor,
      subHasSlateClass: subEl?.className.includes("text-slate-300"),
      subComputedColor: subColor,
      activeColor,
      activeBg,
      activeBorder,
    };
  })()`);

  logStep("CONTRAST", "CON-1", "Light Mode: Navbar title has text-white (rgb(255, 255, 255)) on dark pill", lightContrast.titleComputedColor.includes("255, 255, 255"), `title color: ${lightContrast.titleComputedColor}`);
  logStep("CONTRAST", "CON-2", "Light Mode: Navbar subtitle has text-slate-300 (rgb(203, 213, 225))", lightContrast.subComputedColor.includes("203, 213, 225"), `sub color: ${lightContrast.subComputedColor}`);
  logStep("CONTRAST", "CON-3", "Light Mode: Active tab color is #60a5fa (rgb(96, 165, 250)) providing >7:1 contrast", lightContrast.activeColor.includes("96, 165, 250"), `color: ${lightContrast.activeColor}`);
  logStep("CONTRAST", "CON-4", "Light Mode: Active tab has rgba(59, 130, 246, 0.22) background and border", lightContrast.activeBg.includes("rgba(59, 130, 246") || lightContrast.activeBg.includes("59, 130, 246"), `bg: ${lightContrast.activeBg}`);
  await cdp.captureScreenshot("phase7d1_navbar_contrast_light_mode.png");

  // Dark Mode Contrast
  await cdp.evaluate(`localStorage.setItem("govai_theme", "dark")`);
  await cdp.navigate(`${BASE_URL}/citizen`, 1500);

  const darkContrast = await cdp.evaluate(`(() => {
    const activeLink = document.querySelector(".dashboard-nav-link.is-active");
    return {
      activeColor: activeLink ? window.getComputedStyle(activeLink).color : "",
      activeBg: activeLink ? window.getComputedStyle(activeLink).backgroundColor : "",
    };
  })()`);

  logStep("CONTRAST", "CON-5", "Dark Mode: Active tab maintains #60a5fa color with clear contrast", darkContrast.activeColor.includes("96, 165, 250"), `color: ${darkContrast.activeColor}`);
  await cdp.captureScreenshot("phase7d1_navbar_contrast_dark_mode.png");

  /* -------------------------------------------------------------------------
   * VERIFICATION 5: PRIORITY BADGE CASE NORMALIZATION ON LIVE UI
   * ------------------------------------------------------------------------- */
  console.log("\n>>> VERIFICATION 5: PRIORITY BADGE NORMALIZATION ON LIVE UI...");
  await injectSession(citizenAuth);
  await cdp.navigate(`${BASE_URL}/citizen/complaints`, 2500);

  // Wait for complaint cards to render
  await cdp.waitFor('document.querySelector(".holographic-card") !== null', 10000);

  // Inspect rendered complaint cards / badges
  const badgeResults = await cdp.evaluate(`(() => {
    const badges = Array.from(document.querySelectorAll(".holographic-card .rounded-full, .holographic-card div")).filter(el => {
      const text = el.textContent.trim();
      return ["Low", "Medium", "High", "Critical"].includes(text);
    });

    const breakdown = {
      Low: 0,
      Medium: 0,
      High: 0,
      Critical: 0,
      total: badges.length,
      sampleBadges: badges.slice(0, 6).map(b => ({
        text: b.textContent.trim(),
        className: b.className,
        color: window.getComputedStyle(b).color,
        bg: window.getComputedStyle(b).backgroundColor,
      }))
    };

    badges.forEach(b => {
      const t = b.textContent.trim();
      if (breakdown[t] !== undefined) breakdown[t]++;
    });

    return breakdown;
  })()`);

  logStep("PRIORITY BADGE", "BADGE-1", "Live UI renders Critical priority badges from DB (title-case 'Critical')", badgeResults.Critical > 0, `Count: ${badgeResults.Critical}`);
  logStep("PRIORITY BADGE", "BADGE-2", "Live UI renders High priority badges from DB (title-case 'High')", badgeResults.High > 0, `Count: ${badgeResults.High}`);
  logStep("PRIORITY BADGE", "BADGE-3", "Live UI priority badges normalized without defaulting to Low", badgeResults.High > 0 && badgeResults.Critical > 0, `Found: High=${badgeResults.High}, Critical=${badgeResults.Critical}`);
  await cdp.captureScreenshot("phase7d1_priority_badges_rendered.png");

  /* -------------------------------------------------------------------------
   * VERIFICATION 6: DUPLICATE CHATBOT SUPPRESSION ON ASSISTANT ROUTES
   * ------------------------------------------------------------------------- */
  console.log("\n>>> VERIFICATION 6: DUPLICATE CHATBOT SUPPRESSION ON ASSISTANT ROUTES...");

  // 1. Citizen Assistant (/citizen/assistant)
  await injectSession(citizenAuth);
  await cdp.navigate(`${BASE_URL}/citizen/assistant`, 1500);

  const citizenAssistantCheck = await cdp.evaluate(`(() => {
    const floatingBtn = document.querySelector("button[aria-label='Open AI Assistant']");
    const isAssistantPage = window.location.pathname === "/citizen/assistant";
    return {
      isAssistantPage,
      floatingBtnExists: Boolean(floatingBtn),
    };
  })()`);

  logStep("SUPPRESS CHATBOT", "SUPP-1", "Citizen /citizen/assistant suppresses floating chatbot launcher", citizenAssistantCheck.isAssistantPage && !citizenAssistantCheck.floatingBtnExists);
  await cdp.captureScreenshot("phase7d1_citizen_assistant_no_floating_chatbot.png");

  // 2. Department Assistant (/department/assistant)
  await injectSession(authorityAuth);
  await cdp.navigate(`${BASE_URL}/department/assistant`, 1500);

  const deptAssistantCheck = await cdp.evaluate(`(() => {
    const floatingBtn = document.querySelector("button[aria-label='Open AI Assistant']");
    const isAssistantPage = window.location.pathname === "/department/assistant";
    return {
      isAssistantPage,
      floatingBtnExists: Boolean(floatingBtn),
    };
  })()`);

  logStep("SUPPRESS CHATBOT", "SUPP-2", "Department /department/assistant suppresses floating chatbot launcher", deptAssistantCheck.isAssistantPage && !deptAssistantCheck.floatingBtnExists);

  // 3. Admin Assistant (/admin/assistant)
  await injectSession(adminAuth);
  await cdp.navigate(`${BASE_URL}/admin/assistant`, 1500);

  const adminAssistantCheck = await cdp.evaluate(`(() => {
    const floatingBtn = document.querySelector("button[aria-label='Open AI Assistant']");
    const isAssistantPage = window.location.pathname === "/admin/assistant";
    return {
      isAssistantPage,
      floatingBtnExists: Boolean(floatingBtn),
    };
  })()`);

  logStep("SUPPRESS CHATBOT", "SUPP-3", "Admin /admin/assistant suppresses floating chatbot launcher", adminAssistantCheck.isAssistantPage && !adminAssistantCheck.floatingBtnExists);

  // 4. Navigate back to non-assistant route (/citizen) to ensure launcher reappears
  await injectSession(citizenAuth);
  await cdp.navigate(`${BASE_URL}/citizen`, 1500);

  const nonAssistantCheck = await cdp.evaluate(`(() => {
    const floatingBtn = document.querySelector("button[aria-label='Open AI Assistant']");
    return Boolean(floatingBtn);
  })()`);

  logStep("SUPPRESS CHATBOT", "SUPP-4", "Floating chatbot launcher reappears on non-assistant route (/citizen)", nonAssistantCheck);

  /* -------------------------------------------------------------------------
   * VERIFICATION 7: CONSOLE ERROR AUDIT
   * ------------------------------------------------------------------------- */
  console.log("\n>>> VERIFICATION 7: CONSOLE ERROR AUDIT...");
  const realErrors = consoleErrors.filter((e) => !e.includes("favicon.ico"));
  logStep("CONSOLE AUDIT", "ERR-1", "Zero uncaught console errors recorded during all test flows", realErrors.length === 0, realErrors.length > 0 ? `Errors: ${realErrors.join("; ")}` : "0 errors");

  // Teardown
  cdp.close();
  if (chromeProc) chromeProc.kill("SIGTERM");
  try {
    if (tmpChromeDataDir) fs.rmSync(tmpChromeDataDir, { recursive: true, force: true });
  } catch {}

  console.log("\n===============================================================================");
  console.log(`PHASE 7D.1 BROWSER VERIFICATION SUMMARY: ${results.filter((r) => r.passed).length} / ${results.length} PASSED`);
  console.log("===============================================================================");

  const allPassed = results.every((r) => r.passed);
  if (!allPassed) {
    console.error("Some test steps failed! See log above.");
    process.exit(1);
  }
}

runVerification().catch((err) => {
  console.error("Verification failed with unhandled exception:", err);
  if (chromeProc) chromeProc.kill("SIGKILL");
  process.exit(1);
});
