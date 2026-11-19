import { spawn } from "child_process";
import fs from "fs";

const CDP_PORT = 9266;
const CDP_BASE = `http://127.0.0.1:${CDP_PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function testPreflight() {
  console.log("Starting CDP Preflight Test...");
  const tmpUserData = `/tmp/chrome_govai_p7c_preflight_${Date.now()}`;

  const chromeProc = spawn("/usr/bin/google-chrome", [
    "--headless=new",
    `--remote-debugging-port=${CDP_PORT}`,
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    `--user-data-dir=${tmpUserData}`,
  ]);

  let connected = false;
  let versionData = null;

  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`${CDP_BASE}/json/version`);
      if (res.ok) {
        versionData = await res.json();
        connected = true;
        break;
      }
    } catch {}
    await sleep(200);
  }

  if (!connected) {
    chromeProc.kill("SIGKILL");
    throw new Error("Failed to connect to headless Chrome on CDP port " + CDP_PORT);
  }

  console.log("Connected to Chrome:", versionData.Browser);
  console.log("User-Agent:", versionData["User-Agent"]);
  console.log("Protocol-Version:", versionData["Protocol-Version"]);

  // Test page target & evaluation
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

  const evalRes = await send("Runtime.evaluate", {
    expression: "40 + 2",
    returnByValue: true,
  });

  console.log("JavaScript evaluation result (40 + 2):", evalRes?.result?.value);

  ws.close();
  chromeProc.kill();
  try {
    fs.rmSync(tmpUserData, { recursive: true, force: true });
  } catch {}

  if (evalRes?.result?.value === 42) {
    console.log("CDP PREFLIGHT SUCCESS: Chrome launched and JS evaluated correctly!");
    process.exit(0);
  } else {
    throw new Error("Unexpected JS eval result: " + JSON.stringify(evalRes));
  }
}

testPreflight().catch((err) => {
  console.error("CDP Preflight Failed:", err);
  process.exit(1);
});
