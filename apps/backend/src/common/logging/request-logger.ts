import { writeAppLog } from './app-logger';

function getClientIp(req: any): string | undefined {
  const forwardedFor = req.headers?.['x-forwarded-for'];
  if (typeof forwardedFor === 'string') {
    return forwardedFor.split(',')[0]?.trim();
  }
  return req.ip || req.socket?.remoteAddress;
}

function getRequestPath(req: any): string {
  return req.originalUrl || req.url || req.path || '';
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

    writeAppLog(level, 'HTTP request', 'HttpRequest', {
      requestId,
      method: req.method,
      path: getRequestPath(req),
      statusCode,
      durationMs,
      userId: user.id,
      role: user.role,
      restaurantId: user.restaurantId,
      ip: getClientIp(req),
      userAgent: req.headers?.['user-agent'],
    });
  });

  next();
}
