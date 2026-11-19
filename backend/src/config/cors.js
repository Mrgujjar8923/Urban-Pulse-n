import "dotenv/config";

const defaultOrigins = [
  "http://localhost:8080",
  "http://localhost:5173",
  "http://localhost:8081",
  "http://127.0.0.1:8080",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:8081",
  "https://urban-pulse-n.onrender.com",
];

const envOriginSources = [
  process.env.FRONTEND_ORIGINS,
  process.env.CLIENT_URL,
  process.env.FRONTEND_URL,
].filter(Boolean).join(",");

const configuredOrigins = envOriginSources
  ? envOriginSources
      .split(",")
      .map((origin) => origin.trim().replace(/\/+$/, ""))
      .filter(Boolean)
  : [];

const normalizedDefaults = defaultOrigins
  .map((origin) => origin.trim().replace(/\/+$/, ""))
  .filter(Boolean);

export const allowedOrigins = Array.from(new Set([...normalizedDefaults, ...configuredOrigins]));

export const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  const normalized = origin.trim().replace(/\/+$/, "");
  return allowedOrigins.includes("*") || allowedOrigins.includes(normalized);
};
