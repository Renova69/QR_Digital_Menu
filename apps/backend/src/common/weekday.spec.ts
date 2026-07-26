import {
  isoToJsWeekday,
  jsToIsoWeekday,
  HHMM_PATTERN,
  CATEGORY_WEEKDAY_MIN,
  CATEGORY_WEEKDAY_MAX,
  HAPPY_HOUR_WEEKDAY_MIN,
  HAPPY_HOUR_WEEKDAY_MAX,
} from './weekday';

describe('weekday', () => {
  it('defines correct category weekday range', () => {
    expect(CATEGORY_WEEKDAY_MIN).toBe(0);
    expect(CATEGORY_WEEKDAY_MAX).toBe(6);
  });

  it('defines correct happy hour weekday range', () => {
    expect(HAPPY_HOUR_WEEKDAY_MIN).toBe(1);
    expect(HAPPY_HOUR_WEEKDAY_MAX).toBe(7);
  });

  describe('isoToJsWeekday', () => {
    it.each([
      [1, 1], // Mon → 1 (JS getDay)
      [2, 2], // Tue → 2
      [7, 0], // Sun → 0
    ])('converts ISO %i to JS %i', (iso, js) => {
      expect(isoToJsWeekday(iso)).toBe(js);
    });
  });

  describe('jsToIsoWeekday', () => {
    it.each([
      [1, 1], // Mon → 1
      [6, 6], // Sat → 6
      [0, 7], // Sun → 7
    ])('converts JS %i to ISO %i', (js, iso) => {
      expect(jsToIsoWeekday(js)).toBe(iso);
    });
  });

  describe('HHMM_PATTERN', () => {
    it.each(['00:00', '12:30', '23:59', '08:00', '19:45', '09:05'])(
      'matches %s',
      (t) => {
        expect(HHMM_PATTERN.test(t)).toBe(true);
      },
    );

    it.each(['24:00', '12:60', '8:00', '25:00', '12:3', '', 'abc', '12-30'])(
      'rejects %s',
      (t) => {
        expect(HHMM_PATTERN.test(t)).toBe(false);
      },
    );
  });
});
