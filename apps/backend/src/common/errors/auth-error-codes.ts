/**
 * Machine-readable error codes for the auth surface.
 *
 * Why these exist: the frontend used to recognise specific auth failures by
 * matching the exception's English message text. That coupling silently broke
 * whenever a message was reworded — a wrong password returned
 * "Invalid email or password." while the frontend still looked for
 * "Invalid credentials", so the user got the generic 401 copy
 * ("You are not signed in") instead of "Invalid email or password".
 *
 * A code is a contract; the message is prose. Frontends key off `code`, and
 * `message` stays free to change (and to stay deliberately vague for
 * enumeration-resistance) without breaking a single call site.
 *
 * Codes are also the only way the frontend can localise a backend rejection:
 * the API answers in one language, so a code is what lets react-i18next pick
 * the right string for the viewer.
 *
 * Rules:
 *  - Never reuse a code for a semantically different failure.
 *  - Never widen a code's meaning; add a new one instead.
 *  - Distinct codes may share a message when the message must stay generic to
 *    avoid leaking whether an account exists (see INVALID_CREDENTIALS).
 */
export const AuthErrorCode = {
  /** Wrong email or wrong password. Deliberately one code for both (#M3). */
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  /** Account was disabled by an admin. */
  ACCOUNT_DISABLED: 'ACCOUNT_DISABLED',
  /** Per-account lockout after repeated failed sign-ins. */
  ACCOUNT_TEMPORARILY_LOCKED: 'ACCOUNT_TEMPORARILY_LOCKED',
  /** Email/SMS OTP or magic-link code is wrong, expired, or already used. */
  INVALID_OR_EXPIRED_CODE: 'INVALID_OR_EXPIRED_CODE',
  /** Too many wrong OTP attempts; the code is locked for a cooldown. */
  CODE_ATTEMPTS_EXCEEDED: 'CODE_ATTEMPTS_EXCEEDED',
  /** Registration blocked because the address already has an account. */
  EMAIL_ALREADY_EXISTS: 'EMAIL_ALREADY_EXISTS',
  /** changePassword: the supplied current password did not match. */
  CURRENT_PASSWORD_INCORRECT: 'CURRENT_PASSWORD_INCORRECT',
  /** changePassword: the new password equals the current one. */
  PASSWORD_SAME_AS_CURRENT: 'PASSWORD_SAME_AS_CURRENT',
  /** Google sign-in refused: Google has not verified the account's email. */
  GOOGLE_EMAIL_NOT_VERIFIED: 'GOOGLE_EMAIL_NOT_VERIFIED',
  /** SMS verification is not configured on this deployment. */
  SMS_NOT_CONFIGURED: 'SMS_NOT_CONFIGURED',

  // ── staff PIN / shared device ──────────────────────────────────────────
  /** Wrong PIN. Carries `attemptsRemaining` when attempts are left. */
  INVALID_PIN: 'INVALID_PIN',
  /** Per-device PIN lockout is active. Carries `lockedUntil`. */
  PIN_DEVICE_LOCKED: 'PIN_DEVICE_LOCKED',
  /** Concurrent writes left the device lock state ambiguous; retry. */
  DEVICE_LOCK_STATE_CHANGED: 'DEVICE_LOCK_STATE_CHANGED',
  /** This device has never completed staff-device enrolment. */
  DEVICE_NOT_ENROLLED: 'DEVICE_NOT_ENROLLED',
  /** The device's trust window lapsed; it must be re-enrolled. */
  DEVICE_TRUST_EXPIRED: 'DEVICE_TRUST_EXPIRED',
  /** Enrolment/session was revoked by a manager. */
  DEVICE_REVOKED: 'DEVICE_REVOKED',
  /** Shared Device Mode is switched off for this restaurant. */
  SHARED_DEVICE_MODE_DISABLED: 'SHARED_DEVICE_MODE_DISABLED',
  /** Restaurant is suspended; POS access is refused. */
  RESTAURANT_SUSPENDED: 'RESTAURANT_SUSPENDED',
  /** The restaurant already has as many enrolled devices as its plan allows. */
  STAFF_DEVICE_LIMIT_REACHED: 'STAFF_DEVICE_LIMIT_REACHED',
  /** Enrolment QR does not correspond to any link. */
  ENROLLMENT_LINK_INVALID: 'ENROLLMENT_LINK_INVALID',
  /** Enrolment link was revoked by a manager. */
  ENROLLMENT_LINK_REVOKED: 'ENROLLMENT_LINK_REVOKED',
  /** Enrolment link was already claimed by another device. */
  ENROLLMENT_LINK_USED: 'ENROLLMENT_LINK_USED',
  /** Enrolment link passed its expiry. */
  ENROLLMENT_LINK_EXPIRED: 'ENROLLMENT_LINK_EXPIRED',
  /** POS is not included in the restaurant's plan. */
  POS_NOT_IN_PLAN: 'POS_NOT_IN_PLAN',
} as const;

export type AuthErrorCode = (typeof AuthErrorCode)[keyof typeof AuthErrorCode];
