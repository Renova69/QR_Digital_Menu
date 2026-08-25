jest.mock('@sentry/nestjs', () => ({ init: jest.fn() }));

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  jest.resetModules();
});

describe('instrument', () => {
  it('initializes Sentry with a dev sample rate when SENTRY_DSN is set', () => {
    process.env.SENTRY_DSN = 'https://dsn.example';
    process.env.NODE_ENV = 'test';
    const Sentry = require('@sentry/nestjs');

    require('./instrument');

    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: 'https://dsn.example',
        environment: 'test',
        tracesSampleRate: 1.0,
      }),
    );
  });

  it('uses the 0.1 sample rate in production', () => {
    process.env.SENTRY_DSN = 'https://dsn.example';
    process.env.NODE_ENV = 'production';
    const Sentry = require('@sentry/nestjs');

    require('./instrument');

    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({ tracesSampleRate: 0.1 }),
    );
  });

  it('warns in production when SENTRY_DSN is missing', () => {
    delete process.env.SENTRY_DSN;
    process.env.NODE_ENV = 'production';
    const Sentry = require('@sentry/nestjs');
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    require('./instrument');

    expect(Sentry.init).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      '[Sentry] SENTRY_DSN not set — error tracking is disabled.',
    );
    warnSpy.mockRestore();
  });

  it('stays silent in development without a DSN', () => {
    delete process.env.SENTRY_DSN;
    process.env.NODE_ENV = 'development';
    const Sentry = require('@sentry/nestjs');
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    require('./instrument');

    expect(Sentry.init).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
  it('tags events with the deployed commit when SENTRY_RELEASE is set', () => {
    process.env.SENTRY_DSN = 'https://dsn.example';
    process.env.SENTRY_RELEASE = 'abc123def456';
    const Sentry = require('@sentry/nestjs');

    require('./instrument');

    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({ release: 'abc123def456' }),
    );
  });

  it('leaves the release undefined outside a deploy', () => {
    process.env.SENTRY_DSN = 'https://dsn.example';
    delete process.env.SENTRY_RELEASE;
    const Sentry = require('@sentry/nestjs');

    require('./instrument');

    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({ release: undefined }),
    );
  });

  it('scrubs events and breadcrumbs, and never sends default PII', () => {
    process.env.SENTRY_DSN = 'https://dsn.example';
    const Sentry = require('@sentry/nestjs');
    const {
      scrubBreadcrumb,
      scrubEvent,
    } = require('./common/logging/sentry-scrub');

    require('./instrument');

    // Wired by reference: the scrubbing behaviour itself is pinned in
    // sentry-scrub.spec.ts, so this only proves the hooks are actually attached
    // — the failure mode that would silently ship every secret to Sentry.
    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        sendDefaultPii: false,
        beforeSend: scrubEvent,
        beforeBreadcrumb: scrubBreadcrumb,
      }),
    );
  });
});
