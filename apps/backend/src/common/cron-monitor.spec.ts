import { cronMonitor, toSentryCrontab } from './cron-monitor';
import { CRON_EVERY_10_MINUTES, CRON_EVERY_MINUTE } from './cron-schedules';

describe('toSentryCrontab', () => {
  it('drops the seconds field from a 6-field @nestjs/schedule expression', () => {
    expect(toSentryCrontab('30 * * * * *')).toBe('* * * * *');
    expect(toSentryCrontab('15 */10 * * * *')).toBe('*/10 * * * *');
  });

  it('leaves a standard 5-field crontab untouched', () => {
    expect(toSentryCrontab('*/1 * * * *')).toBe('*/1 * * * *');
    expect(toSentryCrontab('0 3 * * *')).toBe('0 3 * * *');
  });

  it('tolerates padded and irregular whitespace', () => {
    expect(toSentryCrontab('  20   *  * * *  * ')).toBe('* * * * *');
  });

  // The whole point of the helper: a 6-field string handed to Sentry verbatim
  // reads '30 * * * * *' as "minute 30 of every hour", so a job that actually
  // runs 60x/hour would be marked missed on 59 of them.
  it.each(Object.values(CRON_EVERY_MINUTE))(
    'maps every-minute slot %s to a once-per-minute Sentry schedule',
    (expression) => {
      expect(toSentryCrontab(expression)).toBe('* * * * *');
    },
  );

  it.each(Object.values(CRON_EVERY_10_MINUTES))(
    'maps ten-minute slot %s to a once-per-ten-minutes Sentry schedule',
    (expression) => {
      expect(toSentryCrontab(expression)).toBe('*/10 * * * *');
    },
  );
});

describe('cronMonitor', () => {
  it('builds a crontab monitor config from the scheduling expression', () => {
    expect(
      cronMonitor(CRON_EVERY_10_MINUTES.STRIPE_RECONCILE_PENDING_PAYMENTS, {
        maxRuntimeMinutes: 8,
        checkinMarginMinutes: 3,
        failureIssueThreshold: 2,
      }),
    ).toEqual({
      schedule: { type: 'crontab', value: '*/10 * * * *' },
      maxRuntime: 8,
      checkinMargin: 3,
      failureIssueThreshold: 2,
      recoveryThreshold: 1,
      timezone: 'UTC',
    });
  });
});
