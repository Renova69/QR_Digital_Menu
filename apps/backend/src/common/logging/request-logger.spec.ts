import { requestLogger } from './request-logger';
import { writeAppLog } from './app-logger';
import { redactSensitivePath } from './redact-path';

jest.mock('./app-logger', () => ({ writeAppLog: jest.fn() }));

const mockedWriteAppLog = writeAppLog as jest.Mock;

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  jest.clearAllMocks();
});

function makeReq(overrides: Record<string, unknown> = {}) {
  return {
    requestId: 'req-123',
    method: 'GET',
    originalUrl: '/api/v1/orders',
    headers: { 'user-agent': 'jest' },
    ip: '10.0.0.1',
    user: { id: 'u1', role: 'OWNER', restaurantId: 'r1' },
    ...overrides,
  };
}

function makeRes(statusCode = 200) {
  const handlers: Record<string, () => void> = {};
  return {
    statusCode,
    setHeader: jest.fn(),
    on: jest.fn((event: string, handler: () => void) => {
      handlers[event] = handler;
    }),
    emit: (event: string) => handlers[event]?.(),
  };
}

describe('requestLogger', () => {
  it('echoes the request id header and calls next', () => {
    const req = makeReq();
    const res = makeRes();
    const next = jest.fn();

    requestLogger(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', 'req-123');
    expect(next).toHaveBeenCalled();
  });

  it('writes an info log with request fields on finish', () => {
    process.env.NODE_ENV = 'test';
    const req = makeReq();
    const res = makeRes(200);
    const next = jest.fn();

    requestLogger(req, res, next);
    res.emit('finish');

    expect(mockedWriteAppLog).toHaveBeenCalledTimes(1);
    const [level, message, context, fields] = mockedWriteAppLog.mock.calls[0];
    expect(level).toBe('info');
    expect(message).toBe('HTTP request');
    expect(context).toBe('HttpRequest');
    expect(fields).toMatchObject({
      requestId: 'req-123',
      method: 'GET',
      path: redactSensitivePath('/api/v1/orders'),
      statusCode: 200,
      role: 'OWNER',
      restaurantId: 'r1',
    });
    expect(fields.durationMs).toBeGreaterThanOrEqual(0);
    expect(fields.userId).toBe('u1');
    expect(fields.ip).toBe('10.0.0.1');
    expect(fields.userAgent).toBe('jest');
  });

  it('drops identity fields in production for non-error responses', () => {
    process.env.NODE_ENV = 'production';
    const req = makeReq();
    const res = makeRes(200);
    const next = jest.fn();

    requestLogger(req, res, next);
    res.emit('finish');

    const [, , , fields] = mockedWriteAppLog.mock.calls[0];
    expect(fields.userId).toBeUndefined();
    expect(fields.ip).toBeUndefined();
    expect(fields.userAgent).toBeUndefined();
  });

  it('keeps identity fields in production for error responses', () => {
    process.env.NODE_ENV = 'production';
    const req = makeReq();
    const res = makeRes(404);
    const next = jest.fn();

    requestLogger(req, res, next);
    res.emit('finish');

    const [, , , fields] = mockedWriteAppLog.mock.calls[0];
    expect(fields.userId).toBe('u1');
  });

  it('strips the query string from the logged path in production', () => {
    process.env.NODE_ENV = 'production';
    const req = makeReq({ originalUrl: '/api/v1/orders?page=2&q=x' });
    const res = makeRes(200);
    const next = jest.fn();

    requestLogger(req, res, next);
    res.emit('finish');

    const [, , , fields] = mockedWriteAppLog.mock.calls[0];
    expect(fields.path).toBe('/api/v1/orders');
  });

  it('skips health requests by default and logs them when enabled', () => {
    const req = makeReq({ originalUrl: '/api/v1/health' });
    const res = makeRes(200);
    const next = jest.fn();

    requestLogger(req, res, next);
    res.emit('finish');
    expect(mockedWriteAppLog).not.toHaveBeenCalled();

    process.env.LOG_HEALTH_REQUESTS = 'true';
    requestLogger(req, res, next);
    res.emit('finish');
    expect(mockedWriteAppLog).toHaveBeenCalledTimes(1);
  });

  it('maps 4xx to warn and 5xx to error', () => {
    const next = jest.fn();

    const res404 = makeRes(404);
    requestLogger(makeReq(), res404, next);
    res404.emit('finish');
    expect(mockedWriteAppLog.mock.calls[0][0]).toBe('warn');

    const res500 = makeRes(500);
    requestLogger(makeReq(), res500, next);
    res500.emit('finish');
    expect(mockedWriteAppLog.mock.calls[1][0]).toBe('error');
  });

  it('takes the first entry of x-forwarded-for', () => {
    const req = makeReq({
      ip: undefined,
      headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8', 'user-agent': 'jest' },
    });
    const res = makeRes(200);
    const next = jest.fn();

    requestLogger(req, res, next);
    res.emit('finish');

    const [, , , fields] = mockedWriteAppLog.mock.calls[0];
    expect(fields.ip).toBe('1.2.3.4');
  });

  it('redacts session tokens from the logged path', () => {
    const req = makeReq({
      originalUrl: '/api/v1/payments/session/secret-token/bill',
    });
    const res = makeRes(200);
    const next = jest.fn();

    requestLogger(req, res, next);
    res.emit('finish');

    const [, , , fields] = mockedWriteAppLog.mock.calls[0];
    expect(fields.path).toBe(
      redactSensitivePath('/api/v1/payments/session/secret-token/bill'),
    );
    expect(fields.path).not.toContain('secret-token');
  });
});
