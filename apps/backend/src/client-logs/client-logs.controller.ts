import { Body, Controller, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { writeAppLog } from '../common/logging/app-logger';

type ClientLogLevel = 'info' | 'warn' | 'error';

const ALLOWED_LEVELS = new Set<ClientLogLevel>(['info', 'warn', 'error']);

function asString(value: unknown, maxLength = 1_000): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}...[truncated]`;
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
    if (
      /password|token|secret|cookie|authorization|card|pan|cvv/i.test(key)
    ) {
      continue;
    }
    output[key] =
      typeof item === 'string' ? asString(item, 1_000) : item ?? null;
  }
  return output;
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
}
