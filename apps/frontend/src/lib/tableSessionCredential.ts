const SESSION_FRAGMENT_KEY = "session";
const MAX_TABLE_SESSION_TOKEN_LENGTH = 256;
const HOSTED_CHECKOUT_STORAGE_PREFIX = "hosted-checkout:";

function isValidTableSessionToken(token: string): boolean {
  return token.length > 0 && token.length <= MAX_TABLE_SESSION_TOKEN_LENGTH;
}

/**
 * Build a POS payment deep link without putting the bearer-like session token
 * in the HTTP request target. URL fragments stay client-side and are not sent
 * to Vercel, Cloud Run, or in the Referer header.
 */
export function buildTableSessionCheckoutUrl(
  origin: string,
  token: string,
): string {
  const fragment = new URLSearchParams({ [SESSION_FRAGMENT_KEY]: token });
  return `${origin.replace(/\/+$/, "")}/checkout#${fragment.toString()}`;
}

/**
 * Read only the fragment transport. Deliberately do not fall back to a query
 * parameter: a compatibility request containing `?session=` has already leaked
 * the credential to every request-log layer before React can redirect it.
 */
export function readTableSessionTokenFromHash(hash: string): string | null {
  if (!hash.startsWith("#")) return null;
  const params = new URLSearchParams(hash.slice(1));
  const token = params.get(SESSION_FRAGMENT_KEY)?.trim() ?? "";
  if (!isValidTableSessionToken(token)) return null;
  return token;
}

export function hostedCheckoutStorageKey(token: string): string {
  return `${HOSTED_CHECKOUT_STORAGE_PREFIX}${token}`;
}

/**
 * Recover the most recently started hosted checkout in this browser tab.
 * Marker contents must agree with the key so malformed/stale storage cannot
 * substitute an unrelated credential.
 */
export function findHostedCheckoutToken(
  storage: Pick<Storage, "length" | "key" | "getItem">,
): string | null {
  let newest: { token: string; startedAt: number } | null = null;

  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key?.startsWith(HOSTED_CHECKOUT_STORAGE_PREFIX)) continue;

      const token = key.slice(HOSTED_CHECKOUT_STORAGE_PREFIX.length).trim();
      if (!isValidTableSessionToken(token)) continue;

      const raw = storage.getItem(key);
      if (!raw) continue;

      const marker = JSON.parse(raw) as {
        token?: unknown;
        startedAt?: unknown;
      };
      if (
        marker.token !== token ||
        typeof marker.startedAt !== "number" ||
        !Number.isFinite(marker.startedAt)
      ) {
        continue;
      }

      if (!newest || marker.startedAt > newest.startedAt) {
        newest = { token, startedAt: marker.startedAt };
      }
    }
  } catch {
    return null;
  }

  return newest?.token ?? null;
}

/** Keep client-only credentials out of URLs handed to payment providers. */
export function stripUrlFragment(url: string): string {
  const fragmentIndex = url.indexOf("#");
  return fragmentIndex === -1 ? url : url.slice(0, fragmentIndex);
}

export function isPublicTableSessionCheckout(
  pathname: string,
  hash: string,
): boolean {
  return (
    pathname.startsWith("/checkout") &&
    readTableSessionTokenFromHash(hash) !== null
  );
}
