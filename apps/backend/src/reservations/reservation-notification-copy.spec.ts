import {
  getReservationNotificationCopy,
  getReservationDetailLabels,
  getReservationSmsStatus,
  normalizeReservationNotificationLocale,
} from './reservation-notification-copy';

describe('normalizeReservationNotificationLocale', () => {
  it('returns en for null/empty/unknown locale', () => {
    expect(normalizeReservationNotificationLocale(null)).toBe('en');
    expect(normalizeReservationNotificationLocale('')).toBe('en');
    expect(normalizeReservationNotificationLocale('xx')).toBe('en');
  });

  it.each([
    'en',
    'bg',
    'de',
    'es',
    'fr',
    'it',
    'ro',
    'zh',
    'el',
    'ja',
    'ru',
    'ar',
  ])('normalizes %s correctly', (locale) => {
    expect(normalizeReservationNotificationLocale(locale)).toBe(locale);
  });

  it('handles locale with region suffix', () => {
    expect(normalizeReservationNotificationLocale('en-US')).toBe('en');
    expect(normalizeReservationNotificationLocale('fr_FR')).toBe('fr');
    expect(normalizeReservationNotificationLocale('zh-CN')).toBe('zh');
  });
});

describe('getReservationNotificationCopy', () => {
  it('returns English copy for English locale', () => {
    const copy = getReservationNotificationCopy('en');
    expect(copy.subjects.CONFIRMED).toContain('Reservation confirmed');
    expect(copy.reference).toBe('Reference');
  });

  it('returns Bulgarian copy for bg locale', () => {
    const copy = getReservationNotificationCopy('bg');
    expect(copy.subjects.CONFIRMED).toContain('Резервацията е потвърдена');
    expect(copy.reference).toBe('Референтен номер');
  });
});

describe('getReservationDetailLabels', () => {
  it('returns labels for supported locale', () => {
    const labels = getReservationDetailLabels('en');
    expect(labels.guests).toBe('Guests');
    expect(labels.occasions.BIRTHDAY).toBe('Birthday');
  });

  it('falls back to en for unsupported locale', () => {
    const labels = getReservationDetailLabels('xx');
    expect(labels.guests).toBe('Guests');
  });
});

describe('getReservationSmsStatus', () => {
  it('returns short SMS status for English', () => {
    expect(getReservationSmsStatus('en', 'CONFIRMED')).toBe(
      'Booking confirmed',
    );
  });

  it('returns Bulgarian SMS status', () => {
    expect(getReservationSmsStatus('bg', 'RECEIVED')).toBe(
      'Заявка за резервация получена',
    );
  });
});
