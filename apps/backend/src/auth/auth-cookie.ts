import type { CookieOptions, Response } from 'express';

const cookieSameSite: CookieOptions['sameSite'] =
  (process.env.COOKIE_SAMESITE as CookieOptions['sameSite']) ??
  (process.env.NODE_ENV === 'production' ? 'none' : 'lax');

export const TOKEN_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: cookieSameSite,
  path: '/',
  maxAge: 24 * 60 * 60 * 1000,
};

const TOKEN_COOKIE_CLEAR_OPTIONS: CookieOptions = {
  httpOnly: TOKEN_COOKIE_OPTIONS.httpOnly,
  secure: TOKEN_COOKIE_OPTIONS.secure,
  sameSite: TOKEN_COOKIE_OPTIONS.sameSite,
  path: TOKEN_COOKIE_OPTIONS.path,
};

export function setAuthTokenCookie(res: Response, token: string): void {
  res.cookie('token', token, TOKEN_COOKIE_OPTIONS);
}

export function clearAuthTokenCookie(res: Response): void {
  res.clearCookie('token', TOKEN_COOKIE_CLEAR_OPTIONS);
}
