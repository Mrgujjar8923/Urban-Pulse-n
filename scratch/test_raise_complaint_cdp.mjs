import path from "path";
import os from "os";
import fs from "fs";
import { spawn } from "child_process";
import dotenv from "../backend/node_modules/dotenv/lib/main.js";
import jwt from "../backend/node_modules/jsonwebtoken/index.js";
import mongoose from "../backend/node_modules/mongoose/index.js";

const envPath = path.resolve(process.cwd(), "backend/.env");
dotenv.config({ path: envPath, override: true });

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

const { User } = await import("../backend/src/models/User.js");
const { Complaint } = await import("../backend/src/models/Complaint.js");

const JWT_SECRET = process.env.JWT_SECRET || "change_me_and_keep_secret";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  await mongoose.connect(process.env.MONGO_URI, { dbName: TEST_DB_NAME });
  if (mongoose.connection.name !== TEST_DB_NAME) throw new Error("Safety halt");

  const citizen = await User.findOne({ email: "aarav.citizen@internal.test" }) ||
    await User.create({
      name: "Aarav Sharma",
      email: "aarav.citizen@internal.test",
      password: "TestPassword123!",
      role: "citizen",
      status: "active",
    });

  const token = jwt.sign({ id: citizen._id, role: "citizen" }, JWT_SECRET);

  const backendProc = spawn("node", ["backend/src/server.js"], {
    env: {
      ...process.env,
      PORT: String(TEST_PORT),
      MONGO_DB_NAME: TEST_DB_NAME,
      ALLOW_TEST_DB: "true",
      NODE_ENV: "test",
      EVIDENCE_UPLOAD_DIR: testUploadDir,
    },
    stdio: "inherit",
  });

  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`${BACKEND_URL}/health`);
      if (res.ok) break;
    } catch {}
    await sleep(200);
  }

  const tmpChrome = `/tmp/chrome_test_raise_${Date.now()}`;
  const chromeProc = spawn("/usr/bin/google-chrome", [
    "--headless=new",
    `--remote-debugging-port=${CDP_PORT}`,
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    `--user-data-dir=${tmpChrome}`,
  ]);

  for (let i = 0; i < 30; i++) {
    try {
      const vRes = await fetch(`${CDP_BASE}/json/version`);
      if (vRes.ok) break;
    } catch {}
    await sleep(200);
  }

  const listRes = await fetch(`${CDP_BASE}/json/list`);
  const targets = await listRes.json();
  const pageTarget = targets.find((t) => t.type === "page") || targets[0];
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  const send = (method, params = {}) => {
    return new Promise((resolve) => {
      const id = Math.floor(Math.random() * 1000000);
      const onMsg = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id === id) {
          ws.removeEventListener("message", onMsg);
          resolve(msg.result);
        }
      };
      ws.addEventListener("message", onMsg);
      ws.send(JSON.stringify({ id, method, params }));
    });
  };

  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.method === "Runtime.consoleAPICalled") {
      console.log("[BROWSER CONSOLE]", msg.params.type, msg.params.args?.map(a => a.value || a.description).join(" "));
    }
  });

  await send("Page.enable");
  await send("DOM.enable");
  await send("Runtime.enable");

  const clientUser = {
    id: citizen._id.toString(),
    name: citizen.name,
    email: citizen.email,
    role: "citizen",
    status: "active",
  };

  // Open /login, inject token and properly normalized client user
  await send("Page.navigate", { url: `${BASE_URL}/login` });
  await sleep(1000);
  await send("Runtime.evaluate", {
    expression: `
      localStorage.setItem("govai_token", ${JSON.stringify(token)});
      localStorage.setItem("govai_user", ${JSON.stringify(JSON.stringify(clientUser))});
    `,
  });

  // Navigate to /citizen/new
  await send("Page.navigate", { url: `${BASE_URL}/citizen/new` });
  await sleep(1500);

  // Debug inputs
  const debugInputs = await send("Runtime.evaluate", {
    expression: `
      ({
        title: Boolean(document.getElementById("title")),
        desc: Boolean(document.getElementById("description")),
        category: Boolean(document.getElementById("category")),
        fileInput: Boolean(document.getElementById("evidence-file-input")),
        submitBtn: Boolean(document.querySelector("button[type='submit']"))
      })
    `,
    returnByValue: true,
  });
  console.log("Found Form Elements:", debugInputs?.result?.value);

  // Set file input
  const intakeJpgPath = path.join(testUploadDir, "intake_test.jpg");
  fs.writeFileSync(intakeJpgPath, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));

  const doc = await send("DOM.getDocument");
  const fileNode = await send("DOM.querySelector", {
    nodeId: doc.root.nodeId,
    selector: "#evidence-file-input",
  });
  console.log("File node:", fileNode);
  await send("DOM.setFileInputFiles", { files: [intakeJpgPath], nodeId: fileNode.nodeId });
  await sleep(600);

  const previewInfo = await send("Runtime.evaluate", {
    expression: `
      ({
        hasImg: Boolean(document.querySelector("img[alt='Evidence preview']")),
        imgSrc: document.querySelector("img[alt='Evidence preview']")?.src,
        bodyTextSnippet: document.body.innerText.slice(0, 300)
      })
    `,
    returnByValue: true,
  });
  console.log("Preview Info:", previewInfo?.result?.value);

  // Fill text inputs
  await send("Runtime.evaluate", {
    expression: `
      const setReactValue = (el, val) => {
        if (!el) return;
        const prev = el.value;
        const proto = el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
        setter.call(el, val);
        if (el._valueTracker) {
          el._valueTracker.setValue(prev);
        }
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      };
      setReactValue(document.getElementById("title"), "High-pressure pipeline burst at Sector 4B");
      setReactValue(document.getElementById("description"), "Water mainline fractured under pavement with severe flooding.");
      setReactValue(document.getElementById("location"), "Sector 4B Main Road, Near Water Tank");
    `,
  });
  await sleep(400);

  // Check form values before submit
  const formCheck = await send("Runtime.evaluate", {
    expression: `
      ({
        titleVal: document.getElementById("title")?.value,
        descVal: document.getElementById("description")?.value,
        formValid: document.querySelector("form")?.checkValidity()
      })
    `,
    returnByValue: true,
  });
  console.log("Form values before submit:", formCheck?.result?.value);

  // Click category select trigger
  await send("Runtime.evaluate", {
    expression: `
      const cat = document.getElementById("category");
      if (cat) cat.click();
    `,
  });
  await sleep(400);

  // Click Water Supply option
  await send("Runtime.evaluate", {
    expression: `
      const items = Array.from(document.querySelectorAll("[role='option']"));
      const water = items.find(i => i.textContent.includes("Water Supply"));
      if (water) water.click();
    `,
  });
  await sleep(400);

  // Click Submit button
  console.log("Clicking submit button...");
  await send("Runtime.evaluate", {
    expression: `
      const btn = document.querySelector("button[type='submit']");
      if (btn) btn.click();
    `,
  });
  await sleep(3000);

  const created = await Complaint.findOne({ createdBy: citizen._id }).sort({ createdAt: -1 });
  console.log("Created Complaint in DB:", created ? {
    id: created._id.toString(),
    title: created.title,
    category: created.category,
    image: created.image,
    status: created.status,
  } : "NONE FOUND!");

  ws.close();
  chromeProc.kill();
  backendProc.kill();
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
}

run().catch(console.error);
