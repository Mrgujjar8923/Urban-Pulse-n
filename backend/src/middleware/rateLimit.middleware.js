import rateLimit, { ipKeyGenerator } from "express-rate-limit";

const isTestEnvironment = () => process.env.NODE_ENV === "test" && process.env.ENABLE_RATE_LIMIT_TEST !== "true";

/**
 * Key generator that prefers authenticated user ID, falling back to client IP.
 */
const userOrIpKeyGenerator = (req) => {
  if (req.user?._id) {
    return req.user._id.toString();
  }
  return ipKeyGenerator(req);
};

/**
 * Standard handler to return clean JSON with HTTP 429.
 */
const createLimitHandler = (customMessage) => (req, res, _next, options) => {
  res.status(options.statusCode).json({
    message: customMessage || "Too many requests. Please try again later.",
  });
};

/**
 * 1. Global API Rate Limiter
 * Applied to all /api routes to prevent volumetric flooding.
 */
export const globalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: Number(process.env.RATE_LIMIT_GLOBAL_MAX) || 500,
  standardHeaders: true,
  legacyHeaders: false,
  skip: isTestEnvironment,
  handler: createLimitHandler("Too many requests across the platform. Please try again later."),
});

/**
 * 2. Auth Rate Limiter
 * Strictly guards /api/auth/login and /api/auth/register against brute-force attacks.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: Number(process.env.RATE_LIMIT_AUTH_MAX) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req),
  skip: isTestEnvironment,
  handler: createLimitHandler("Too many login or registration attempts. Please try again after 15 minutes."),
});

/**
 * 3. Assistant / Chatbot Rate Limiter
 * Guards /api/assistant/chat against abusive Gemini API calls.
 */
export const assistantLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: Number(process.env.RATE_LIMIT_ASSISTANT_MAX) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKeyGenerator,
  skip: isTestEnvironment,
  handler: createLimitHandler("Too many assistant queries. Please wait a moment before sending another query."),
});

/**
 * 4. Complaint Creation Rate Limiter
 * Guards POST /api/complaints against complaint submission spam.
 */
export const complaintCreateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: Number(process.env.RATE_LIMIT_COMPLAINT_MAX) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKeyGenerator,
  skip: isTestEnvironment,
  handler: createLimitHandler("Too many complaints submitted. Please try again after 15 minutes."),
});

/**
 * 5. Password Reset Rate Limiter
 * Guards POST /api/auth/forgot-password and POST /api/auth/reset-password against abuse.
 */
export const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: Number(process.env.RATE_LIMIT_RESET_MAX) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req),
  skip: isTestEnvironment,
  handler: createLimitHandler("Too many password reset requests. Please try again after 15 minutes."),
});

/**
 * Factory for creating testable isolated rate limiters with custom thresholds.
 */
export const createCustomRateLimiter = ({ windowMs = 60000, max = 5, message = "Rate limit exceeded" } = {}) => {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: createLimitHandler(message),
  });
};
