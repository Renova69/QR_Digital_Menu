import { redactSensitivePath } from './redact-path';

describe('redactSensitivePath (M-PAY-1)', () => {
  const SECRET = 'cmabc123secret';

  it.each([
    `/api/v1/payments/session/${SECRET}/bill`,
    `/api/v1/payments/session/${SECRET}/bill?lang=bg`,
    `/api/v1/payments/session/${SECRET}/intent`,
    `/api/v1/payments/session/${SECRET}/checkout`,
    `/api/v1/payments/session/${SECRET}/cash-request`,
    `/api/v1/payments/session/${SECRET}/abandon`,
    `/api/v1/payments/session/${SECRET}/close`,
    `/api/v1/payments/session/${SECRET}/close-card`,
    `/api/v1/payments/session/${SECRET}/close-cash`,
    `/api/v1/payments/session/${SECRET}/settle-partial`,
  ])('redacts the session token in %s', (path) => {
    const result = redactSensitivePath(path);
    expect(result).not.toContain(SECRET);
    expect(result).toContain('/session/:token/');
  });

  it('preserves the trailing action and query string', () => {
    expect(
      redactSensitivePath(`/api/v1/payments/session/${SECRET}/bill?lang=bg`),
    ).toBe('/api/v1/payments/session/:token/bill?lang=bg');
  });

  it('leaves the static force-open route untouched', () => {
    expect(redactSensitivePath('/api/v1/payments/session/force-open')).toBe(
      '/api/v1/payments/session/force-open',
    );
  });

  it('leaves the session create route untouched', () => {
    expect(redactSensitivePath('/api/v1/payments/session')).toBe(
      '/api/v1/payments/session',
    );
  });

  it('leaves unrelated paths untouched', () => {
    expect(redactSensitivePath('/api/v1/health')).toBe('/api/v1/health');
    expect(redactSensitivePath('/api/v1/menu/public/abc?lang=en')).toBe(
      '/api/v1/menu/public/abc?lang=en',
    );
  });

  // Feature 2: reservation guest self-service manage token is a bearer credential
  // in the path — redact it exactly like the payment session token.
  it.each([
    `/api/v1/reservations/public/rest_1/manage/${SECRET}`,
    `/api/v1/reservations/public/rest_1/manage/${SECRET}/cancel`,
    `/api/v1/reservations/public/rest_1/manage/${SECRET}/modify`,
  ])('redacts the reservation manage token in %s', (path) => {
    const result = redactSensitivePath(path);
    expect(result).not.toContain(SECRET);
    expect(result).toContain('/manage/:token');
  });

  it('preserves the manage action segment while redacting the token', () => {
    expect(
      redactSensitivePath(
        `/api/v1/reservations/public/rest_1/manage/${SECRET}/cancel`,
      ),
    ).toBe('/api/v1/reservations/public/rest_1/manage/:token/cancel');
  });

  it('handles non-string / empty input safely', () => {
    expect(redactSensitivePath(undefined)).toBe('');
    expect(redactSensitivePath(null)).toBe('');
    expect(redactSensitivePath('')).toBe('');
  });
});
