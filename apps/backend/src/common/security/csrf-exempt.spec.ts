import { CSRF_EXEMPT_PATHS, isCsrfExemptPath } from './csrf-exempt';

describe('CSRF exemptions (L-AUTH-1)', () => {
  // Pin the exact allowlist. Removing CSRF protection from a route is a
  // security decision — a diff to this array must be deliberate and reviewed,
  // so this test is intended to fail on any unreviewed addition/removal.
  it('exposes exactly the documented, reviewed exempt paths', () => {
    expect([...CSRF_EXEMPT_PATHS].sort()).toEqual(
      [
        '/api/v1/auth/google',
        '/api/v1/auth/google/callback',
        '/api/v1/auth/login',
        '/api/v1/auth/otp/send',
        '/api/v1/auth/otp/verify',
        '/api/v1/auth/register',
        '/api/v1/auth/register/verify',
        '/api/v1/client-logs',
        '/api/v1/client-logs/csp',
        '/api/v1/orders',
      ].sort(),
    );
  });

  it('never exempts provider webhooks (those use signature verification)', () => {
    for (const webhook of [
      '/api/v1/payments/webhook',
      '/api/v1/payments/epay/notify',
      '/api/v1/payments/borica/callback',
      '/api/v1/subscription/webhook',
    ]) {
      expect(CSRF_EXEMPT_PATHS).not.toContain(webhook);
    }
  });

  it('exempts only POST for an allowlisted path', () => {
    expect(isCsrfExemptPath('/api/v1/orders', 'POST')).toBe(true);
    expect(isCsrfExemptPath('/api/v1/orders', 'DELETE')).toBe(false);
    expect(isCsrfExemptPath('/api/v1/orders', 'PATCH')).toBe(false);
  });

  it('does not exempt a non-listed path', () => {
    expect(isCsrfExemptPath('/api/v1/restaurants/abc', 'POST')).toBe(false);
    expect(isCsrfExemptPath('/api/v1/payments/session/tok/close', 'POST')).toBe(
      false,
    );
  });

  it('is frozen against runtime mutation', () => {
    expect(() => {
      (CSRF_EXEMPT_PATHS as string[]).push('/api/v1/anything');
    }).toThrow();
  });

  // Public reservation booking (unauthenticated, no cookie) — dynamic segment.
  it('exempts the public reservation booking POST (one trailing segment)', () => {
    expect(
      isCsrfExemptPath('/api/v1/reservations/public/rest_123', 'POST'),
    ).toBe(true);
  });

  it('does not exempt nested reservation POST routes or non-POST', () => {
    expect(
      isCsrfExemptPath('/api/v1/reservations/public/rest_123/extra', 'POST'),
    ).toBe(false);
    expect(
      isCsrfExemptPath('/api/v1/reservations/public/rest_123', 'DELETE'),
    ).toBe(false);
    expect(isCsrfExemptPath('/api/v1/reservations/rest_123', 'POST')).toBe(
      false,
    );
  });
});
