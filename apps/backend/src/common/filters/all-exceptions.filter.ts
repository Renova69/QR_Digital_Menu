import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { writeAppLog } from '../logging/app-logger';
import { redactSensitivePath } from '../logging/redact-path';

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
    if (Array.isArray(message)) {
      const parts = message.filter(
        (part): part is string => typeof part === 'string',
      );
      if (parts.length > 0) return parts.join('; ');
    }
    if (typeof message === 'string') return message;
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

    // Only genuine server errors go to Sentry — routine 4xx (validation
    // failures, not-found, unauthorized) are normal client-driven traffic,
    // not bugs, and would be pure noise against the alert budget. Nest's
    // automatic Sentry instrumentation doesn't see this at all once a
    // custom global exception filter is registered, so this is the only
    // capture point.
    if (level === 'error') {
      Sentry.captureException(exception);
    }

    try {
      writeAppLog(level, getMessage(responseBody), 'ExceptionFilter', {
        requestId,
        method: req?.method,
        // M-PAY-1: never log the session bearer token embedded in the path.
        path: redactSensitivePath(req?.originalUrl || req?.url),
        statusCode,
        errorName: error?.name,
        stack: error?.stack,
        userId: req?.user?.id,
        role: req?.user?.role,
        restaurantId: req?.user?.restaurantId,
      });
    } catch {
      // Logging must never prevent the actual error response from being sent.
    }

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
