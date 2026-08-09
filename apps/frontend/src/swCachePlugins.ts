/**
 * Workbox's NetworkFirst only falls back to the cache when the network call
 * REJECTS. An HTTP 5xx is a *fulfilled* response, so by default the strategy
 * hands the error straight to the page and never consults the cache — exactly
 * when the server is failing and the cache is most useful.
 *
 * Treating 5xx as a network failure makes the cached public menu serve during a
 * backend outage. 4xx is deliberately left alone: a 404 for a deleted menu or a
 * 403 for a disabled restaurant is a real answer, and serving a stale menu over
 * it would show guests a menu that no longer exists.
 */
export const SERVER_ERROR_THRESHOLD = 500;

export const treatServerErrorsAsFailures = {
  fetchDidSucceed: async ({ response }: { response: Response }) => {
    if (response.status >= SERVER_ERROR_THRESHOLD) {
      throw new Error(`Upstream returned ${response.status}`);
    }
    return response;
  },
};
