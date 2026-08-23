import { AppLogger, safeLogValue, writeAppLog } from './app-logger';

const originalEnv = { ...process.env };

function resetLogEnv() {
  delete process.env.LOG_FORMAT;
  delete process.env.K_SERVICE;
  process.env.NODE_ENV = 'test';
}

describe('safeLogValue', () => {
  it('passes primitives through unchanged', () => {
    expect(safeLogValue(null)).toBeNull();
    expect(safeLogValue(undefined)).toBeUndefined();
    expect(safeLogValue(42)).toBe(42);
    expect(safeLogValue(true)).toBe(true);
  });

  it('converts bigint to string', () => {
    expect(safeLogValue(123n)).toBe('123');
  });

  it('converts dates to ISO strings', () => {
    const date = new Date('2026-08-22T10:00:00.000Z');
    expect(safeLogValue(date)).toBe('2026-08-22T10:00:00.000Z');
  });

  it('truncates long strings', () => {
    const long = 'x'.repeat(5000);
    const result = safeLogValue(long) as string;
    expect(result.endsWith('...[truncated]')).toBe(true);
    expect(result.length).toBeLessThan(4100);
    expect(safeLogValue('short')).toBe('short');
  });

  it('sanitizes errors into name/message/stack', () => {
    const error = new Error('boom');
    const result = safeLogValue(error) as Record<string, unknown>;
    expect(result.name).toBe('Error');
    expect(result.message).toBe('boom');
    expect(typeof result.stack).toBe('string');
  });

  it('caps arrays at 20 items', () => {
    const result = safeLogValue(
      Array.from({ length: 25 }, (_, i) => i),
    ) as number[];
    expect(result.length).toBe(20);
    expect(result[19]).toBe(19);
  });

  it('caps objects at 30 keys', () => {
    const object: Record<string, number> = {};
    for (let i = 0; i < 40; i += 1) object[`key${i}`] = i;
    const result = safeLogValue(object) as Record<string, unknown>;
    expect(Object.keys(result).length).toBe(30);
  });

  it('filters sensitive keys case-insensitively', () => {
    const result = safeLogValue({
      password: 'p',
      accessToken: 't',
      clientSecret: 's',
      Cookie: 'c',
      authorization: 'a',
      privateKey: 'k',
      p_sign: 'sig',
      safe: 'kept',
    }) as Record<string, unknown>;
    expect(result).toEqual({ safe: 'kept' });
  });

  it('filters sensitive keys in nested objects', () => {
    const result = safeLogValue({
      meta: { user: { password: 'p', name: 'n' } },
    }) as Record<string, { user: Record<string, unknown> }>;
    expect(result.meta.user).toEqual({ name: 'n' });
  });

  it('returns a marker beyond max depth', () => {
    const deep = { a: { b: { c: { d: 'hidden' } } } };
    const result = safeLogValue(deep) as {
      a: { b: { c: unknown } };
    };
    expect(result.a.b.c).toBe('[max-depth]');
  });

  it('stringifies unknown value kinds', () => {
    expect(safeLogValue(Symbol('s'))).toBe('Symbol(s)');
  });
});

describe('writeAppLog', () => {
  beforeEach(resetLogEnv);
  afterAll(() => {
    process.env = originalEnv;
  });

  it('emits a JSON line in json mode with the right severity', () => {
    process.env.LOG_FORMAT = 'json';
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    writeAppLog('info', 'hello', 'Ctx', { answer: 42 });
    writeAppLog('warn', 'careful');
    writeAppLog('error', 'broken');

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);

    const entry = JSON.parse(logSpy.mock.calls[0][0]);
    expect(entry).toMatchObject({
      severity: 'INFO',
      level: 'info',
      message: 'hello',
      context: 'Ctx',
      answer: 42,
    });
    expect(new Date(entry.timestamp).getTime()).not.toBeNaN();

    const warnEntry = JSON.parse(warnSpy.mock.calls[0][0]);
    expect(warnEntry.severity).toBe('WARNING');
    const errorEntry = JSON.parse(errorSpy.mock.calls[0][0]);
    expect(errorEntry.severity).toBe('ERROR');

    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('uses plain-text format outside json mode with context and fields', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    writeAppLog('info', 'hello', 'Ctx', { answer: 42 });

    const line = logSpy.mock.calls[0][0];
    expect(line).toContain('[Ctx]');
    expect(line).toContain('hello');
    expect(line).toContain(JSON.stringify({ answer: 42 }));
    expect(line).toMatch(/^\[\d{4}-\d{2}-\d{2}T/);

    logSpy.mockRestore();
  });

  it('routes error and warn levels to their console sinks in plain mode', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    writeAppLog('error', 'broken');
    writeAppLog('warn', 'careful');
    writeAppLog('debug', 'detail');

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledTimes(1);

    errorSpy.mockRestore();
    warnSpy.mockRestore();
    logSpy.mockRestore();
  });
});

describe('AppLogger', () => {
  beforeEach(resetLogEnv);
  afterAll(() => {
    process.env = originalEnv;
  });

  it('logs messages at the info level', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const logger = new AppLogger();

    logger.log('hello', 'Ctx');

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toContain('hello');
    expect(logSpy.mock.calls[0][0]).toContain('[Ctx]');
    logSpy.mockRestore();
  });

  it('captures error stack traces into the structured fields', () => {
    process.env.LOG_FORMAT = 'json';
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const logger = new AppLogger();

    logger.error('broken', new Error('details'));

    const entry = JSON.parse(errorSpy.mock.calls[0][0]);
    expect(entry.severity).toBe('ERROR');
    expect(entry.stack).toContain('details');
    expect(entry.details[0].message).toBe('details');
    errorSpy.mockRestore();
  });

  it('routes verbose to debug and warn to warning', () => {
    process.env.LOG_FORMAT = 'json';
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const logger = new AppLogger();

    logger.verbose('trace-ish');
    logger.debug('trace');
    logger.warn('careful');

    expect(JSON.parse(logSpy.mock.calls[0][0]).severity).toBe('DEBUG');
    expect(JSON.parse(logSpy.mock.calls[1][0]).severity).toBe('DEBUG');
    expect(JSON.parse(warnSpy.mock.calls[0][0]).severity).toBe('WARNING');
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
