/**
 * Maps an Axios error (or any object with response.status) to an i18n key
 * under the "apiErrors" namespace. Used throughout the app to replace raw
 * English backend messages (e.g. "Too Many Requests") with localized strings.
 *
 * Usage:
 *   import { getApiError } from "../../lib/apiError";
 *   // in a catch block:
 *   setError(t(getApiError(err)));
 */

export interface ApiLike {
  response?: {
    status?: number;
    data?: {
      message?: unknown;
    };
  };
  message?: string;
}

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

/**
 * Convenience wrapper that accepts the raw caught error and returns an i18n key.
 * Falls back to "apiErrors.unexpected" for non-HTTP errors (e.g. network failures).
 */
export function getApiError(err: unknown): string {
  const apiErr = err as ApiLike;
  const status = apiErr?.response?.status;
  const message = apiErr?.response?.data?.message;

  if (status === 401 && message === "Invalid credentials") {
    return "apiErrors.invalidCredentials";
  }

  // changePassword (PATCH /auth/me/password) throws 401 for a wrong current
  // password — a valid-session business rejection, not a session-expiry
  // 401. The generic apiErrors.unauthorized ("you're not logged in") copy is
  // actively wrong here, so route it to its own key instead.
  if (status === 401 && message === "Current password is incorrect.") {
    return "profileDashboard.currentPasswordIncorrect";
  }
  if (
    status === 400 &&
    message === "New password must be different from the current password."
  ) {
    return "profileDashboard.passwordSameAsCurrent";
  }

  return getApiErrorKey(status);
}
