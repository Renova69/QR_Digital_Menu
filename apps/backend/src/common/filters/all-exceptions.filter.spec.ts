import { BadRequestException, ArgumentsHost } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { writeAppLog } from '../logging/app-logger';

jest.mock('../logging/app-logger', () => ({
  writeAppLog: jest.fn(),
}));

describe('AllExceptionsFilter', () => {
  const mockedWriteAppLog = jest.mocked(writeAppLog);

  beforeEach(() => {
    mockedWriteAppLog.mockReset();
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
});
