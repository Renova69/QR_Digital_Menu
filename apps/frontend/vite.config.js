import { defineConfig, loadEnv, createLogger } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { VitePWA } from "vite-plugin-pwa";
import { sentryVitePlugin } from "@sentry/vite-plugin";

// Collapse vite's benign proxy-error stack dumps into one throttled line.
//
// The `backend:dev` process runs `nest start --watch`, so every backend save
// tears down port 3000 for a second while it recompiles. The wait-for-backend
// gate only runs ONCE at `npm run dev` start — it does not re-fire on these
// watch-restarts. Meanwhile the already-open browser keeps polling the API and
// reconnecting the socket, so each restart produces a wall of proxy errors that
// vite prints with a full node:net stack:
//   - `ws proxy socket error` / ECONNABORTED  — WS torn down mid-write
//   - `ws proxy error` + `http proxy error`   — new request hits the closed port
//                                               (ECONNREFUSED) before Nest re-listens
// All of it self-heals the moment the backend is back (axios + socket.io retry).
// Vite attaches its own error listeners, so a proxy `configure` hook can't stop
// the logging — a customLogger is the only reliable intercept.
//
// We swallow the multi-line stacks but still emit a single compact notice (at
// most once per interval) so a REAL sustained outage — backend that never comes
// back — stays visible instead of being silently hidden.
const PROXY_ERROR_LABELS = [
  "ws proxy socket error",
  "ws proxy error",
  "http proxy error",
];
const BENIGN_PROXY_CODES = [
  "ECONNREFUSED",
  "ECONNABORTED",
  "ECONNRESET",
  "EPIPE",
  "ETIMEDOUT",
];
const BACKEND_DOWN_NOTICE_INTERVAL_MS = 3000;
let lastBackendDownNotice = 0;

