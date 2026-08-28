import type { NextFunction, Request, Response } from 'express';
import * as Sentry from '@sentry/nestjs';
import { applySentryRequestContext } from '../logging/sentry-request-context';
import {
  RequestBudget,
  RequestBudgetError,
  REQUEST_BUDGET_MS,
  withRequestBudget,
} from './request-budget';

/**
 * Runs before guards/body parsing, so OAuth and guard time consume the budget
 * too. The response watchdog also covers guards that never reach an interceptor.
 * Cancellation is cooperative: it cannot roll back DB writes or provider work.
 */
export function requestBudgetMiddleware(durationMs = REQUEST_BUDGET_MS) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const budget = new RequestBudget(durationMs);
    withRequestBudget(budget, () => {
      const signal = budget.signal;
      const onAbort = () => {
        const error: unknown = signal.reason;
        if (
          !(error instanceof RequestBudgetError) ||
          error.kind !== 'deadline'
        ) {
          return;
        }
        // Exactly one capture, even if cancellation subsequently reaches the
        // exception filter. Never include request bodies, credentials or URLs.
        try {
          applySentryRequestContext(req);
          Sentry.captureException(error, {
            tags: { subsystem: 'request-budget' },
          });
        } catch {
          // Telemetry failure must never prevent cancellation/the 504 response.
        }
        if (res.destroyed || res.writableEnded) return;
        if (res.headersSent) {
          res.destroy(); // A streamed response cannot be replaced with JSON.
          return;
        }
        res.status(504).json({
          ...(error.getResponse() as Record<string, unknown>),
          requestId: (req as Request & { requestId?: string }).requestId,
        });
      };
      const cleanup = () => {
        signal.removeEventListener('abort', onAbort);
        req.off('aborted', cleanup);
        res.off('close', cleanup);
        res.off('finish', cleanup);
        budget.close();
      };

      signal.addEventListener('abort', onAbort, { once: true });
      req.once('aborted', cleanup);
      res.once('close', cleanup);
      res.once('finish', cleanup);
      try {
        next();
      } catch (error) {
        cleanup();
        throw error;
      }
    });
  };
}
