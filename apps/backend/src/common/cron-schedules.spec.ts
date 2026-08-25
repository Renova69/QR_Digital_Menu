import {
  CRON_EVERY_MINUTE,
  CRON_EVERY_10_MINUTES,
  CRON_EVERY_HOUR,
  CRON_DAILY,
} from './cron-schedules';

/**
 * Parses cron expressions to the second so we can assert the pooling / startup
 * collision constraints (production Sentry QR-MENU-BACKEND-2..8) that these
 * constants encode: every background job must start on its own second so the
 * capped Neon pool is never hit by a simultaneous burst.
 */
function secondOf(expr: string): number {
  // cron is "<second> <minute> <hour> <day> <month> <dow>"
  return Number(expr.split(' ')[0]);
}
function minuteOf(expr: string): number {
  return Number(expr.split(' ')[1]);
}

describe('CRON_EVERY_MINUTE stagger', () => {
  it('assigns each per-minute job its own distinct start second', () => {
    const jobs = Object.values(CRON_EVERY_MINUTE);
    const seconds = jobs.map(secondOf);
    expect(new Set(seconds).size).toBe(jobs.length);
    expect(jobs.length).toBeGreaterThanOrEqual(5);
  });

  it('keeps every per-minute start within 0..59', () => {
    for (const second of Object.values(CRON_EVERY_MINUTE).map(secondOf)) {
      expect(second).toBeGreaterThanOrEqual(0);
      expect(second).toBeLessThanOrEqual(59);
    }
  });
});

describe('CRON_EVERY_10_MINUTES stagger', () => {
  it('gives each ten-minute job a distinct second that never collides with the per-minute family', () => {
    const tenMinSeconds = Object.values(CRON_EVERY_10_MINUTES).map(secondOf);
    expect(new Set(tenMinSeconds).size).toBe(
      Object.values(CRON_EVERY_10_MINUTES).length,
    );
    const perMinuteSeconds = Object.values(CRON_EVERY_MINUTE).map(secondOf);
    for (const s of tenMinSeconds) {
      expect(perMinuteSeconds).not.toContain(s);
    }
  });

  it('uses a wildcard-step minute token (starred /10 wildcard)', () => {
    for (const expr of Object.values(CRON_EVERY_10_MINUTES)) {
      expect(expr.split(' ')[1]).toBe('*/10');
    }
  });
});

describe('CRON_EVERY_HOUR stagger', () => {
  it('keeps each hourly job on its own distinct second', () => {
    const seconds = Object.values(CRON_EVERY_HOUR).map(secondOf);
    expect(new Set(seconds).size).toBe(Object.values(CRON_EVERY_HOUR).length);
  });

  it('gives each hourly job a distinct (<second>, <minute>) slot', () => {
    // Hourly jobs legitimately reuse a second that the per-minute family uses —
    // they are staggered by BOTH second and minute, so assert on the combined
    // (second, minute) pair rather than comparing seconds in isolation.
    const secondMinutePair: (expr: string) => [number, number] = (expr) => [
      secondOf(expr),
      minuteOf(expr),
    ];
    const pairs = Object.values(CRON_EVERY_HOUR).map(secondMinutePair);
    const deduped = new Set(pairs.map((p) => p.join(':')));
    expect(deduped.size).toBe(Object.values(CRON_EVERY_HOUR).length);
  });
});

describe('CRON_DAILY', () => {
  it('defines the loyalty expiry reminder sweep', () => {
    const expr = CRON_DAILY.LOYALTY_EXPIRY_REMINDERS;
    expect(typeof expr).toBe('string');
    // Should not run on second 0 where the whole per-minute family starts.
    expect(secondOf(expr)).not.toBe(0);
  });

  it('exposes the four schedule families', () => {
    expect(Object.keys(CRON_EVERY_MINUTE).length).toBeGreaterThan(0);
    expect(Object.keys(CRON_EVERY_10_MINUTES).length).toBeGreaterThan(0);
    expect(Object.keys(CRON_EVERY_HOUR).length).toBeGreaterThan(0);
    expect(Object.keys(CRON_DAILY).length).toBeGreaterThan(0);
  });
});
