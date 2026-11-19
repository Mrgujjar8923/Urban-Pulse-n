import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import mongoose from "mongoose";
import app from "./app.js";
import { connectDB } from "./config/db.js";
import { startOverdueSlaJob, stopOverdueSlaJob } from "./services/slaEscalation.service.js";
import { initializeNotificationSocket, closeNotificationSocket } from "./services/notificationSocket.service.js";

dotenv.config({ override: true });

const PORT = process.env.PORT || 5000;

let httpServer = null;
let isShuttingDown = false;

export const gracefulShutdown = async (signal = "SIGTERM", { exit = true } = {}) => {
  if (isShuttingDown) {
    console.log(`[Process] Shutdown already in progress. Ignoring ${signal}.`);
    return;
  }
  isShuttingDown = true;
  console.log(`[Process] Received ${signal}. Starting graceful shutdown...`);

  // Fallback watchdog timer to force exit if hanging resources block termination
  let forceExitTimeout = null;
  if (exit && process.env.NODE_ENV !== "test") {
    forceExitTimeout = setTimeout(() => {
      console.error("[Process] Graceful shutdown timed out after 10s. Forcing exit.");
      process.exit(1);
    }, 10000);
    forceExitTimeout.unref();
  }

  try {
    // 1. Stop background SLA escalation timer
    stopOverdueSlaJob();
    console.log("[Process] Stopped background SLA escalation job.");

    // 2. Stop accepting new HTTP requests and drain connections
    if (httpServer && httpServer.listening) {
      await new Promise((resolve) => {
        httpServer.close((err) => {
          if (err) console.warn("[Process] Error closing HTTP server:", err.message);
          resolve();
        });
      });
      console.log("[Process] Closed HTTP server connections.");
    }

    // 3. Disconnect Socket.IO clients and close server
    await closeNotificationSocket();
    console.log("[Process] Closed Socket.IO connections.");

    // 4. Close MongoDB connection cleanly
    if (mongoose.connection && mongoose.connection.readyState !== 0) {
      await mongoose.connection.close(false);
      console.log("[Process] Closed MongoDB connection.");
    }

    console.log("[Process] Graceful shutdown completed cleanly.");
    if (exit && process.env.NODE_ENV !== "test") {
      process.exit(0);
    }
  } catch (error) {
    console.error("[Process] Error during graceful shutdown:", error);
    if (exit && process.env.NODE_ENV !== "test") {
      process.exit(1);
    }
    throw error;
  }
};

export const start = async () => {
  try {
    await connectDB();
    httpServer = http.createServer(app);
    initializeNotificationSocket(httpServer);
    httpServer.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
    if (process.env.ENABLE_SLA_JOB !== "false") {
      startOverdueSlaJob();
    }
    return httpServer;
  } catch (error) {
    console.error("Failed to start server", error.message);
    process.exit(1);
  }
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  console.error("[Process] Unhandled promise rejection:", message);
});

process.on("uncaughtException", (error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("[Process] Uncaught exception occurred:", message);
  process.exit(1);
});

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectRun) {
  start();
}

export { httpServer };
