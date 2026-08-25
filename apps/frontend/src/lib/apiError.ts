/**
 * Maps an Axios error (or any object with response.status) to an i18n key
 * under the "apiErrors" namespace. Used throughout the app to replace raw
 * English backend messages (e.g. "Too Many Requests") with localized strings.
 *
 * Resolution order, most specific first:
 *   1. `response.data.code` — the machine-readable contract the backend
 *      publishes (see apps/backend/src/common/errors/auth-error-codes.ts).
 *   2. A `response.data.message` that is itself a bare SCREAMING_SNAKE code —
 *      several older endpoints put the code in the message slot.
 *   3. Legacy exact-message matches, kept only so a frontend deploy that lands
 *      before the backend one still localizes correctly. Delete a rule here
 *      once the matching backend code has shipped everywhere.
 *   4. The HTTP status.
 *
 * Free-text matching is the fallback and never the contract: it silently
 * stopped working every time the backend reworded a message. A wrong password
 * began returning "Invalid email or password." while this file still looked
 * for "Invalid credentials", so users saw the generic "You are not signed in"
 * copy instead. Prefer adding a backend code over adding a rule to step 3.
 *
 * Usage:
 *   import { getApiError } from "../../lib/apiError";
 *   // in a catch block:
 *   setError(t(getApiError(err)));
 *
 * When the message needs a count (attempts left, minutes locked), use
 * getApiErrorDetails and pass the params through to t().
 */

export interface ApiLike {
  response?: {
    status?: number;
    data?: {
      code?: unknown;
      message?: unknown;
      attemptsRemaining?: unknown;
      lockedUntil?: unknown;
      retryInSeconds?: unknown;
    };
  };
  message?: string;
}

/** Interpolation values for the resolved key, if it takes any. */
export type ApiErrorParams = Record<string, string | number>;

export interface ApiErrorDetails {
  /** i18n key to render. */
  key: string;
  /** Values for the placeholders in that key. Empty when it takes none. */
  params: ApiErrorParams;
  /** The backend error code, when the response carried one. */
  code?: string;
}

/**
 * Backend error code to i18n key. The keys live under "apiErrors" except where
 * a screen already owns better copy for that exact failure.
 */
const CODE_TO_KEY: Record<string, string> = {
  INVALID_CREDENTIALS: "apiErrors.invalidCredentials",
  ACCOUNT_DISABLED: "apiErrors.accountDisabled",
  ACCOUNT_TEMPORARILY_LOCKED: "apiErrors.accountTemporarilyLocked",
  INVALID_OR_EXPIRED_CODE: "apiErrors.invalidOrExpiredCode",
  CODE_ATTEMPTS_EXCEEDED: "apiErrors.codeAttemptsExceeded",
  EMAIL_ALREADY_EXISTS: "apiErrors.emailAlreadyExists",
  GOOGLE_EMAIL_NOT_VERIFIED: "apiErrors.googleEmailNotVerified",
  SMS_NOT_CONFIGURED: "apiErrors.smsNotConfigured",
  IDENTITY_IN_USE: "apiErrors.identityInUse",
  // changePassword has its own copy on the profile screen: a generic
  // "unauthorized" string is actively wrong for a valid session rejecting a
  // mistyped current password.
  CURRENT_PASSWORD_INCORRECT: "profileDashboard.currentPasswordIncorrect",
  PASSWORD_SAME_AS_CURRENT: "profileDashboard.passwordSameAsCurrent",
  // staff PIN / shared device
  INVALID_PIN: "apiErrors.invalidPin",
  PIN_DEVICE_LOCKED: "apiErrors.pinDeviceLocked",
  DEVICE_LOCK_STATE_CHANGED: "apiErrors.deviceLockStateChanged",
  DEVICE_NOT_ENROLLED: "apiErrors.deviceNotEnrolled",
  DEVICE_TRUST_EXPIRED: "apiErrors.deviceTrustExpired",
  DEVICE_REVOKED: "apiErrors.deviceRevoked",
  SHARED_DEVICE_MODE_DISABLED: "apiErrors.sharedDeviceModeDisabled",
  RESTAURANT_SUSPENDED: "apiErrors.restaurantSuspended",
  STAFF_DEVICE_LIMIT_REACHED: "apiErrors.staffDeviceLimitReached",
  POS_NOT_IN_PLAN: "apiErrors.posNotInPlan",
  // device enrolment (the QR a manager generates in Settings)
  ENROLLMENT_LINK_INVALID: "apiErrors.enrollmentLinkInvalid",
  ENROLLMENT_LINK_REVOKED: "apiErrors.enrollmentLinkRevoked",
  ENROLLMENT_LINK_USED: "apiErrors.enrollmentLinkUsed",
  ENROLLMENT_LINK_EXPIRED: "apiErrors.enrollmentLinkExpired",
};

/**
 * Legacy exact-message rules, used only when the response carried no code.
 * Transitional: each entry covers the window where a deployed backend predates
 * its code, and should be removed once that backend is gone.
 */
