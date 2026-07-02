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
});
