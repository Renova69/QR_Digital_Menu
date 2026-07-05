import { lazy as reactLazy, type ComponentType } from "react";

// A hashed route chunk (e.g. BookingConfirmationPage-<hash>.js) is replaced on
// every deploy and the old file is purged. A client still running the previous
// deploy's index.html holds the OLD hash; when it lazy-loads a route it hasn't
// fetched yet, the request 404s — and because vercel.json rewrites unknown
// paths to /index.html, the browser gets HTML for a .js import and throws
// "Failed to fetch dynamically imported module". This module reloads the page
// once so the client picks up the fresh index.html + current chunk hashes,
// while guarding against a reload loop when a chunk is genuinely broken.

const RELOAD_TS_KEY = "chunk-reload-ts";
// Min gap between forced reloads. A stale-chunk reload lands on a fresh build
// and succeeds well inside this window; only a truly broken chunk fails again
// within it, so the error then propagates to the ErrorBoundary instead of
// looping.
const RELOAD_COOLDOWN_MS = 10_000;

const CHUNK_ERROR_RE =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS/i;

export function isChunkLoadError(err: unknown): boolean {
  return err instanceof Error && CHUNK_ERROR_RE.test(err.message);
}

// In-memory guard so several lazy routes failing in the same page load can't
// each trigger a reload (survives even if sessionStorage is unavailable). Reset
// naturally on the next page load.
let reloadedThisLoad = false;

/**
 * Force at most one page reload to recover from a stale deployed chunk.
 * Returns true if a reload was triggered.
 */
export function reloadOnceForStaleChunk(): boolean {
  if (reloadedThisLoad) return false;
  try {
    const last = Number(sessionStorage.getItem(RELOAD_TS_KEY) || 0);
    if (Date.now() - last <= RELOAD_COOLDOWN_MS) return false;
    sessionStorage.setItem(RELOAD_TS_KEY, String(Date.now()));
  } catch {
    // sessionStorage blocked (private mode / disabled) — the in-memory guard
    // above still prevents a same-load loop; proceed with a single reload.
  }
  reloadedThisLoad = true;
  window.location.reload();
  return true;
}

/**
 * Wrap a dynamic-import factory so a stale-chunk fetch failure reloads once
 * (see reloadOnceForStaleChunk) instead of rejecting. Any other error — or a
 * repeat failure inside the cooldown — propagates. Exported for testing;
 * consumers use lazyWithReload.
 */
export function withStaleChunkReload<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
): () => Promise<{ default: T }> {
  return async () => {
    try {
      return await factory();
    } catch (err) {
      if (isChunkLoadError(err) && reloadOnceForStaleChunk()) {
        // Never resolve: the reload replaces the page before React renders, so
        // Suspense keeps showing the fallback until navigation happens.
        return new Promise<{ default: T }>(() => {});
      }
      throw err;
    }
  };
}

/**
 * Drop-in replacement for React.lazy that survives deploys. On a stale-chunk
 * fetch failure it reloads once; any other error propagates so the
 * ErrorBoundary can render.
 */
export function lazyWithReload<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
) {
  return reactLazy(withStaleChunkReload(factory));
}
