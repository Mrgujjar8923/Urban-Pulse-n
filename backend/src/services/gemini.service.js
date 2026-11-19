const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export class GeminiServiceError extends Error {
  constructor(message, code, statusCode = 500, details = {}) {
    super(message);
    this.name = "GeminiServiceError";
    this.code = code;
    this.statusCode = statusCode;
    Object.assign(this, details);
  }
}

export const sanitizeProviderMessage = (message) => {
  if (typeof message !== "string") return null;
  const sanitized = message
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return sanitized ? sanitized.slice(0, 240) : null;
};

export const getProviderErrorDetails = (payload) => {
  const providerError = payload?.error;
  const rawProviderCode = typeof providerError?.status === "string"
    ? providerError.status
    : typeof providerError?.code === "string"
      ? providerError.code
      : null;
  const providerCode = rawProviderCode
    ? rawProviderCode.replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 80) || null
    : null;
  const providerMessage = sanitizeProviderMessage(providerError?.message);

  return { providerCode, providerMessage };
};

export const classifyProviderStatus = (status) => {
  if (status === 400) return "PROVIDER_BAD_REQUEST";
  if (status === 401 || status === 403) return "PROVIDER_AUTH_FAILED";
  if (status === 429) return "PROVIDER_RATE_LIMITED";
  if (status >= 500 && status <= 599) return "PROVIDER_UNAVAILABLE";
  return "PROVIDER_ERROR";
};

export const isTransientGeminiError = (error) => {
  const code = error?.code;
  return (
    code === "TIMEOUT" ||
    code === "NETWORK_ERROR" ||
    code === "PROVIDER_RATE_LIMITED" ||
    code === "PROVIDER_UNAVAILABLE" ||
    code === "REQUEST_FAILED"
  );
};

export const extractGeneratedText = (payload) => {
  const parts = payload?.candidates?.[0]?.content?.parts;

  if (!Array.isArray(parts)) {
    throw new GeminiServiceError("Gemini did not return a text response.", "MALFORMED_RESPONSE", 502);
  }

  const text = parts
    .map((part) => part?.text || "")
    .join("\n")
    .trim();

  if (!text) {
    throw new GeminiServiceError("Gemini did not return a text response.", "MALFORMED_RESPONSE", 502);
  }

  return text;
};

export const parseResponseBody = async (response) => {
  const rawBody = await response.text();

  if (!rawBody.trim()) {
    return {};
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    return { rawBody };
  }
};

export const generateGeminiText = async (
  prompt,
  {
    contents = [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig = { temperature: 0.4, topP: 0.9, maxOutputTokens: 500 },
    attempt = 1,
    timeoutMs = 8000,
  } = {}
) => {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new GeminiServiceError("Gemini is not configured.", "MISSING_API_KEY", 503);
  }

  if (typeof prompt !== "string" || !prompt.trim()) {
    throw new GeminiServiceError("A Gemini prompt is required.", "INVALID_PROMPT", 400);
  }

  let geminiResponse;
  let payload;

  try {
    const signal = typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
      ? AbortSignal.timeout(timeoutMs)
      : undefined;

    geminiResponse = await fetch(GEMINI_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: prompt }],
        },
        contents,
        generationConfig,
      }),
      signal,
    });

    payload = await parseResponseBody(geminiResponse);
  } catch (error) {
    const isTimeout = error?.name === "TimeoutError" || error?.name === "AbortError";
    const isNetwork = !isTimeout && (
      error?.message?.includes("fetch failed") ||
      error?.code === "ENOTFOUND" ||
      error?.code === "ECONNREFUSED" ||
      error?.code === "ECONNRESET"
    );

    const code = isTimeout ? "TIMEOUT" : isNetwork ? "NETWORK_ERROR" : "REQUEST_FAILED";
    const statusCode = isTimeout ? 504 : isNetwork ? 503 : 502;
    const userMessage = isTimeout
      ? "Gemini request timed out."
      : isNetwork
        ? "Network connection to Gemini failed."
        : `Gemini request failed: ${error.message}`;

    console.error("[Gemini] Request failed", {
      model: GEMINI_MODEL,
      attempt,
      code,
      error: error.message,
    });

    throw new GeminiServiceError(userMessage, code, statusCode, {
      attempt,
      originalError: error.message,
    });
  }

  if (!geminiResponse.ok) {
    const { providerCode, providerMessage } = getProviderErrorDetails(payload);
    const code = classifyProviderStatus(geminiResponse.status);
    const message = providerMessage || `Gemini request failed with HTTP ${geminiResponse.status}.`;
    const statusCode = geminiResponse.status === 429 ? 429 : geminiResponse.status >= 500 ? 503 : 502;

    console.error("[Gemini] Provider request failed", {
      model: GEMINI_MODEL,
      attempt,
      status: geminiResponse.status,
      code,
      providerCode,
      message,
    });

    throw new GeminiServiceError(message, code, statusCode, {
      providerStatus: geminiResponse.status,
      providerCode,
      attempt,
    });
  }

  return extractGeneratedText(payload);
};

export { GEMINI_MODEL };
