import { setTimeout as sleepFor } from "node:timers/promises";

const DEFAULT_API_URL = "http://localhost:3000/api";

export function getBackendReadinessUrl(apiUrl = DEFAULT_API_URL) {
  const url = new URL(apiUrl);
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/v1/platform-settings/public`;
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export async function waitForBackend({
  url,
  timeoutMs = 180_000,
  intervalMs = 500,
  requestTimeoutMs = 2_000,
  fetchImpl = globalThis.fetch,
  now = Date.now,
  sleep = sleepFor,
}) {
  const startedAt = now();
  let attempts = 0;
  let lastError = "unknown error";

  while (true) {
    attempts += 1;
    const controller = new AbortController();
    const requestTimer = setTimeout(() => controller.abort(), requestTimeoutMs);

    try {
      const response = await fetchImpl(url, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      if (response.ok) return { attempts };
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    } finally {
      clearTimeout(requestTimer);
    }

    const elapsedMs = now() - startedAt;
    if (elapsedMs >= timeoutMs) break;
    await sleep(Math.min(intervalMs, timeoutMs - elapsedMs));
  }

  throw new Error(
    `Backend did not become ready within ${timeoutMs}ms (last error: ${lastError})`,
  );
}
