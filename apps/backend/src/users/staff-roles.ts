/**
 * Credential model for staff roles.
 *
 * PIN roles are device/floor roles that authenticate at a shared POS/KDS
 * tablet via a numeric PIN (`pinLogin`). Password roles are dashboard roles
 * that authenticate with email + password and must NOT be pinLogin candidates
 * — a short PIN must never mint a JWT for a privileged dashboard account.
 *
 * Keep this list as the single source of truth. `users.service` uses it to
 * decide which credential to issue on staff creation; `auth.service.pinLogin`
 * uses it to scope which roles a PIN can authenticate.
 */
export const PIN_LOGIN_ROLES = ['WAITER', 'KITCHEN'] as const;

export function isPinRole(role: string): boolean {
  return (PIN_LOGIN_ROLES as readonly string[]).includes(role);
}
