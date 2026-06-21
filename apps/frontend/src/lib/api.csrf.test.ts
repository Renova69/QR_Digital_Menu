import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./clientLogger', () => ({
  logApiError: vi.fn(),
}));

const headerValue = (headers: any, name: string) =>
  headers?.[name] ?? headers?.get?.(name) ?? headers?.get?.(name.toLowerCase());

describe('api CSRF handling', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('refreshes a stale CSRF token and retries the failed state-changing request once', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ csrfToken: 'stale-token' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ csrfToken: 'fresh-token' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const { default: api } = await import('./api');
    const csrfHeadersSeen: Array<string | undefined> = [];
    const adapter = vi.fn(async (config: any) => {
      csrfHeadersSeen.push(headerValue(config.headers, 'X-CSRF-Token'));
      if (adapter.mock.calls.length === 1) {
        return Promise.reject({
          config,
          response: {
            status: 403,
            data: { message: 'Invalid CSRF token' },
            headers: {},
          },
        });
      }

      return {
        data: { ok: true },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
        request: {},
      };
    });
    api.defaults.adapter = adapter;

    const response = await api.post('/payments/session/tok/checkout', {
      provider: 'STRIPE',
    });

    expect(response.data).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(adapter).toHaveBeenCalledTimes(2);
    expect(csrfHeadersSeen).toEqual(['stale-token', 'fresh-token']);
    expect(adapter.mock.calls[1][0]._csrfRetry).toBe(true);
  });
});
