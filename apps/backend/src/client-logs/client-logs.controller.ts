import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { writeAppLog } from '../common/logging/app-logger';
import { redactSensitivePath } from '../common/logging/redact-path';

type ClientLogLevel = 'info' | 'warn' | 'error';

const ALLOWED_LEVELS = new Set<ClientLogLevel>(['info', 'warn', 'error']);

// Keys whose values must never reach the logs. Broadened beyond the original
// password/token/secret/cookie/authorization/card/pan/cvv set to cover the
// financial + credential identifiers an attacker could otherwise smuggle into
// server logs via the client context object (#16).
const SENSITIVE_KEY_PATTERN =
  /password|token|secret|cookie|authorization|auth|card|pan|cvv|cvc|routing|account|iban|apikey|api_key|ssn|\bpin\b/i;

// Matches C0 control chars (incl. CR/LF/TAB) and DEL. Defined with String.raw
// so the source stays printable (no literal control bytes in the file).

const CONTROL_CHAR_PATTERN = new RegExp(String.raw`[\x00-\x1f\x7f]`, 'g');

// Strip control chars so a client-supplied field can't forge extra log lines
// when the app runs in plain-text log mode (#16). Production uses JSON logs
// which already escape newlines, but dev/self-hosted plain-text deployments
// are vulnerable to log-injection without this.
function stripControlChars(value: string): string {
  return value.replace(CONTROL_CHAR_PATTERN, ' ');
}

function asString(value: unknown, maxLength = 1_000): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = stripControlChars(value);
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength)}...[truncated]`;
}

function asLevel(value: unknown): ClientLogLevel {
  return ALLOWED_LEVELS.has(value as ClientLogLevel)
    ? (value as ClientLogLevel)
    : 'error';
}

function safeContext(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value).slice(0, 30)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      continue;
    }
    output[key] =
      typeof item === 'string' ? asString(item, 1_000) : (item ?? null);
  }
  return output;
}

function safeUrl(value: unknown): string | undefined {
  const raw = asString(value, 2_000);
  if (!raw) return undefined;
  try {
    const parsed = new URL(raw);
    return `${parsed.origin}${redactSensitivePath(parsed.pathname)}`;
  } catch {
    return redactSensitivePath(raw.split(/[?#]/, 1)[0]);
  }
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function cspReportBody(body: any): Record<string, unknown> {
  const envelope = Array.isArray(body) ? body[0] : body;
  const report =
    envelope?.['csp-report'] ??
    envelope?.body ??
    envelope ??
    Object.create(null);
  return report && typeof report === 'object' && !Array.isArray(report)
    ? report
    : Object.create(null);
}

@Controller('client-logs')
export class ClientLogsController {
  @Post()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  collect(@Body() body: any, @Req() req: any) {
    const level = asLevel(body?.level);
    const eventType = asString(body?.type, 120) ?? 'client_error';
    const message = asString(body?.message, 1_000) ?? 'Client error';

    writeAppLog(level, `Client ${eventType}: ${message}`, 'ClientLog', {
      requestId: req?.requestId,
      clientSessionId: asString(body?.clientSessionId, 120),
      clientEventId: asString(body?.clientEventId, 120),
      eventType,
      url: asString(body?.url, 2_000),
      path: asString(body?.path, 1_000),
      userAgent: asString(body?.userAgent ?? req?.headers?.['user-agent'], 500),
      appVersion: asString(body?.appVersion, 120),
      buildMode: asString(body?.buildMode, 40),
      stack: asString(body?.stack, 4_000),
      clientContext: safeContext(body?.context),
    });

    return { ok: true, requestId: req?.requestId };
  }

  @Post('csp')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  collectCsp(@Body() body: any, @Req() req: any): void {
    const report = cspReportBody(body);
    const field = (...names: string[]): unknown => {
      for (const name of names) {
        if (report[name] !== undefined) return report[name];
      }
      return undefined;
    };
    const effectiveDirective =
      asString(
        field(
          'effective-directive',
          'effectiveDirective',
          'violated-directive',
        ),
        160,
      ) ?? 'unknown-directive';

    writeAppLog('warn', `CSP violation: ${effectiveDirective}`, 'CspReport', {
      requestId: req?.requestId,
      documentUrl: safeUrl(field('document-uri', 'documentURL', 'url')),
      blockedUrl: safeUrl(field('blocked-uri', 'blockedURL')),
      effectiveDirective,
      violatedDirective: asString(
        field('violated-directive', 'violatedDirective'),
        300,
      ),
      disposition: asString(field('disposition'), 40),
      sourceFile: safeUrl(field('source-file', 'sourceFile')),
      statusCode: asFiniteNumber(field('status-code', 'statusCode')),
      lineNumber: asFiniteNumber(field('line-number', 'lineNumber')),
      columnNumber: asFiniteNumber(field('column-number', 'columnNumber')),
      userAgent: asString(req?.headers?.['user-agent'], 500),
    });
  }
}
