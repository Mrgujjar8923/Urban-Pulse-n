import express from "express";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";
import helmet from "helmet";
import mongoose from "mongoose";

import authRoutes from "./routes/auth.routes.js";
import complaintRoutes from "./routes/complaint.routes.js";
import memberRoutes from "./routes/member.routes.js";
import feedbackRoutes from "./routes/feedback.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import assistantRoutes from "./routes/assistant.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import { isAllowedOrigin } from "./config/cors.js";
import { globalApiLimiter } from "./middleware/rateLimit.middleware.js";

dotenv.config({ override: true });

const app = express();

// Trust reverse proxies (Vite proxy, Nginx, cloud load balancers)
app.set("trust proxy", process.env.TRUST_PROXY ? (Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY) : 1);

// HTTP Security Headers
app.use(
  helmet({
    contentSecurityPolicy: false, // Prevent breaking React SPA, WebSocket connections, or Vite
    crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow cross-origin evidence previews and API fetches
  })
);

app.use(cors({
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) return callback(null, true);
    return callback(new Error("Origin not allowed"));
  },
}));
app.use(express.json());
app.use(morgan("dev"));

app.get("/health", (_req, res) => {
  const isDbConnected = mongoose.connection.readyState === 1;
  if (!isDbConnected) {
    return res.status(503).json({
      status: "degraded",
      database: "disconnected",
    });
  }

  return res.status(200).json({
    status: "ok",
    database: "connected",
  });
});

// Protect all API endpoints with global baseline rate limiter
app.use("/api", globalApiLimiter);

app.use("/api/auth", authRoutes);
app.use("/api/complaints", complaintRoutes);
app.use("/api/members", memberRoutes);
app.use("/api/feedback", feedbackRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/assistant", assistantRoutes);
app.use("/api/admin", adminRoutes);

app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

app.use((err, req, res, _next) => {
  if (err instanceof SyntaxError && (err.status === 400 || err.statusCode === 400) && "body" in err) {
    return res.status(400).json({ message: "Invalid JSON payload" });
  }

  const statusCode = Number.isInteger(err.status) && err.status >= 400 && err.status < 600
    ? err.status
    : Number.isInteger(err.statusCode) && err.statusCode >= 400 && err.statusCode < 600
      ? err.statusCode
      : 500;

  if (statusCode >= 500) {
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }

  return res.status(statusCode).json({
    message: err.message || "Request failed",
  });
});

export default app;
