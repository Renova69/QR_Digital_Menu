import { writeAppLog } from '../common/logging/app-logger';
import { ClientLogsController } from './client-logs.controller';

jest.mock('../common/logging/app-logger', () => ({
  writeAppLog: jest.fn(),
}));

describe('ClientLogsController CSP reporting (M-AUTH-3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('accepts a browser CSP report and logs only bounded redacted fields', () => {
    const controller = new ClientLogsController();

    controller.collectCsp(
      {
        'csp-report': {
          'document-uri':
            'https://app.example/api/v1/payments/session/cm-secret/bill?lang=bg',
          'blocked-uri': 'https://evil.example/script.js?credential=secret',
          'effective-directive': 'script-src-elem',
          'violated-directive': "script-src 'self'",
          disposition: 'enforce',
          'status-code': 200,
          'line-number': 12,
          'column-number': 4,
        },
      },
      { requestId: 'req-1', headers: { 'user-agent': 'Browser/1' } },
    );

    expect(writeAppLog).toHaveBeenCalledWith(
      'warn',
      'CSP violation: script-src-elem',
      'CspReport',
      expect.objectContaining({
        requestId: 'req-1',
        documentUrl: 'https://app.example/api/v1/payments/session/:token/bill',
        blockedUrl: 'https://evil.example/script.js',
        effectiveDirective: 'script-src-elem',
        disposition: 'enforce',
        statusCode: 200,
        lineNumber: 12,
        columnNumber: 4,
      }),
    );
  });

  it('handles the array envelope shape', () => {
    const controller = new ClientLogsController();

    controller.collectCsp(
      [{ 'csp-report': { 'effective-directive': 'img-src' } }],
      {},
    );

    expect(writeAppLog).toHaveBeenCalledWith(
      'warn',
      'CSP violation: img-src',
      'CspReport',
      expect.anything(),
    );
  });

  it('falls back to alternative field names', () => {
    const controller = new ClientLogsController();

    controller.collectCsp(
      {
        effectiveDirective: 'connect-src',
        blockedURL: 'https://bad.example.com',
        documentURL: 'https://app.example.com',
      },
      {},
    );

    const [, message, , fields] = (writeAppLog as jest.Mock).mock.calls[0];
    expect(message).toBe('CSP violation: connect-src');
    expect(fields.blockedUrl).toBe('https://bad.example.com/');
    expect(fields.documentUrl).toBe('https://app.example.com/');
  });

  it('uses violated-directive when no effective directive is present', () => {
    const controller = new ClientLogsController();

    controller.collectCsp(
      { 'csp-report': { 'violated-directive': 'font-src' } },
      {},
    );

    expect((writeAppLog as jest.Mock).mock.calls[0][1]).toBe(
      'CSP violation: font-src',
    );
  });

  it('defaults to unknown-directive for empty reports', () => {
    const controller = new ClientLogsController();

    controller.collectCsp({}, {});

    expect((writeAppLog as jest.Mock).mock.calls[0][1]).toBe(
      'CSP violation: unknown-directive',
    );
  });
});

describe('ClientLogsController client error collection', () => {
  let controller: ClientLogsController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new ClientLogsController();
  });

  it('writes an info log with sanitized fields', () => {
    const req = { requestId: 'req-1', headers: {} };
    const body = {
      level: 'info',
      type: 'api_error',
      message: 'boom',
      clientSessionId: 'sess-1',
      url: 'https://app.example.com/api/v1/orders?x=1',
      path: '/api/v1/orders',
      stack: 'at x',
      context: { restaurantId: 'r1', meta: { attempt: 1 } },
    };

    const result = controller.collect(body, req);

    expect(result).toEqual({ ok: true, requestId: 'req-1' });
    expect(writeAppLog).toHaveBeenCalledTimes(1);
    const [level, message, logContext, fields] = (writeAppLog as jest.Mock).mock
      .calls[0];
    expect(level).toBe('info');
    expect(logContext).toBe('ClientLog');
    expect(message).toBe('Client api_error: boom');
    expect(fields).toMatchObject({
      requestId: 'req-1',
      clientSessionId: 'sess-1',
      eventType: 'api_error',
      path: '/api/v1/orders',
    });
    expect(fields.url).toBe('https://app.example.com/api/v1/orders');
    expect(fields.clientContext).toEqual({
      restaurantId: 'r1',
      meta: { attempt: 1 },
    });
  });

  it('defaults the level, type and message for missing fields', () => {
    const result = controller.collect({}, { requestId: undefined } as any);

    const [level, message, , fields] = (writeAppLog as jest.Mock).mock.calls[0];
    expect(level).toBe('error');
    expect(message).toBe('Client client_error: Client error');
    expect(fields.eventType).toBe('client_error');
    expect(result).toEqual({ ok: true, requestId: undefined });
  });

  it('maps unknown levels to error', () => {
    controller.collect({ level: 'verbose' }, {});

    expect((writeAppLog as jest.Mock).mock.calls[0][0]).toBe('error');
  });

  it('strips sensitive keys from the client context', () => {
    controller.collect(
      {
        context: {
          password: 'p',
          accessToken: 't',
          card: '4242',
          cvv: '123',
          accountNumber: 'x',
          apiKey: 'k',
          safe: 'kept',
        },
      },
      {},
    );

    const [, , , fields] = (writeAppLog as jest.Mock).mock.calls[0];
    expect(fields.clientContext).toEqual({ safe: 'kept' });
  });

  it('strips control characters from strings to prevent log injection', () => {
    controller.collect({ message: 'line1\nline2\r\n[forged]' }, {});

    const [, message] = (writeAppLog as jest.Mock).mock.calls[0];
    expect(message).not.toContain('\n');
    expect(message).toContain('line1 line2');
  });

  it('truncates long messages with a marker', () => {
    controller.collect({ message: 'x'.repeat(2_000) }, {});

    const [, message] = (writeAppLog as jest.Mock).mock.calls[0];
    expect(message.endsWith('...[truncated]')).toBe(true);
  });

  it('caps nested context at two levels', () => {
    controller.collect(
      {
        context: {
          a: { b: { c: { d: 'deep' } } },
          flat: 'ok',
        },
      },
      {},
    );

    const [, , , fields] = (writeAppLog as jest.Mock).mock.calls[0];
    expect(fields.clientContext.a.b.c).toBeUndefined();
    expect(fields.clientContext.flat).toBe('ok');
  });

  it('redacts session tokens inside the url', () => {
    controller.collect(
      { url: 'https://app.example.com/api/v1/payments/session/secret/bill' },
      {},
    );

    const [, , , fields] = (writeAppLog as jest.Mock).mock.calls[0];
    expect(fields.url).toContain('app.example.com');
    expect(fields.url).not.toContain('secret');
  });

  it('falls back to redacting the raw path when the url is not parseable', () => {
    controller.collect({ url: '/api/v1/payments/session/secret/bill?q=1' }, {});

    const [, , , fields] = (writeAppLog as jest.Mock).mock.calls[0];
    expect(fields.url).not.toContain('secret');
    expect(fields.url).not.toContain('q=1');
  });
});
