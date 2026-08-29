import { DateTime } from 'luxon';
import { isPinLoginAllowed } from './pin-login-hours';

const atUtc = (iso: string) => DateTime.fromISO(iso, { zone: 'utc' });

describe('isPinLoginAllowed', () => {
  it('keeps existing restaurants unrestricted when both times are absent', () => {
    expect(
      isPinLoginAllowed(
        { timezone: 'Europe/Sofia', startTime: null, endTime: null },
        atUtc('2026-08-29T02:00:00Z'),
      ),
    ).toBe(true);
  });

  it('uses the restaurant timezone and includes the start boundary', () => {
    expect(
      isPinLoginAllowed(
        { timezone: 'Europe/Sofia', startTime: '11:00', endTime: '23:00' },
        atUtc('2026-08-29T08:00:00Z'),
      ),
    ).toBe(true);
  });

  it('excludes the end boundary', () => {
    expect(
      isPinLoginAllowed(
        { timezone: 'Europe/Sofia', startTime: '11:00', endTime: '23:00' },
        atUtc('2026-08-29T20:00:00Z'),
      ),
    ).toBe(false);
  });

  it('supports overnight windows', () => {
    const hours = {
      timezone: 'Europe/Sofia',
      startTime: '18:00',
      endTime: '02:00',
    };
    expect(isPinLoginAllowed(hours, atUtc('2026-08-29T20:30:00Z'))).toBe(true);
    expect(isPinLoginAllowed(hours, atUtc('2026-08-29T22:30:00Z'))).toBe(true);
    expect(isPinLoginAllowed(hours, atUtc('2026-08-29T12:00:00Z'))).toBe(false);
  });

  it('fails closed for partial, equal, or invalid-zone configuration', () => {
    const now = atUtc('2026-08-29T12:00:00Z');
    expect(
      isPinLoginAllowed(
        { timezone: 'Europe/Sofia', startTime: '11:00', endTime: null },
        now,
      ),
    ).toBe(false);
    expect(
      isPinLoginAllowed(
        { timezone: 'Europe/Sofia', startTime: '11:00', endTime: '11:00' },
        now,
      ),
    ).toBe(false);
    expect(
      isPinLoginAllowed(
        { timezone: 'Not/A_Zone', startTime: '11:00', endTime: '23:00' },
        now,
      ),
    ).toBe(false);
  });
});
