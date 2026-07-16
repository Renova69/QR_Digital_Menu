import type { NextFunction, Request, Response } from 'express';

export function authenticatedNoStore(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const authorization = req.headers.authorization;
  const hasBearerToken =
    typeof authorization === 'string' && /^Bearer\s+\S+/i.test(authorization);
  const hasAuthCookie = Boolean(req.cookies?.token);

  if (hasAuthCookie || hasBearerToken) {
    res.setHeader(
      'Cache-Control',
      'private, no-store, no-cache, max-age=0, must-revalidate',
    );
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
  }

  next();
}
