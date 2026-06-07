import { writeAppLog } from './app-logger';

function getClientIp(req: any): string | undefined {
  const forwardedFor = req.headers?.['x-forwarded-for'];
  if (typeof forwardedFor === 'string') {
    return forwardedFor.split(',')[0]?.trim();
  }
  return req.ip || req.socket?.remoteAddress;
}

function isProductionRequestLog(): boolean {
  return process.env.NODE_ENV === 'production' || !!process.env.K_SERVICE;
}

function stripQueryString(path: string): string {
  const queryIndex = path.search(/[?#]/);
  return queryIndex === -1 ? path : path.slice(0, queryIndex);
}

function getRequestPath(req: any, includeQueryString = true): string {
  const path = req.originalUrl || req.url || req.path || '';
  return includeQueryString ? path : stripQueryString(path);
}

function shouldSkipRequestLog(req: any): boolean {
  if (process.env.LOG_HEALTH_REQUESTS === 'true') return false;
  return getRequestPath(req).startsWith('/api/v1/health');
}

function getLevel(statusCode: number): 'info' | 'warn' | 'error' {
  if (statusCode >= 500) return 'error';
  if (statusCode >= 400) return 'warn';
  return 'info';
}

export function requestLogger(req: any, res: any, next: () => void) {
  const startedAt = Date.now();
  const requestId = req.requestId;
  if (requestId) {
    res.setHeader('X-Request-Id', requestId);
  }

  res.on('finish', () => {
    if (shouldSkipRequestLog(req)) return;

    const durationMs = Date.now() - startedAt;
    const statusCode = res.statusCode;
    const user = req.user ?? {};
    const level = getLevel(statusCode);
    const isProduction = isProductionRequestLog();
    const includeDebugIdentityFields = !isProduction || statusCode >= 400;

    const fields: Record<string, unknown> = {
      requestId,
      method: req.method,
      path: getRequestPath(req, !isProduction),
      statusCode,
      durationMs,
      role: user.role,
      restaurantId: user.restaurantId,
    };

    if (includeDebugIdentityFields) {
      fields.userId = user.id;
      fields.ip = getClientIp(req);
      fields.userAgent = req.headers?.['user-agent'];
    }

    writeAppLog(level, 'HTTP request', 'HttpRequest', fields);
  });

  next();
}
