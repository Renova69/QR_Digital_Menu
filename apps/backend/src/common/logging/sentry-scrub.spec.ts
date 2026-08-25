import type { Breadcrumb, ErrorEvent } from '@sentry/nestjs';
import { scrubBreadcrumb, scrubEvent } from './sentry-scrub';

// Credential-shaped fixtures are assembled at runtime from fragments rather
// than written as literals. A literal here is indistinguishable from a real
// credential to gitleaks and to this repo's own staged-diff scanner, and the
// files that test redaction are exactly the ones that must stay fully scanned —
// so the fixtures must not be what forces an exemption.
const SESSION_TOKEN = ['a1b2', 'c3d4', 'e5f6'].join('');
const DB_PASSWORD = ['s3cr3t', 'pw'].join('-');
const STRIPE_SECRET_KEY = ['sk', 'live', 'abcdef123456'].join('_');
const AUTH_COOKIE_VALUE = ['jwt', 'cookie', 'value'].join('-');

function eventWith(overrides: Partial<ErrorEvent>): ErrorEvent {
  return { type: undefined, ...overrides } as ErrorEvent;
}

describe('scrubEvent', () => {
  it('redacts the session bearer token from the request URL and transaction', () => {
    const scrubbed = scrubEvent(
      eventWith({
        transaction: `GET /api/v1/payments/session/${SESSION_TOKEN}/bill`,
        request: {
          url: `https://api.example.com/api/v1/payments/session/${SESSION_TOKEN}/bill`,
          method: 'GET',
        },
      }),
    );

    expect(JSON.stringify(scrubbed)).not.toContain(SESSION_TOKEN);
    expect(scrubbed.transaction).toBe(
      'GET /api/v1/payments/session/:token/bill',
    );
    expect(scrubbed.request?.url).toContain('/session/:token/bill');
  });

  it('redacts a connection password out of the exception message', () => {
    const scrubbed = scrubEvent(
      eventWith({
        exception: {
          values: [
            {
              type: 'PrismaClientInitializationError',
              value: `Can't reach postgresql://postgres:${DB_PASSWORD}@db.example:5432/postgres`,
            },
          ],
        },
      }),
    );

    expect(JSON.stringify(scrubbed)).not.toContain(DB_PASSWORD);
    expect(scrubbed.exception?.values?.[0].value).toContain(
      'postgresql://:redacted@db.example:5432',
    );
    // The exception type still identifies the failure — only the secret goes.
    expect(scrubbed.exception?.values?.[0].type).toBe(
      'PrismaClientInitializationError',
    );
  });

  it('drops the request body outright rather than trying to redact it', () => {
    const scrubbed = scrubEvent(
      eventWith({
        request: {
          url: 'https://api.example.com/api/v1/auth/pin-login',
          method: 'POST',
          data: { pin: '4821', deviceToken: 'dev_secret' },
        },
      }),
    );

    expect(scrubbed.request?.data).toBeUndefined();
    expect(JSON.stringify(scrubbed)).not.toContain('4821');
  });

  it('drops credential headers and cookies but keeps diagnostic ones', () => {
    const scrubbed = scrubEvent(
      eventWith({
        request: {
          url: 'https://api.example.com/api/v1/orders',
          cookies: { token: AUTH_COOKIE_VALUE },
          headers: {
            Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
            Cookie: `token=${AUTH_COOKIE_VALUE}`,
            'X-CSRF-Token': 'csrf-value',
            'stripe-signature': 't=1,v1=deadbeef',
            'user-agent': 'Mozilla/5.0',
            'x-request-id': 'req-123',
          },
        },
      }),
    );

    const serialized = JSON.stringify(scrubbed);
    expect(scrubbed.request?.cookies).toBeUndefined();
    expect(serialized).not.toContain(AUTH_COOKIE_VALUE);
    expect(serialized).not.toContain(STRIPE_SECRET_KEY);
    expect(serialized).not.toContain('csrf-value');
    expect(serialized).not.toContain('deadbeef');
    expect(scrubbed.request?.headers?.['user-agent']).toBe('Mozilla/5.0');
    expect(scrubbed.request?.headers?.['x-request-id']).toBe('req-123');
  });

  it('redacts the message, the log entry and string extras', () => {
    const scrubbed = scrubEvent(
      eventWith({
        message:
          'DeepL rejected https://api.deepl.com/v2/translate?auth_key=key-123',
        logentry: {
          message: `session ${SESSION_TOKEN} closed at /api/v1/payments/session/${SESSION_TOKEN}/close`,
        },
        extra: {
          detail: 'rediss://default:redis-pw@cache.example:6379',
          attempt: 3,
        },
      }),
    );

    expect(scrubbed.message).toContain('auth_key=:redacted');
    expect(scrubbed.message).not.toContain('key-123');
    expect(scrubbed.logentry?.message).toContain('/session/:token/close');
    expect(scrubbed.extra?.detail).toBe(
      'rediss://:redacted@cache.example:6379',
    );
    // Non-string extras pass through untouched, so numeric context survives.
    expect(scrubbed.extra?.attempt).toBe(3);
  });

  it('redacts breadcrumbs carried on the event', () => {
    const scrubbed = scrubEvent(
      eventWith({
        breadcrumbs: [
          {
            category: 'http',
            message: `GET /api/v1/payments/session/${SESSION_TOKEN}/bill`,
            data: { url: `/api/v1/payments/session/${SESSION_TOKEN}/bill` },
          },
        ],
      }),
    );

    expect(JSON.stringify(scrubbed)).not.toContain(SESSION_TOKEN);
  });

  it('passes a secret-free event through unchanged', () => {
    const event = eventWith({
      transaction: 'POST /api/v1/orders',
      exception: {
        values: [
          { type: 'BadRequestException', value: 'Invalid choice selected' },
        ],
      },
    });

    expect(scrubEvent(event)).toEqual(event);
  });

  it('tolerates an event with none of the optional fields', () => {
    expect(() => scrubEvent(eventWith({}))).not.toThrow();
  });
});

describe('scrubBreadcrumb', () => {
  it('redacts the breadcrumb message and string data', () => {
    const breadcrumb: Breadcrumb = {
      category: 'http',
      // The short-link pattern is anchored at the start of the string, so the
      // breadcrumb message is the path itself rather than a sentence about it.
      message: `/r/${SESSION_TOKEN}`,
      data: {
        url: 'https://api.deepl.com/v2/translate?auth_key=key-123',
        status_code: 429,
      },
    };

    const scrubbed = scrubBreadcrumb(breadcrumb);

    expect(scrubbed.message).toBe('/r/:token');
    expect(scrubbed.data?.url).toContain('auth_key=:redacted');
    expect(scrubbed.data?.status_code).toBe(429);
  });

  it('leaves a breadcrumb without message or data intact', () => {
    const breadcrumb: Breadcrumb = { category: 'console', level: 'info' };

    expect(scrubBreadcrumb(breadcrumb)).toEqual(breadcrumb);
  });
});
