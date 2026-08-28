import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';

export const TABLE_SESSION_TOKEN_HEADER = 'x-table-session-token';
const MAX_TABLE_SESSION_TOKEN_LENGTH = 256;

/**
 * Extract the bearer-like TableSession credential from a request header.
 *
 * The parameter decorator and access guard share this extractor, giving every
 * public/POS payment route the same fail-closed behavior and preventing callers from
 * putting the credential back into a URL path or query string.
 */
export function extractTableSessionToken(
  headers?: Record<string, unknown>,
): string {
  const raw = headers?.[TABLE_SESSION_TOKEN_HEADER];
  if (
    typeof raw !== 'string' ||
    raw.length === 0 ||
    raw.length > MAX_TABLE_SESSION_TOKEN_LENGTH ||
    raw.includes(',')
  ) {
    throw new UnauthorizedException('Table session token is required');
  }

  const token = raw.trim();
  if (!token) {
    throw new UnauthorizedException('Table session token is required');
  }
  return token;
}

export const TableSessionToken = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<{
      headers?: Record<string, unknown>;
    }>();
    return extractTableSessionToken(request.headers);
  },
);
