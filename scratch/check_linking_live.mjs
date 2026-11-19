import path from "path";
import dotenv from "../backend/node_modules/dotenv/lib/main.js";
import jwt from "../backend/node_modules/jsonwebtoken/index.js";
import mongoose from "../backend/node_modules/mongoose/index.js";
import WebSocket from "../backend/node_modules/ws/index.js";

const envPath = path.resolve(process.cwd(), "backend/.env");
dotenv.config({ path: envPath, override: true });

// Check what the browser actually sees on /admin/departments
const CDP_BASE = "http://127.0.0.1:9266";
try {
  const listRes = await fetch(`${CDP_BASE}/json/list`);
  const targets = await listRes.json();
  console.log("CDP Targets:", targets.length);
} catch (e) {
  console.log("No running Chrome CDP on 9266:", e.message);
}
