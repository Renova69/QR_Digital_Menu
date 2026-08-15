import { useSyncExternalStore } from "react";

/** Matches the vanity menu route. Kept here so Header and ConsentContext
 *  cannot drift from the router. */
export const VANITY_MENU_PATH = /^\/m\/[^/?#]+/;

let resolvedRestaurantId: string | null = null;
const listeners = new Set<() => void>();

/**
 * Published by the /m/:slug route once resolution succeeds, cleared on
 * unmount. Consumers that render outside the route tree — CookieConsentBanner
 * is a sibling of <Routes>, so useParams() is unavailable to it — read the
 * resolved ID from here. Keeping this ID-based is what stops consent being
 * filed under a slug.
 */
export function setResolvedRestaurantId(id: string | null): void {
  if (resolvedRestaurantId === id) return;
  resolvedRestaurantId = id;
  listeners.forEach((listener) => listener());
}

export function getResolvedRestaurantId(): string | null {
  return resolvedRestaurantId;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Exported for tests only. */
export const subscribeForTest = subscribe;

export function useResolvedRestaurantId(): string | null {
  return useSyncExternalStore(
    subscribe,
    getResolvedRestaurantId,
    getResolvedRestaurantId,
  );
}
