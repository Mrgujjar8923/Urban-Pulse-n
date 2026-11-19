import "dotenv/config";

const defaultOrigins = [
  "http://localhost:8080",
  "http://localhost:5173",
  "http://localhost:8081",
  "http://127.0.0.1:8080",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:8081",
];

export const allowedOrigins = (process.env.FRONTEND_ORIGINS || defaultOrigins.join(","))
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export const isAllowedOrigin = (origin) => !origin || allowedOrigins.includes(origin);