const quietLogger = createLogger();
const originalError = quietLogger.error.bind(quietLogger);
quietLogger.error = (msg, options) => {
  const text = typeof msg === "string" ? msg : "";
  const isProxyLabel = PROXY_ERROR_LABELS.some((label) => text.includes(label));
  // AggregateError (ECONNREFUSED via happy-eyeballs) doesn't always expose
  // `.code`, so fall back to scanning the message/stack for the code token.
  const isBenign =
    isProxyLabel &&
    (BENIGN_PROXY_CODES.includes(options?.error?.code) ||
      BENIGN_PROXY_CODES.some((code) => text.includes(code)));

  if (isBenign) {
    const now = Date.now();
    if (now - lastBackendDownNotice > BACKEND_DOWN_NOTICE_INTERVAL_MS) {
      lastBackendDownNotice = now;
      originalError(
        "[dev] backend proxy target unavailable (restarting?) — requests will retry",
        { timestamp: true },
      );
    }
    return;
  }
  originalError(msg, options);
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // Derive the bare backend origin (scheme+host+port) that the dev proxy targets
  // from VITE_API_URL. Use URL().origin so ANY path suffix is dropped, not just a
  // trailing `/api` — a value like http://host:3000/api/v1 would otherwise slip
  // past a `/\/api\/?$/` strip and make the proxy double-prefix the path
  // (target /api/v1 + request /api/v1/... → /api/v1/api/v1/..., every call 404s).
  const rawApiUrl = env.VITE_API_URL || "http://localhost:3000/api";
  let backendOrigin;
  try {
    backendOrigin = new URL(rawApiUrl).origin;
  } catch {
    throw new Error(
      `VITE_API_URL is not a valid absolute URL: "${rawApiUrl}". ` +
        `Expected something like http://localhost:3000/api`,
    );
  }

  return {
    customLogger: quietLogger,
    plugins: [
      react(),
      tsconfigPaths({ root: "." }),
      VitePWA({
        strategies: "injectManifest",
        srcDir: "src",
        filename: "sw.ts",
        registerType: "autoUpdate",
        injectRegister: "auto",
        manifest: {
          name: "Renova Digital Menu Platform",
          short_name: "Renova",
          description: "Renova digital menu platform — scan, browse, order.",
          theme_color: "#0D1B2A",
          background_color: "#F5F7FA",
          display: "standalone",
          start_url: ".",
          icons: [
            {
              src: "renova-mark.svg",
              sizes: "any",
              type: "image/svg+xml",
              purpose: "any",
            },
            {
              src: "logo192.png",
              type: "image/png",
              sizes: "192x192",
            },
            {
              src: "logo512.png",
              type: "image/png",
              sizes: "512x512",
            },
          ],
        },
        devOptions: {
          enabled: false,
          type: "module",
        },
      }),
      // Source-map upload only — never affects module resolution/chunking
      // (see the manualChunks comment above on why that matters here).
      // SENTRY_AUTH_TOKEN is a separate org-level secret from the public
      // VITE_SENTRY_DSN; without it this plugin silently no-ops rather than
      // failing the build, so local/CI builds without the token still work.
      env.SENTRY_AUTH_TOKEN &&
        sentryVitePlugin({
          org: env.SENTRY_ORG,
          project: env.SENTRY_PROJECT || "qr-menu-frontend",
          authToken: env.SENTRY_AUTH_TOKEN,
          sourcemaps: {
            filesToDeleteAfterUpload: ["**/*.map"],
          },
        }),
    ].filter(Boolean),
    server: {
      host: true,
      strictPort: true,
      port: 3001,
      proxy: {
        // xfwd adds X-Forwarded-For/-Proto/-Host so the backend sees the real
        // browser IP instead of 127.0.0.1. Without it, ThrottlerGuard buckets
        // all dev traffic under one IP and any req.ip logic reads localhost —
        // making local rate-limit / IP-based behavior untestable.
        "/api": {
          target: backendOrigin,
          changeOrigin: true,
          xfwd: true,
        },
        "/socket.io": {
          target: backendOrigin,
          changeOrigin: true,
          ws: true,
          xfwd: true,
        },
      },
    },
    optimizeDeps: {
      include: ["react-qr-code"],
    },
    build: {
      chunkSizeWarningLimit: 1000,
      // "hidden": generate maps for the Sentry plugin to upload, but never
      // emit a `//# sourceMappingURL` comment in the shipped bundle — with
      // filesToDeleteAfterUpload removing the .map files afterward too,
      // there's neither a dangling reference nor a public map in the deploy.
      sourcemap: "hidden",
      // Split heavy third-party libs out of the main bundle (#5) so the entry
      // chunk shrinks and vendors cache independently across deploys.
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return undefined;
            if (
              id.includes("recharts") ||
              id.includes("/d3-") ||
              id.includes("victory")
            )
              return "charts";
            if (id.includes("@stripe")) return "stripe";
            // Match the whole excel packages, NOT their internal `modules/xlsx/`
            // subdir. A bare `id.includes('xlsx')` grabbed only those files and
            // left the rest of each package in `vendor`, splitting one package
            // across two chunks → circular `xlsx -> vendor -> xlsx`. The only
            // importers of these libs are app route chunks (never vendor), so a
            // one-way `xlsx -> vendor` edge for shared deps is fine.
            if (
              id.includes("write-excel-file") ||
              id.includes("read-excel-file")
            )
              return "xlsx";
            if (id.includes("@radix-ui")) return "radix";
            if (id.includes("react-router") || id.includes("@tanstack"))
              return "router-query";
            // React core, react-dom and scheduler stay in `vendor` alongside
            // React-consuming libs (react-i18next, etc.). A dedicated `react`
            // chunk created a circular chunk import: react-i18next (in `vendor`)
            // evaluates `React.createContext()` at module top-level, while the
            // `react` chunk in turn imported shared helpers back from `vendor`.
            // On the cyclic init the vendor chunk ran first, so `React` was
            // still undefined → "Cannot read properties of undefined (reading
            // 'createContext')" and a blank prod page. Dev (unbundled ESM) never
            // hit the cycle. Keeping React in `vendor` makes every other split
            // chunk a one-way leaf importer of React — no cycle possible.
            return "vendor";
          },
        },
      },
    },
    test: {
      globals: true,
      environment: "jsdom",
      setupFiles: "./src/setupTests.js",
      include: ["src/**/*.test.{ts,tsx}"],
      pool: "forks",
      maxWorkers: 4,
      reporters: [
        "default",
        [
          "tdd-guard-vitest",
          { projectRoot: "F:/PROGRAMING/QR_Digital_Menu-main" },
        ],
      ],
      coverage: {
        provider: "v8",
        reporter: ["text", "json-summary", "html", "clover"],
        reportsDirectory: "./coverage",
        include: ["src/**/*.{ts,tsx}"],
        exclude: [
          "src/**/*.test.{ts,tsx}",
          "src/**/__tests__/**",
          "src/**/*.d.ts",
          "src/**/*.backup.{ts,tsx}",
        ],
        thresholds: {
          branches: 65,
          functions: 40,
          lines: 35,
          statements: 35,
        },
      },
    },
  };
});
