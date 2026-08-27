// Must be imported before any other module — see main.ts's first import.
// Sentry's own instrumentation (HTTP, Prisma, etc.) only attaches to
// modules that are `require`d/imported after Sentry.init() runs.
import * as Sentry from '@sentry/nestjs';
import { scrubBreadcrumb, scrubEvent } from './common/logging/sentry-scrub';

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    // Staging deliberately runs with NODE_ENV=production so it exercises the
    // real cookie, startup, and security paths. Keep observability environment
    // separate from runtime mode or staging incidents pollute production.
    environment:
      process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    // Set by deploy.ps1 from the deployed commit. Without it every event lands
    // in one undifferentiated bucket, so a regression cannot be attributed to
    // the release that introduced it and "is this already fixed?" is unanswerable.
    // Left undefined outside a deploy rather than faked, so local noise never
    // pollutes a real release's issue set.
    release: process.env.SENTRY_RELEASE || undefined,
    // Keep this well below 1.0 in production — this app processes real
    // order/payment traffic and a live restaurant menu, tracing every
    // request would burn quota fast for little added signal.
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    // Explicit rather than relying on the default: with PII on, Sentry attaches
    // cookies and headers, which here means the auth cookie and the CSRF token.
    sendDefaultPii: false,
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  });
} else if (process.env.NODE_ENV === 'production') {
  // eslint-disable-next-line no-console
  console.warn('[Sentry] SENTRY_DSN not set — error tracking is disabled.');
}
