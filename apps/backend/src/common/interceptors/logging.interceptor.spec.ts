import { of, throwError } from 'rxjs';
import { LoggingInterceptor } from './logging.interceptor';
import { writeAppLog } from '../logging/app-logger';
import { redactSensitivePath } from '../logging/redact-path';

jest.mock('../logging/app-logger', () => ({ writeAppLog: jest.fn() }));

const mockedWriteAppLog = writeAppLog as jest.Mock;

function makeHttpContext(
  req: Record<string, unknown>,
  res: Record<string, unknown>,
) {
  return {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
    getHandler: () => ({ name: 'getOrders' }),
    getClass: () => ({ name: 'OrdersController' }),
  } as any;
}

describe('LoggingInterceptor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('logs a summary after a successful response', (done) => {
    const interceptor = new LoggingInterceptor();
    const context = makeHttpContext(
      { method: 'GET', originalUrl: '/api/v1/orders', headers: {} },
      { statusCode: 200 },
    );
    const next = { handle: () => of('ok') };

    interceptor.intercept(context, next).subscribe({
      complete: () => {
        expect(mockedWriteAppLog).toHaveBeenCalledTimes(1);
        const [level, summary, logContext, fields] =
          mockedWriteAppLog.mock.calls[0];
        expect(level).toBe('info');
        expect(logContext).toBe('HTTP');
        expect(summary).toContain('GET /api/v1/orders 200');
        expect(fields).toMatchObject({
          method: 'GET',
          path: '/api/v1/orders',
          statusCode: 200,
          handler: 'getOrders',
          controller: 'OrdersController',
        });
        done();
      },
    });
  });

  it('logs at error level when the handler throws a 500', (done) => {
    const interceptor = new LoggingInterceptor();
    const context = makeHttpContext(
      { method: 'POST', originalUrl: '/api/v1/orders', headers: {} },
      { statusCode: 200 },
    );
    const next = {
      handle: () => throwError(() => ({ status: 500 })),
    };

    interceptor.intercept(context, next).subscribe({
      error: () => {
        expect(mockedWriteAppLog).toHaveBeenCalledTimes(1);
        const [level, , , fields] = mockedWriteAppLog.mock.calls[0];
        expect(level).toBe('error');
        expect(fields.statusCode).toBe(500);
        done();
      },
    });
  });

  it('passes through non-http contexts without logging', () => {
    const interceptor = new LoggingInterceptor();
    const context = { getType: () => 'ws' } as any;
    const next = { handle: () => of('ws-message') };

    const result = interceptor.intercept(context, next);

    expect(mockedWriteAppLog).not.toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  it('includes trace headers in fields and summary', (done) => {
    const interceptor = new LoggingInterceptor();
    const context = makeHttpContext(
      {
        method: 'GET',
        originalUrl: '/api/v1/orders',
        headers: {
          'x-trace-origin': 'OrdersPage',
          'x-correlation-id': 'corr-abcdefgh',
        },
      },
      { statusCode: 200 },
    );
    const next = { handle: () => of('ok') };

    interceptor.intercept(context, next).subscribe({
      complete: () => {
        const [, summary, , fields] = mockedWriteAppLog.mock.calls[0];
        expect(fields.traceOrigin).toBe('OrdersPage');
        expect(fields.correlationId).toBe('corr-abcdefgh');
        expect(summary).toContain('[OrdersPage]');
        expect(summary).toContain('cid:corr-abc');
        done();
      },
    });
  });

  it('computes and clamps network latency from the client timestamp', (done) => {
    const interceptor = new LoggingInterceptor();
    const clientSentAt = Date.now() - 250;
    const context = makeHttpContext(
      {
        method: 'GET',
        originalUrl: '/api/v1/orders',
        headers: { 'x-request-started-at': String(clientSentAt) },
      },
      { statusCode: 200 },
    );
    const next = { handle: () => of('ok') };

    interceptor.intercept(context, next).subscribe({
      complete: () => {
        const [, summary, , fields] = mockedWriteAppLog.mock.calls[0];
        expect(fields.networkLatencyMs).toBeGreaterThanOrEqual(250);
        expect(summary).toContain('net:');
        done();
      },
    });
  });

  it('clamps clock skew to zero latency', (done) => {
    const interceptor = new LoggingInterceptor();
    const futureTimestamp = Date.now() + 60_000;
    const context = makeHttpContext(
      {
        method: 'GET',
        originalUrl: '/api/v1/orders',
        headers: { 'x-request-started-at': String(futureTimestamp) },
      },
      { statusCode: 200 },
    );
    const next = { handle: () => of('ok') };

    interceptor.intercept(context, next).subscribe({
      complete: () => {
        const [, , , fields] = mockedWriteAppLog.mock.calls[0];
        expect(fields.networkLatencyMs).toBe(0);
        done();
      },
    });
  });

  it('ignores a non-numeric client timestamp', (done) => {
    const interceptor = new LoggingInterceptor();
    const context = makeHttpContext(
      {
        method: 'GET',
        originalUrl: '/api/v1/orders',
        headers: { 'x-request-started-at': 'not-a-number' },
      },
      { statusCode: 200 },
    );
    const next = { handle: () => of('ok') };

    interceptor.intercept(context, next).subscribe({
      complete: () => {
        const [, , , fields] = mockedWriteAppLog.mock.calls[0];
        expect(fields.networkLatencyMs).toBeUndefined();
        done();
      },
    });
  });

  it('redacts session tokens from the logged path', (done) => {
    const interceptor = new LoggingInterceptor();
    const url = '/api/v1/payments/session/secret-token/bill';
    const context = makeHttpContext(
      { method: 'GET', originalUrl: url, headers: {} },
      { statusCode: 200 },
    );
    const next = { handle: () => of('ok') };

    interceptor.intercept(context, next).subscribe({
      complete: () => {
        const [, , , fields] = mockedWriteAppLog.mock.calls[0];
        expect(fields.path).toBe(redactSensitivePath(url));
        expect(fields.path).not.toContain('secret-token');
        done();
      },
    });
  });
});
