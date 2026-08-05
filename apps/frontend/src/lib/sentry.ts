import * as Sentry from "@sentry/react";

/**
 * Error tracking is disabled entirely when VITE_SENTRY_DSN is unset — safe
 * default for local dev and any preview environment that hasn't been given
 * a DSN. Call this before rendering the app (see index.tsx) so Sentry's
 * fetch/XHR instrumentation attaches before the first real network call.
 */
export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    integrations: [Sentry.browserTracingIntegration()],
    // Keep this well below 1.0 in production — this traces real customer
    // checkout/menu traffic, not just staff dashboard sessions.
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
  });
}
