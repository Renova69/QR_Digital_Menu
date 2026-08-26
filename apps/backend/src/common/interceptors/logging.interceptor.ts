import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { writeAppLog } from '../logging/app-logger';
import { redactSensitivePath } from '../logging/redact-path';
import { applySentryRequestContext } from '../logging/sentry-request-context';

/**
 * Global HTTP logging interceptor.
 *
 * Logs every request as:
 *   [METHOD] /path — 42ms
 *
 * When the frontend sends trace headers (X-Trace-Origin, X-Correlation-Id),
 * those are included so you can pinpoint which page/component is firing
 * requests too frequently.
 *
 * Color-coded thresholds (in dev console output):
 *   🟢 <100ms   🟡 100-500ms   🔴 >500ms
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== 'http') return next.handle();

    const req = context.switchToHttp().getRequest();
    // Guards have completed before an interceptor runs, so authenticated
    // requests have req.user here. This also tags swallowed/reportable errors
    // captured inside the handler, not only errors reaching the global filter.
    applySentryRequestContext(req);
    const { method, originalUrl, url } = req;
    // M-PAY-1: strip the session bearer token from the logged path.
    const path = redactSensitivePath(originalUrl || url);

    // ── Frontend trace context ──────────────────────────────────────────
    const traceOrigin = req.headers['x-trace-origin'] as string | undefined;
    const correlationId = req.headers['x-correlation-id'] as string | undefined;
    const requestStartedAt = req.headers['x-request-started-at'] as
      | string
      | undefined;

    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          this.logRequest(
            method,
            path,
            startTime,
            context,
            traceOrigin,
            correlationId,
            requestStartedAt,
          );
        },
        error: (error) => {
          this.logRequest(
            method,
            path,
            startTime,
            context,
            traceOrigin,
            correlationId,
            requestStartedAt,
            error,
          );
        },
      }),
    );
  }

  private logRequest(
    method: string,
    path: string,
    startTime: number,
    context: ExecutionContext,
    traceOrigin?: string,
    correlationId?: string,
    requestStartedAt?: string,
    error?: any,
  ) {
    const executionTime = Date.now() - startTime;
    const res = context.switchToHttp().getResponse();
    const statusCode = error?.status ?? error?.getStatus?.() ?? res.statusCode;

    // Speed indicator for dev readability
    const speedIcon =
      executionTime < 100 ? '🟢' : executionTime < 500 ? '🟡' : '🔴';

    // Network latency: time from frontend send → backend receive
    let networkLatencyMs: number | undefined;
    if (requestStartedAt) {
      const clientTimestamp = Number(requestStartedAt);
      if (!isNaN(clientTimestamp)) {
        networkLatencyMs = startTime - clientTimestamp;
        // Clock skew can make this negative; clamp to 0.
        if (networkLatencyMs < 0) networkLatencyMs = 0;
      }
    }

    // Structured log for production (Cloud Run / GKE)
    const fields: Record<string, unknown> = {
      method,
      path,
      statusCode,
      executionTimeMs: executionTime,
      ...(traceOrigin && { traceOrigin }),
      ...(correlationId && { correlationId }),
      ...(networkLatencyMs !== undefined && { networkLatencyMs }),
      handler: context.getHandler()?.name,
      controller: context.getClass()?.name,
    };

    const level =
      statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';

    // Human-readable summary
    const traceTag = traceOrigin ? ` [${traceOrigin}]` : '';
    const corrTag = correlationId ? ` cid:${correlationId.slice(0, 8)}` : '';
    const latencyTag =
      networkLatencyMs !== undefined ? ` net:${networkLatencyMs}ms` : '';
    const summary = `${speedIcon} ${method} ${path} ${statusCode} — ${executionTime}ms${traceTag}${corrTag}${latencyTag}`;

    writeAppLog(level, summary, 'HTTP', fields);
  }
}
