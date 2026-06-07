import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { writeAppLog } from '../logging/app-logger';

function getExceptionResponse(exception: unknown, statusCode: number) {
  if (exception instanceof HttpException) {
    return exception.getResponse();
  }
  return {
    statusCode,
    message: 'Internal server error',
  };
}

function getMessage(responseBody: unknown): string {
  if (typeof responseBody === 'string') return responseBody;
  if (
    responseBody &&
    typeof responseBody === 'object' &&
    'message' in responseBody
  ) {
    const message = (responseBody as { message?: unknown }).message;
    if (Array.isArray(message)) return message.join('; ');
    if (message) return String(message);
  }
  return 'Unexpected error';
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest();
    const res = ctx.getResponse();
    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const responseBody = getExceptionResponse(exception, statusCode);
    const requestId = req?.requestId;
    const level = statusCode >= 500 ? 'error' : 'warn';
    const error = exception instanceof Error ? exception : undefined;

    writeAppLog(level, getMessage(responseBody), 'ExceptionFilter', {
      requestId,
      method: req?.method,
      path: req?.originalUrl || req?.url,
      statusCode,
      errorName: error?.name,
      stack: error?.stack,
      userId: req?.user?.id,
      role: req?.user?.role,
      restaurantId: req?.user?.restaurantId,
    });

    if (res?.headersSent) return;

    const safeResponse =
      responseBody && typeof responseBody === 'object'
        ? { ...(responseBody as Record<string, unknown>), requestId }
        : {
            statusCode,
            message: String(responseBody),
            requestId,
          };

    res.status(statusCode).json(safeResponse);
  }
}