const LEGACY_MESSAGE_TO_CODE: Array<{
  status?: number;
  message: string;
  code: string;
}> = [
  { status: 401, message: "Invalid credentials", code: "INVALID_CREDENTIALS" },
  {
    status: 401,
    message: "Invalid email or password.",
    code: "INVALID_CREDENTIALS",
  },
  {
    status: 401,
    message: "This account has been disabled.",
    code: "ACCOUNT_DISABLED",
  },
  {
    status: 401,
    message: "Invalid or expired code.",
    code: "INVALID_OR_EXPIRED_CODE",
  },
  {
    status: 409,
    message: "User with this email already exists",
    code: "EMAIL_ALREADY_EXISTS",
  },
  {
    status: 401,
    message: "Current password is incorrect.",
    code: "CURRENT_PASSWORD_INCORRECT",
  },
  {
    status: 400,
    message: "New password must be different from the current password.",
    code: "PASSWORD_SAME_AS_CURRENT",
  },
  // Staff-device rejections. These matter more than the rest during a deploy:
  // DeviceLoginPage decides whether to clear a stale enrolment from these, so
  // an unrecognised one leaves a dead tablet polling forever.
  {
    status: 401,
    message: "This device is not enrolled for staff PIN login.",
    code: "DEVICE_NOT_ENROLLED",
  },
  {
    status: 401,
    message:
      "This device is no longer trusted for PIN login. Ask an owner or manager to re-enroll it.",
    code: "DEVICE_TRUST_EXPIRED",
  },
  {
    status: 410,
    message: "Device enrollment link has been revoked",
    code: "ENROLLMENT_LINK_REVOKED",
  },
  {
    status: 410,
    message: "Device enrollment link has already been used",
    code: "ENROLLMENT_LINK_USED",
  },
  {
    status: 410,
    message: "Device enrollment link has expired",
    code: "ENROLLMENT_LINK_EXPIRED",
  },
  {
    status: 401,
    message: "Invalid device enrollment link",
    code: "ENROLLMENT_LINK_INVALID",
  },
];

/** A message that is nothing but an uppercase code, e.g. "ACCOUNT_DISABLED". */
const BARE_CODE = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/;

/** Returns an i18n key for a known HTTP status, or the generic fallback key. */
export function getApiErrorKey(status: number | undefined): string {
  switch (status) {
    case 400:
      return "apiErrors.badRequest";
    case 401:
      return "apiErrors.unauthorized";
    case 403:
      return "apiErrors.forbidden";
    case 404:
      return "apiErrors.notFound";
    case 409:
      return "apiErrors.conflict";
    case 422:
      return "apiErrors.unprocessable";
    case 429:
      return "apiErrors.tooManyRequests";
    case 500:
      return "apiErrors.internalServerError";
    case 502:
      return "apiErrors.badGateway";
    case 503:
      return "apiErrors.serviceUnavailable";
    case 504:
      return "apiErrors.gatewayTimeout";
    default:
      return "apiErrors.unexpected";
  }
}

/** Pulls the error code out of a response, whichever slot it arrived in. */
export function getApiErrorCode(err: unknown): string | undefined {
  const data = (err as ApiLike)?.response?.data;
  if (!data) return undefined;

  if (typeof data.code === "string" && data.code) return data.code;

  // Endpoints that predate the `code` field put the code in `message`.
  if (typeof data.message === "string" && BARE_CODE.test(data.message)) {
    return data.message;
  }

  const status = (err as ApiLike)?.response?.status;
  const legacy = LEGACY_MESSAGE_TO_CODE.find(
    (rule) =>
      rule.message === data.message &&
      (rule.status === undefined || rule.status === status),
  );
  return legacy?.code;
}

function toPositiveInt(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? Math.ceil(n) : undefined;
}

/** Minutes remaining until an ISO lockout timestamp, floored at 1. */
function minutesUntil(lockedUntil: unknown): number | undefined {
  if (typeof lockedUntil !== "string") return undefined;
  const ms = new Date(lockedUntil).getTime() - Date.now();
  if (!Number.isFinite(ms)) return undefined;
  return Math.max(1, Math.ceil(ms / 60000));
}

/**
 * Resolves an error to an i18n key plus any interpolation values it needs.
 * Callers that only render a bare string can use getApiError instead.
 */
export function getApiErrorDetails(err: unknown): ApiErrorDetails {
  const apiErr = err as ApiLike;
  const status = apiErr?.response?.status;
  const data = apiErr?.response?.data;
  const code = getApiErrorCode(err);

  if (!code) return { key: getApiErrorKey(status), params: {} };

  const key = CODE_TO_KEY[code];
  if (!key) {
    // A code we have no copy for yet. Fall back to the status rather than
    // showing the raw English message.
    return { key: getApiErrorKey(status), params: {}, code };
  }

  if (code === "INVALID_PIN") {
    const remaining = toPositiveInt(data?.attemptsRemaining);
    return remaining === undefined
      ? { key, params: {}, code }
      : {
          key: "apiErrors.invalidPinWithAttempts",
          params: { count: remaining },
          code,
        };
  }

  if (code === "PIN_DEVICE_LOCKED") {
    const minutes = minutesUntil(data?.lockedUntil);
    return minutes === undefined
      ? { key, params: {}, code }
      : {
          key: "apiErrors.pinDeviceLockedWithMinutes",
          params: { count: minutes },
          code,
        };
  }

  if (code === "ACCOUNT_TEMPORARILY_LOCKED") {
    const seconds = toPositiveInt(data?.retryInSeconds);
    return seconds === undefined
      ? { key, params: {}, code }
      : {
          key: "apiErrors.accountTemporarilyLockedWithMinutes",
          params: { count: Math.ceil(seconds / 60) },
          code,
        };
  }

  return { key, params: {}, code };
}

/**
 * Convenience wrapper that accepts the raw caught error and returns an i18n key.
 * Falls back to "apiErrors.unexpected" for non-HTTP errors (e.g. network failures).
 */
export function getApiError(err: unknown): string {
  const details = getApiErrorDetails(err);
  // This compatibility helper returns only a key, so it cannot safely select
  // a count-bearing variant: its 40+ callers invoke `t(key)` without the
  // interpolation params. Detailed callers must use getApiErrorDetails.
  return details.code
    ? (CODE_TO_KEY[details.code] ?? details.key)
    : details.key;
}
