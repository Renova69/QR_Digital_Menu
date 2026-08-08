import { SentryCron } from '@sentry/nestjs';

/**
 * Sentry's own `MonitorConfig` lives in `@sentry/core`, which this app only has
 * as a transitive dependency. Deriving it from the public `SentryCron`
 * signature keeps us on the supported surface.
 */
type MonitorConfig = NonNullable<Parameters<typeof SentryCron>[1]>;

export type CronMonitorOptions = {
  /**
   * Minutes the job may overrun before Sentry calls the run failed. Set it
   * above the job's realistic worst case, not its typical case.
   */
  maxRuntimeMinutes: number;
  /** Minutes late a check-in may be before it counts as missed. */
  checkinMarginMinutes: number;
  /** Consecutive missed/failed runs before Sentry opens an issue. */
  failureIssueThreshold: number;
};

/**
 * Strip the leading seconds field from a @nestjs/schedule expression.
 *
 * Our cron expressions are the 6-field form so jobs can be staggered within
 * the minute (see cron-schedules.ts). Sentry monitors take standard 5-field
 * crontab. Handing Sentry the 6-field string shifts every field by one
 * position — '30 * * * * *' would be read as "minute 30 of every hour" — and
 * the monitor then reports a missed check-in on almost every run.
 */
export function toSentryCrontab(nestCronExpression: string): string {
  const fields = nestCronExpression.trim().split(/\s+/);
  return fields.length === 6 ? fields.slice(1).join(' ') : nestCronExpression;
}

/**
 * Build a Sentry monitor config from the same expression the job is scheduled
 * with, so the two cannot drift. Always pass the `CRON_*` constant itself —
 * never a hand-copied schedule string.
 *
 * Why these monitors exist: every scheduled job here runs with
 * `waitForCompletion: true`, which makes @nestjs/schedule skip a tick while
 * the previous run is still going. That is what stops the pile-up, but it also
 * means a job that *hangs* rather than throws will silently never run again —
 * no error, no log, nothing in Sentry. A missed check-in is the only signal
 * that failure mode produces.
 */
export function cronMonitor(
  nestCronExpression: string,
  options: CronMonitorOptions,
): MonitorConfig {
  return {
    schedule: { type: 'crontab', value: toSentryCrontab(nestCronExpression) },
    maxRuntime: options.maxRuntimeMinutes,
    checkinMargin: options.checkinMarginMinutes,
    failureIssueThreshold: options.failureIssueThreshold,
    recoveryThreshold: 1,
    // @Cron evaluates in the container's local zone. Nothing in the app pins
    // TZ, but the Cloud Run image is UTC (confirmed via the `culture.timezone`
    // context on production Sentry events), so UTC is what these expressions
    // actually run on. If TZ is ever set on the service, change this to match
    // or every monitor will report check-ins at the wrong time.
    timezone: 'UTC',
  };
}
