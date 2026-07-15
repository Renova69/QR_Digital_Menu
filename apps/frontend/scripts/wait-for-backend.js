import { loadEnv } from "vite";
import { getBackendReadinessUrl, waitForBackend } from "./backend-readiness.js";

const fileEnv = loadEnv("development", process.cwd(), "");
const env = { ...fileEnv, ...process.env };

if (env.DEV_WAIT_FOR_BACKEND === "false") {
  console.log("[frontend:dev] Backend readiness wait disabled.");
} else {
  const apiUrl = env.VITE_API_URL || "http://localhost:3000/api";
  const readinessUrl = getBackendReadinessUrl(apiUrl);
  const configuredTimeout = Number(env.DEV_BACKEND_WAIT_TIMEOUT_MS);
  const timeoutMs =
    Number.isFinite(configuredTimeout) && configuredTimeout > 0
      ? configuredTimeout
      : 180_000;

  console.log(
    `[frontend:dev] Waiting for backend readiness at ${readinessUrl}...`,
  );

  try {
    const { attempts } = await waitForBackend({
      url: readinessUrl,
      timeoutMs,
    });
    console.log(
      `[frontend:dev] Backend ready after ${attempts} attempt${attempts === 1 ? "" : "s"}.`,
    );
  } catch (error) {
    console.error(
      `[frontend:dev] ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}
