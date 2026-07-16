import React, { Suspense } from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./index.css";
import App from "./App";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import reportWebVitals from "./reportWebVitals";
import "./i18n";
import { installGlobalErrorLogging } from "./lib/clientLogger";
import { reloadOnceForStaleChunk } from "./lib/lazyWithReload";
import { configureServiceWorker } from "./lib/serviceWorkerRegistration";

import { registerSW } from "virtual:pwa-register";

void configureServiceWorker({
  serviceWorker:
    "serviceWorker" in navigator ? navigator.serviceWorker : undefined,
  caches: "caches" in window ? window.caches : undefined,
  isProduction: import.meta.env.PROD,
  register: registerSW,
});

installGlobalErrorLogging();

// A modulepreload <link> for a route chunk that a new deploy has purged fires
// this before the dynamic import runs. Recover the same way lazyWithReload does
// — reload once to fetch the fresh index.html + current hashes — and swallow
// the default (which otherwise throws an unhandled error).
window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  reloadOnceForStaleChunk();
});

// Fix C-6 — validate the Stripe publishable key at startup so a misconfigured
// deploy surfaces loudly instead of silently breaking pay-at-table.
const stripeKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
if (!stripeKey) {
  const message =
    "[Startup] VITE_STRIPE_PUBLISHABLE_KEY is not set — payment will not work";
  if (import.meta.env.DEV) {
    // In dev: throw a visible error so it cannot be missed during development.
    throw new Error(message);
  }
  // In prod: log the error and continue (don't crash the whole app over a
  // feature that not every page depends on).
  console.error(message);
}

const queryClient = new QueryClient();
const container = document.getElementById("root");

// Shown while the active language's translation chunk loads on first paint.
// react-i18next suspends until resources are ready (see i18n.ts); this root
// boundary covers components rendered outside App's route-level <Suspense>
// (e.g. CookieConsentBanner).
const RootLoader = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
  </div>
);

if (container) {
  const root = ReactDOM.createRoot(container);
  root.render(
    <React.StrictMode>
      <Suspense fallback={<RootLoader />}>
        <QueryClientProvider client={queryClient}>
          <App />
          <Analytics />
          <SpeedInsights />
        </QueryClientProvider>
      </Suspense>
    </React.StrictMode>,
  );
}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
