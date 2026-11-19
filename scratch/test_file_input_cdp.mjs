import { spawn } from "child_process";
import fs from "fs";

const CDP_PORT = 9266;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function testFileInput() {
  const tmpUserData = `/tmp/chrome_govai_p7c_test_file_${Date.now()}`;
  const chromeProc = spawn("/usr/bin/google-chrome", [
    "--headless=new",
    `--remote-debugging-port=${CDP_PORT}`,
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    `--user-data-dir=${tmpUserData}`,
  ]);

  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      if (res.ok) break;
    } catch {}
    await sleep(200);
  }

  const listRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
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

  await send("Page.enable");
  await send("DOM.enable");
  await send("Runtime.enable");

  // Create test HTML page with file input
  const testHtml = `
    <!DOCTYPE html>
    <html>
      <body>
        <input type="file" id="evidence-file-input" />
        <div id="file-info">No file</div>
        <script>
          document.getElementById("evidence-file-input").addEventListener("change", (e) => {
            const file = e.target.files[0];
            document.getElementById("file-info").textContent = file ? file.name + " (" + file.size + " bytes)" : "None";
          });
        </script>
      </body>
    </html>
  `;
  const base64Html = Buffer.from(testHtml).toString("base64");
  await send("Page.navigate", { url: `data:text/html;base64,${base64Html}` });
  await sleep(500);

  // Create temporary test file
  const samplePath = `/tmp/test_cdp_sample_${Date.now()}.jpg`;
  fs.writeFileSync(samplePath, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]));

  const doc = await send("DOM.getDocument");
  const node = await send("DOM.querySelector", { nodeId: doc.root.nodeId, selector: "#evidence-file-input" });
  await send("DOM.setFileInputFiles", { files: [samplePath], nodeId: node.nodeId });

  await sleep(300);

  const fileInfo = await send("Runtime.evaluate", {
    expression: 'document.getElementById("file-info").textContent',
    returnByValue: true,
  });

  console.log("File Info after DOM.setFileInputFiles:", fileInfo?.result?.value);

  ws.close();
  chromeProc.kill();
  try {
    fs.unlinkSync(samplePath);
    fs.rmSync(tmpUserData, { recursive: true, force: true });
  } catch {}

  if (fileInfo?.result?.value?.includes("test_cdp_sample")) {
    console.log("TEST FILE INPUT SUCCESS!");
    process.exit(0);
  } else {
    throw new Error("File input test failed");
  }
}

testFileInput().catch((e) => {
  console.error("File input test error:", e);
  process.exit(1);
});
