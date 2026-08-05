// Must be imported before any other module — see main.ts's first import.
// Sentry's own instrumentation (HTTP, Prisma, etc.) only attaches to
// modules that are `require`d/imported after Sentry.init() runs.
import * as Sentry from '@sentry/nestjs';

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    // Keep this well below 1.0 in production — this app processes real
    // order/payment traffic and a live restaurant menu, tracing every
    // request would burn quota fast for little added signal.
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  });
} else if (process.env.NODE_ENV === 'production') {
  // eslint-disable-next-line no-console
  console.warn('[Sentry] SENTRY_DSN not set — error tracking is disabled.');
}
