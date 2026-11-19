const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

type UnauthorizedCallback = () => void;
let unauthorizedCallback: UnauthorizedCallback | null = null;

export const setUnauthorizedHandler = (cb: UnauthorizedCallback | null) => {
  unauthorizedCallback = cb;
};

export const notifyUnauthorized = () => {
  if (unauthorizedCallback) {
    unauthorizedCallback();
  }
};

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const getHeaders = () => {
  const token = localStorage.getItem("govai_token");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
};

const handle = async (res: Response, path: string) => {
  if (!res.ok) {
    let message = res.statusText;

    try {
      // Read the body ONCE as text, then attempt JSON parse from that string.
      // This prevents "body stream already read" that occurs when both
      // res.json() and res.text() are called on the same response stream.
      const rawText = await res.text();
      try {
        const data = JSON.parse(rawText);
        if (Array.isArray(data?.errors) && data.errors.length > 0) {
          message = data.errors[0]?.msg || message;
        } else {
          message = data?.message || message;
        }
      } catch {
        // rawText is not JSON — use it directly if non-empty
        message = rawText || message;
      }
    } catch {
      // network-level failure reading body — keep statusText
    }

    // Notify AuthContext of session expiration on 401 (excluding public login attempts)
    if (res.status === 401 && !path.includes("/api/auth/login")) {
      notifyUnauthorized();
    }

    throw new ApiError(res.status, message);
  }

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return res.json();
  return null;
};

const DEFAULT_TIMEOUT_MS = 30000;

interface RequestOptions {
  responseType?: "json" | "blob";
}

const request = async (path: string, init: RequestInit = {}, options: RequestOptions = {}) => {
  let res: Response;
  const controller = new AbortController();
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, DEFAULT_TIMEOUT_MS);

  // If the caller already provided an AbortSignal, abort our controller if their signal aborts
  if (init.signal) {
    if (init.signal.aborted) {
      clearTimeout(timer);
      controller.abort();
    } else {
      init.signal.addEventListener("abort", () => {
        clearTimeout(timer);
        controller.abort();
      }, { once: true });
    }
  }

  const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;
  const requestHeaders: Record<string, string> = {
    ...getHeaders(),
    ...((init.headers as Record<string, string>) || {}),
  };
  if (isFormData) {
    delete requestHeaders["Content-Type"];
  }

  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: requestHeaders,
    });
  } catch (error) {
    clearTimeout(timer);
    if (timedOut) {
      throw new ApiError(0, "Request timed out after 30 seconds");
    }
    if (init.signal?.aborted) {
      const message = error instanceof Error ? error.message : "Request aborted";
      throw new ApiError(0, message);
    }
    const message = error instanceof Error ? error.message : "Network request failed";
    throw new ApiError(0, message);
  } finally {
    clearTimeout(timer);
  }

  if (options.responseType === "blob") {
    if (!res.ok) {
      return handle(res, path);
    }
    return res.blob();
  }

  return handle(res, path);
};

export const apiClient = {
  get(path: string, init?: RequestInit) {
    return request(path, init);
  },
  getBlob(path: string, init?: RequestInit): Promise<Blob> {
    return request(path, init, { responseType: "blob" }) as Promise<Blob>;
  },
  post(path: string, body: unknown, init?: RequestInit) {
    const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
    return request(path, {
      ...init,
      method: "POST",
      body: isFormData ? body : JSON.stringify(body),
    });
  },
  put(path: string, body: unknown, init?: RequestInit) {
    const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
    return request(path, {
      ...init,
      method: "PUT",
      body: isFormData ? body : JSON.stringify(body),
    });
  },
  delete(path: string, init?: RequestInit) {
    return request(path, { ...init, method: "DELETE" });
  },
};
