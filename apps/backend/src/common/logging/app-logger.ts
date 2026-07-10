import { LoggerService } from '@nestjs/common';

export type AppLogLevel = 'debug' | 'info' | 'warn' | 'error';

type LogFields = Record<string, unknown>;

const MAX_STRING_LENGTH = 4_000;
const MAX_ARRAY_LENGTH = 20;
const MAX_OBJECT_KEYS = 30;

function shouldUseJsonLogs(): boolean {
  return (
    process.env.LOG_FORMAT === 'json' ||
    process.env.NODE_ENV === 'production' ||
    !!process.env.K_SERVICE
  );
}

function severityFor(level: AppLogLevel): string {
  switch (level) {
    case 'debug':
      return 'DEBUG';
    case 'warn':
      return 'WARNING';
    case 'error':
      return 'ERROR';
    default:
      return 'INFO';
  }
}

function truncate(value: string): string {
  if (value.length <= MAX_STRING_LENGTH) return value;
  return `${value.slice(0, MAX_STRING_LENGTH)}...[truncated]`;
}

export function safeLogValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return truncate(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return {
      name: value.name,
      message: truncate(value.message),
      stack: value.stack ? truncate(value.stack) : undefined,
    };
  }
  if (depth >= 3) return '[max-depth]';
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_LENGTH)
      .map((item) => safeLogValue(item, depth + 1));
  }
  if (typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value).slice(0, MAX_OBJECT_KEYS)) {
      if (isSensitiveKey(key)) continue;
      output[key] = safeLogValue(item, depth + 1);
    }
    return output;
  }
  return String(value);
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return (
    normalized.includes('password') ||
    normalized.includes('token') ||
    normalized.includes('secret') ||
    normalized.includes('cookie') ||
    normalized.includes('authorization') ||
    normalized.includes('privatekey') ||
    normalized.includes('p_sign')
  );
}

function messageToString(message: unknown): string {
  if (typeof message === 'string') return truncate(message);
  if (message instanceof Error) return truncate(message.message);
  try {
    return truncate(JSON.stringify(safeLogValue(message)));
  } catch {
    return truncate(String(message));
  }
}

export function writeAppLog(
  level: AppLogLevel,
  message: unknown,
  context?: string,
  fields: LogFields = {},
) {
  const safeFields = safeLogValue(fields) as Record<string, unknown>;
  const entry = {
    ...safeFields,
    severity: severityFor(level),
    level,
    message: messageToString(message),
    context,
    timestamp: new Date().toISOString(),
  };

  if (shouldUseJsonLogs()) {
    const line = JSON.stringify(entry);
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
    return;
  }

  const extra = Object.keys(fields).length
    ? ` ${JSON.stringify(safeLogValue(fields))}`
    : '';
  const prefix = `[${entry.timestamp}] ${entry.severity}${
    context ? ` [${context}]` : ''
  }`;
  const line = `${prefix} ${entry.message}${extra}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

function parseOptionalParams(level: AppLogLevel, params: unknown[]) {
  let context: string | undefined;
  let stack: string | undefined;
  const details: unknown[] = [];

  for (const param of params) {
    if (!param) continue;
    if (param instanceof Error) {
      stack = param.stack;
      details.push(param);
      continue;
    }
    if (typeof param === 'string') {
      if (
        level === 'error' &&
        !stack &&
        (param.includes('\n') || param.startsWith('Error'))
      ) {
        stack = param;
      } else {
        context = param;
      }
      continue;
    }
    details.push(param);
  }

  return {
    context,
    fields: {
      ...(stack ? { stack } : {}),
      ...(details.length ? { details } : {}),
    },
  };
}

export class AppLogger implements LoggerService {
  log(message: unknown, ...optionalParams: unknown[]) {
    const { context, fields } = parseOptionalParams('info', optionalParams);
    writeAppLog('info', message, context, fields);
  }

  error(message: unknown, ...optionalParams: unknown[]) {
    const { context, fields } = parseOptionalParams('error', optionalParams);
    writeAppLog('error', message, context, fields);
  }

  warn(message: unknown, ...optionalParams: unknown[]) {
    const { context, fields } = parseOptionalParams('warn', optionalParams);
    writeAppLog('warn', message, context, fields);
  }

  debug(message: unknown, ...optionalParams: unknown[]) {
    const { context, fields } = parseOptionalParams('debug', optionalParams);
    writeAppLog('debug', message, context, fields);
  }

  verbose(message: unknown, ...optionalParams: unknown[]) {
    const { context, fields } = parseOptionalParams('debug', optionalParams);
    writeAppLog('debug', message, context, fields);
  }
}
