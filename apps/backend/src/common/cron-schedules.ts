/**
 * Staggered schedules for the recurring background jobs.
 *
 * `CronExpression.EVERY_MINUTE` and `EVERY_10_MINUTES` both fire on second 0,
 * so every background job in the app used to start in the same tick. Each job
 * holds one or more Prisma connections, the Neon pool is capped at
 * `connection_limit=10`, and the jobs then queued behind each other: observed
 * in production as `prisma:client:operation` spans at p95 12.8s / max 28.7s,
 * "Timed out fetching a new connection from the connection pool" across five
 * different crons in one burst, and a 5s interactive-transaction budget blown
 * by a two-statement transaction (Sentry QR-MENU-BACKEND-2/3/4/5/6/7/8).
 *
 * Giving each job its own second keeps them from contending on startup. The
 * per-minute slots take 0/10/20/30/40 and the ten-minute slots take 5/15/25/35
 * so the two families never land on the same second either.
 *
 * Staggering alone is not enough for a job that can outrun its own interval —
 * those must also set `waitForCompletion: true` so @nestjs/schedule skips a
 * tick rather than running two copies concurrently.
 */
export const CRON_EVERY_MINUTE = {
  MENU_TRANSLATION_WORKER: '0 * * * * *',
  PRINT_RECONCILE_MISSING_JOBS: '10 * * * * *',
  PRINT_RETRY_STUCK_JOBS: '20 * * * * *',
  NOTIFICATION_DRAIN_DUE: '30 * * * * *',
  TABLES_AUTO_CLOSE_PAID: '40 * * * * *',
} as const;

export const CRON_EVERY_10_MINUTES = {
  MENU_TRANSLATION_STUCK_RESET: '5 */10 * * * *',
  STRIPE_RECONCILE_PENDING_REFUNDS: '15 */10 * * * *',
  STRIPE_RECONCILE_PENDING_PAYMENTS: '25 */10 * * * *',
  BORICA_PAYMENT_RECONCILIATION: '35 */10 * * * *',
} as const;
