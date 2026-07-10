type ClientLogLevel = "info" | "warn" | "error";

type ClientLogPayload = {
  level: ClientLogLevel;
  type: string;
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
};

const CLIENT_LOG_ENDPOINT = "/api/v1/client-logs";
const MAX_STRING_LENGTH = 4_000;

let installed = false;
let memorySessionId: string | null = null;

function shouldSendClientLogs(): boolean {
  return import.meta.env.VITE_CLIENT_LOGS_ENABLED !== "false";
}

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function getClientSessionId(): string {
  if (memorySessionId) return memorySessionId;
  try {
    const existing = window.sessionStorage.getItem("qr-menu-client-session-id");
    if (existing) {
      memorySessionId = existing;
      return existing;
    }
    memorySessionId = makeId();
    window.sessionStorage.setItem("qr-menu-client-session-id", memorySessionId);
    return memorySessionId;
  } catch {
    memorySessionId = makeId();
    return memorySessionId;
  }
}

function truncate(
  value: unknown,
  maxLength = MAX_STRING_LENGTH,
): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = typeof value === "string" ? value : String(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...[truncated]`;
}

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return {
    name: "Error",
    message: truncate(error, 1_000) ?? "Unknown error",
    stack: undefined,
  };
}

function safeContext(context?: Record<string, unknown>) {
  if (!context) return undefined;
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context).slice(0, 30)) {
    if (/password|token|secret|cookie|authorization|card|pan|cvv/i.test(key)) {
      continue;
    }
    output[key] =
      typeof value === "string" ? truncate(value, 1_000) : (value ?? null);
  }
  return output;
}

export function sendClientLog(payload: ClientLogPayload) {
  const line = `[client-log:${payload.type}] ${payload.message}`;
  if (payload.level === "error") console.error(line, payload.context ?? "");
  else if (payload.level === "warn") console.warn(line, payload.context ?? "");
  else if (import.meta.env.DEV) console.info(line, payload.context ?? "");

  if (!shouldSendClientLogs() || typeof window === "undefined") return;

  const body = JSON.stringify({
    level: payload.level,
    type: payload.type,
    message: truncate(payload.message, 1_000),
    stack: truncate(payload.stack),
    context: safeContext(payload.context),
    clientSessionId: getClientSessionId(),
    clientEventId: makeId(),
    url: window.location.href,
    path: window.location.pathname,
    userAgent: navigator.userAgent,
    appVersion: import.meta.env.VITE_APP_VERSION,
    buildMode: import.meta.env.MODE,
  });

  fetch(CLIENT_LOG_ENDPOINT, {
    method: "POST",
    credentials: "include",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body,
  }).catch(() => {
    // Logging must never break the app or recursively log itself.
  });
}

export function logClientError(
  error: unknown,
  context?: Record<string, unknown>,
) {
  const normalized = normalizeError(error);
  sendClientLog({
    level: "error",
    type: String(context?.type ?? "client_error"),
    message: normalized.message,
    stack: normalized.stack,
    context: {
      ...context,
      errorName: normalized.name,
    },
  });
}

export function logApiError(error: any) {
  const url = String(error?.config?.url ?? "");
  if (url.includes("/client-logs")) return;

  const method = String(error?.config?.method ?? "GET").toUpperCase();
  const status = error?.response?.status;
  const requestId =
    error?.response?.headers?.["x-request-id"] ??
    error?.response?.headers?.["X-Request-Id"];
  const responseMessage =
    error?.response?.data?.message ??
    error?.response?.data?.error ??
    error?.message;

  if (
    status === 401 &&
    (url.endsWith("/auth/me") || url.endsWith("/auth/pin-login"))
  ) {
    return;
  }

  sendClientLog({
    level: status && status < 500 ? "warn" : "error",
    type: "api_error",
    message: `${method} ${url || "unknown-url"} failed${
      status ? ` with ${status}` : ""
    }`,
    context: {
      method,
      url,
      status,
      backendRequestId: requestId,
      responseMessage: truncate(responseMessage, 1_000),
      currentPath: window.location.pathname,
    },
  });
}

export function installGlobalErrorLogging() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (event) => {
    logClientError(event.error ?? event.message, {
      type: "window_error",
      filename: event.filename,
      line: event.lineno,
      column: event.colno,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    logClientError(event.reason, {
      type: "unhandled_rejection",
    });
  });
}
