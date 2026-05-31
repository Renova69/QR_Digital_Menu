import { describe, it, expect } from 'vitest';
import { parseTimeToMinutes, isHappyHourActive } from '../happyHour';

describe('parseTimeToMinutes', () => {
  it('parses HH:MM to minutes', () => {
    expect(parseTimeToMinutes('00:00')).toBe(0);
    expect(parseTimeToMinutes('09:30')).toBe(570);
    expect(parseTimeToMinutes('23:59')).toBe(1439);
  });

  it('returns null for invalid input', () => {
    expect(parseTimeToMinutes(undefined)).toBeNull();
    expect(parseTimeToMinutes('9:5')).toBeNull();
    expect(parseTimeToMinutes('24:00')).toBeNull();
    expect(parseTimeToMinutes('12:60')).toBeNull();
    expect(parseTimeToMinutes('abc')).toBeNull();
  });
});

describe('isHappyHourActive', () => {
  const base = {
    happyHourEnable: true,
    timezone: 'UTC',
    happyHourDays: [1, 2, 3, 4, 5, 6, 7],
  };

  it('returns false when disabled or misconfigured', () => {
    expect(isHappyHourActive(null)).toBe(false);
    expect(isHappyHourActive({ ...base, happyHourEnable: false, happyHourStartTime: '10:00', happyHourEndTime: '12:00' })).toBe(false);
    expect(isHappyHourActive({ ...base, happyHourStartTime: 'bad', happyHourEndTime: '12:00' })).toBe(false);
    expect(isHappyHourActive({ ...base, happyHourDays: [], happyHourStartTime: '10:00', happyHourEndTime: '12:00' })).toBe(false);
  });

  it('matches a normal same-day window', () => {
    // 2026-01-07 is a Wednesday (ISO weekday 3); 11:00 UTC inside 10:00-12:00.
    const now = new Date('2026-01-07T11:00:00Z');
    expect(isHappyHourActive({ ...base, happyHourStartTime: '10:00', happyHourEndTime: '12:00' }, now)).toBe(true);
    expect(isHappyHourActive({ ...base, happyHourStartTime: '12:30', happyHourEndTime: '14:00' }, now)).toBe(false);
  });

  it('respects active-day filtering for same-day windows', () => {
    const now = new Date('2026-01-07T11:00:00Z'); // Wednesday = 3
    expect(isHappyHourActive({ ...base, happyHourDays: [3], happyHourStartTime: '10:00', happyHourEndTime: '12:00' }, now)).toBe(true);
    expect(isHappyHourActive({ ...base, happyHourDays: [4], happyHourStartTime: '10:00', happyHourEndTime: '12:00' }, now)).toBe(false);
  });

  it('attributes an overnight window to the START day (mirrors backend L4)', () => {
    // 2026-01-10 is a Saturday; 01:00 UTC falls in a Fri->Sat 22:00-02:00 window,
    // which is FRIDAY's happy hour.
    const sat0100 = new Date('2026-01-10T01:00:00Z');
    const cfg = { ...base, happyHourStartTime: '22:00', happyHourEndTime: '02:00' };

    // Friday (5) active -> matches.
    expect(isHappyHourActive({ ...cfg, happyHourDays: [5] }, sat0100)).toBe(true);
    // Only Saturday (6) active -> must NOT match (it's the previous day's window).
    expect(isHappyHourActive({ ...cfg, happyHourDays: [6] }, sat0100)).toBe(false);
  });

  it('matches the evening side of an overnight window on the start day', () => {
    // 2026-01-09 is a Friday; 23:00 is inside Fri 22:00-02:00 -> Friday's window.
    const fri2300 = new Date('2026-01-09T23:00:00Z');
    const cfg = { ...base, happyHourStartTime: '22:00', happyHourEndTime: '02:00' };
    expect(isHappyHourActive({ ...cfg, happyHourDays: [5] }, fri2300)).toBe(true);
    expect(isHappyHourActive({ ...cfg, happyHourDays: [6] }, fri2300)).toBe(false);
  });
});
