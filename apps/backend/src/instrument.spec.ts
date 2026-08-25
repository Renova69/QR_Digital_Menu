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
});
