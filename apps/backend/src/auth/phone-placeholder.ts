/**
 * Phone-first signup has to satisfy the non-null, unique `User.email` column
 * before the customer has given a real address, so it fabricates one. Identity
 * linking later replaces that value with the address the customer verifies, so
 * the two sides must agree on the exact shape — keep this the single source of
 * truth rather than re-deriving the string at either call site.
 */
const PLACEHOLDER_DOMAIN = '@phone.local';

export const buildPhonePlaceholderEmail = (phone: string): string =>
  `phone-${phone.replace(/\D/g, '')}${PLACEHOLDER_DOMAIN}`;

export const isPhonePlaceholderEmail = (
  email: string | null | undefined,
): boolean =>
  typeof email === 'string' && email.toLowerCase().endsWith(PLACEHOLDER_DOMAIN);
