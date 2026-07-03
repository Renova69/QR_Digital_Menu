/**
 * CSRF double-submit exemptions (L-AUTH-1).
 *
 * The double-submit cookie check only protects requests that ride on an
 * ambient auth cookie — an attacker's forged cross-site request would carry the
 * victim's cookie but not the matching header. Each path below is exempt for a
 * specific, documented reason: it either runs BEFORE any auth session exists
 * (login / registration / OTP / OAuth handshake) or is a public surface that
 * never carries a dashboard cookie, so there is no ambient credential for CSRF
 * to protect.
 *
 * NOT in this list, handled separately in main.ts: provider webhooks
 * (`/payments/webhook`, `/payments/epay/notify`, `/payments/borica/callback`,
 * `/subscription/webhook`) — those use a raw body + provider signature instead
 * of the double-submit cookie.
 *
 * SECURITY: adding an entry here removes CSRF protection from that route. Do
 * not add one without a documented reason AND a matching update to
 * `csrf-exempt.spec.ts`, which pins this list so an accidental/unreviewed
 * addition fails the test suite.
 */
export const CSRF_EXEMPT_PATHS: readonly string[] = Object.freeze([
  '/api/v1/auth/login', // pre-session: no cookie exists yet to protect
  '/api/v1/auth/register', // pre-session: account does not exist yet
  '/api/v1/auth/register/verify', // pre-session: email OTP confirmation
  '/api/v1/auth/otp/send', // pre-session: customer OTP issuance
  '/api/v1/auth/otp/verify', // pre-session: customer OTP verification
  '/api/v1/auth/google', // pre-session: OAuth redirect start
  '/api/v1/auth/google/callback', // pre-session: OAuth return leg
  '/api/v1/orders', // public QR ordering — not cookie-authenticated
  '/api/v1/client-logs', // public telemetry beacon — no cookie, no state
  '/api/v1/client-logs/csp', // browser CSP report sink — log-only, no state
]);

/**
 * POST routes with a dynamic segment that are exempt for the same reason as the
 * static list: unauthenticated public surfaces with no ambient cookie to
 * protect. Kept as tight anchored patterns (single trailing segment) so they
 * can't accidentally exempt a nested state-changing route.
 */
export const CSRF_EXEMPT_POST_PATTERNS: readonly RegExp[] = Object.freeze([
  // public reservation booking: POST /api/v1/reservations/public/:restaurantId
  /^\/api\/v1\/reservations\/public\/[^/]+$/,
]);

/**
 * True when a request should skip the CSRF double-submit check. Exemptions are
 * POST-only — a route exempt for its POST must still enforce CSRF on any other
 * state-changing method it might later expose.
 */
export function isCsrfExemptPath(path: string, method: string): boolean {
  if (method !== 'POST') return false;
  if (CSRF_EXEMPT_PATHS.includes(path)) return true;
  return CSRF_EXEMPT_POST_PATTERNS.some((re) => re.test(path));
}
