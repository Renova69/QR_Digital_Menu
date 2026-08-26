import { BadRequestException, ArgumentsHost } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { writeAppLog } from '../logging/app-logger';
import * as Sentry from '@sentry/nestjs';

jest.mock('../logging/app-logger', () => ({
  writeAppLog: jest.fn(),
}));

jest.mock('@sentry/nestjs', () => ({
  captureException: jest.fn(),
  setTag: jest.fn(),
  setUser: jest.fn(),
}));

function buildHost(request: Record<string, unknown> = {}) {
  const status = jest.fn().mockReturnThis();
  const json = jest.fn();
  const host = {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => ({
        method: 'GET',
        originalUrl: '/api/v1/example',
        requestId: 'request-1',
        ...request,
      }),
      getResponse: () => ({
        headersSent: false,
        status,
        json,
      }),
    }),
  };
  return { host: host as unknown as ArgumentsHost, status, json };
}

describe('AllExceptionsFilter', () => {
  const mockedWriteAppLog = jest.mocked(writeAppLog);
  const mockedCaptureException = jest.mocked(Sentry.captureException);

  beforeEach(() => {
    mockedWriteAppLog.mockReset();
    mockedCaptureException.mockReset();
  });

  it('still sends the error response when exception logging fails', () => {
    mockedWriteAppLog.mockImplementation(() => {
      throw new Error('logger unavailable');
    });

    const status = jest.fn().mockReturnThis();
    const json = jest.fn();
    const host = {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          originalUrl: '/api/v1/example',
          requestId: 'request-1',
        }),
        getResponse: () => ({
          headersSent: false,
          status,
          json,
        }),
      }),
    };

    new AllExceptionsFilter().catch(
      new BadRequestException('Invalid input'),
      host as unknown as ArgumentsHost,
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      error: 'Bad Request',
      message: 'Invalid input',
      requestId: 'request-1',
      statusCode: 400,
    });
  });

  it('does not report a routine 4xx to Sentry', () => {
    const { host } = buildHost();

    new AllExceptionsFilter().catch(
      new BadRequestException('Invalid input'),
      host,
    );

    expect(mockedCaptureException).not.toHaveBeenCalled();
  });

  it('reports a genuine 5xx to Sentry', () => {
    const { host } = buildHost();
    const serverError = new Error('database unavailable');

    new AllExceptionsFilter().catch(serverError, host);

    expect(mockedCaptureException).toHaveBeenCalledWith(serverError);
  });

  it('attaches request context before reporting a 5xx raised before interceptors run', () => {
    const { host } = buildHost({
      requestId: 'request-before-interceptor',
      user: {
        id: 'user-opaque-id',
        email: 'owner@example.test',
        tokenHash: 'must-not-travel',
      },
    });
    const serverError = new Error('guard dependency unavailable');

    new AllExceptionsFilter().catch(serverError, host);

    expect(Sentry.setTag).toHaveBeenCalledWith(
      'requestId',
      'request-before-interceptor',
    );
    expect(Sentry.setUser).toHaveBeenCalledWith({ id: 'user-opaque-id' });
    expect(mockedCaptureException).toHaveBeenCalledWith(serverError);
  });

  // Everything below the guard assumes an Express request/response pair. On a
  // non-HTTP host the exception must come back out rather than be answered
  // with an HTTP response that has nowhere to go.
  it.each(['ws', 'rpc', 'graphql'])(
    'rethrows on a %s host instead of handling it as HTTP',
    (contextType) => {
      const switchToHttp = jest.fn();
      const host = {
        getType: () => contextType,
        switchToHttp,
      } as unknown as ArgumentsHost;
      const failure = new Error('socket handler blew up');

      expect(() => new AllExceptionsFilter().catch(failure, host)).toThrow(
        failure,
      );
      // The HTTP context is never even opened, so nothing can half-run.
      expect(switchToHttp).not.toHaveBeenCalled();
    },
  );

  it('rethrows a non-HTTP exception without swallowing or reporting it', () => {
    const host = {
      getType: () => 'ws',
      switchToHttp: jest.fn(),
    } as unknown as ArgumentsHost;

    expect(() =>
      new AllExceptionsFilter().catch('string failure', host),
    ).toThrow('string failure');
    // Reporting belongs to whatever handles the transport natively; capturing
    // here as well would double-count every WebSocket error.
    expect(mockedCaptureException).not.toHaveBeenCalled();
    expect(mockedWriteAppLog).not.toHaveBeenCalled();
  });
});
