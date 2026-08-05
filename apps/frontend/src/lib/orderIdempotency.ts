const STORAGE_PREFIX = "pending-order-idempotency:";

type PendingOrderIdentity = {
  fingerprint: string;
  key: string;
};

function fingerprintPayload(payload: unknown): string {
  const serialized = JSON.stringify(payload);
  let hash = 0x811c9dc5;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${serialized.length}:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function storageKey(scope: string): string {
  return `${STORAGE_PREFIX}${scope}`;
}

/**
 * `crypto.randomUUID()` only exists in secure contexts (HTTPS/localhost).
 * A QR menu is plausibly served over plain HTTP on a restaurant LAN, where
 * `crypto.randomUUID` is undefined and calling it throws. This is not used
 * as a security token — the backend independently verifies the payload
 * hash on replay — so a non-cryptographic fallback is fine here.
 */
function generateSubmissionId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    try {
      return crypto.randomUUID();
    } catch {
      // fall through to the manual generator below
    }
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** sessionStorage access can throw (Safari private mode, storage disabled by
 * policy, quota exceeded). Idempotency is a nice-to-have for retry/reload
 * safety, not a hard requirement for submitting the order at all — never let
 * a storage failure block checkout. */
function readPersistedIdentity(scope: string): PendingOrderIdentity | null {
  try {
    const persisted = sessionStorage.getItem(storageKey(scope));
    if (!persisted) return null;
    const parsed = JSON.parse(persisted) as PendingOrderIdentity;
    if (
      parsed &&
      typeof parsed.key === "string" &&
      typeof parsed.fingerprint === "string"
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function writePersistedIdentity(
  scope: string,
  identity: PendingOrderIdentity,
): void {
  try {
    sessionStorage.setItem(storageKey(scope), JSON.stringify(identity));
  } catch {
    // Storage unavailable — the caller still gets a usable key for this
    // submission, it just won't survive a reload/retry.
  }
}

export function getOrCreateOrderIdempotencyKey(
  scope: string,
  payload: unknown,
): string {
  const fingerprint = fingerprintPayload(payload);
  const persisted = readPersistedIdentity(scope);
  if (persisted && persisted.fingerprint === fingerprint && persisted.key) {
    return persisted.key;
  }

  const key = generateSubmissionId();
  writePersistedIdentity(scope, { fingerprint, key });
  return key;
}

export function clearOrderIdempotencyKey(scope: string, key: string): void {
  try {
    const persisted = sessionStorage.getItem(storageKey(scope));
    if (!persisted) return;
    try {
      const parsed = JSON.parse(persisted) as PendingOrderIdentity;
      if (parsed.key === key) sessionStorage.removeItem(storageKey(scope));
    } catch {
      sessionStorage.removeItem(storageKey(scope));
    }
  } catch {
    // Storage unavailable — nothing to clear.
  }
}
