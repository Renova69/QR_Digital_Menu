import type { Breadcrumb, ErrorEvent } from '@sentry/nestjs';
import { redactDiagnosticText } from './redact-secrets';

/**
 * Request headers that are credentials in their own right. Sentry is configured
 * with `sendDefaultPii: false`, which already keeps cookies and header values
 * off most events — but an integration (or a future `sendDefaultPii` flip) can
 * still attach them, so drop them here where the guarantee is unconditional.
 */
const CREDENTIAL_HEADERS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'proxy-authorization',
  'x-csrf-token',
  'x-print-agent-token',
  'x-api-key',
  'stripe-signature',
]);

function scrubHeaders(
  headers: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!headers) return headers;
  const scrubbed: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (CREDENTIAL_HEADERS.has(name.toLowerCase())) continue;
    scrubbed[name] = redactDiagnosticText(value);
  }
  return scrubbed;
}

function scrubRequest(request: ErrorEvent['request']): ErrorEvent['request'] {
  if (!request) return request;
  // The body is dropped rather than redacted: this API accepts PINs, passwords,
  // OTP codes and card-session payloads, and no structural rule distinguishes
  // those from the fields that would be useful in a report.
  const { data: _data, cookies: _cookies, ...rest } = request;
  return {
    ...rest,
    url: request.url ? redactDiagnosticText(request.url) : request.url,
    query_string:
      typeof request.query_string === 'string'
        ? redactDiagnosticText(request.query_string)
        : request.query_string,
    headers: scrubHeaders(request.headers),
  };
}

function scrubStringValues(
  values: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!values) return values;
  const scrubbed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    scrubbed[key] =
      typeof value === 'string' ? redactDiagnosticText(value) : value;
  }
  return scrubbed;
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  return {
    ...breadcrumb,
    message: breadcrumb.message
      ? redactDiagnosticText(breadcrumb.message)
      : breadcrumb.message,
    data: scrubStringValues(breadcrumb.data) as Breadcrumb['data'],
  };
}

/**
 * Strip every secret this backend is known to put into error text before the
 * event leaves the process. Applied as Sentry's `beforeSend`, so it covers
 * captures from the exception filter, from instrumentation, and — the reason it
 * landed before P2-1 — from unhandled rejections, whose text is arbitrary.
 */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  const exception = event.exception?.values
    ? {
        ...event.exception,
        values: event.exception.values.map((value) => ({
          ...value,
          value: value.value ? redactDiagnosticText(value.value) : value.value,
        })),
      }
    : event.exception;

  return {
    ...event,
    transaction: event.transaction
      ? redactDiagnosticText(event.transaction)
      : event.transaction,
    message: event.message ? redactDiagnosticText(event.message) : event.message,
    logentry: event.logentry?.message
      ? {
          ...event.logentry,
          message: redactDiagnosticText(event.logentry.message),
        }
      : event.logentry,
    exception,
    request: scrubRequest(event.request),
    extra: scrubStringValues(event.extra) as ErrorEvent['extra'],
    breadcrumbs: event.breadcrumbs?.map(scrubBreadcrumb),
  };
}
