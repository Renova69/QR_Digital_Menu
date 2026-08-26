import * as Sentry from '@sentry/nestjs';

type RequestWithSentryContext = {
  requestId?: unknown;
  user?: {
    id?: unknown;
  };
};

/**
 * Enrich the current Sentry request isolation scope without sending contact
 * details or credential material. The Node SDK's setUser/setTag APIs write to
 * the current isolation scope, which its HTTP integration creates per request.
 */
export function applySentryRequestContext(
  request: RequestWithSentryContext | undefined,
): void {
  const requestId = request?.requestId;
  if (typeof requestId === 'string' && requestId.length > 0) {
    Sentry.setTag('requestId', requestId);
  }

  const userId = request?.user?.id;
  Sentry.setUser(
    typeof userId === 'string' && userId.length > 0 ? { id: userId } : null,
  );
}
