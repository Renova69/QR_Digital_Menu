import { BadRequestException, ArgumentsHost } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { writeAppLog } from '../logging/app-logger';
import * as Sentry from '@sentry/nestjs';

jest.mock('../logging/app-logger', () => ({
  writeAppLog: jest.fn(),
}));

jest.mock('@sentry/nestjs', () => ({
  captureException: jest.fn(),
}));

function buildHost() {
  const status = jest.fn().mockReturnThis();
  const json = jest.fn();
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({
        method: 'GET',
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
});
