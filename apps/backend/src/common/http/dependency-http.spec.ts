import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  closeDependencyHttpPools,
  DEPENDENCY_FETCH_POOL_OPTIONS,
  DEPENDENCY_NODE_AGENT_OPTIONS,
  fetchWithDependencyPool,
  getDependencyFetchDispatcher,
  getDependencyNodeAgents,
} from './dependency-http';

describe('dependency HTTP pools', () => {
  afterEach(async () => {
    jest.restoreAllMocks();
    await closeDependencyHttpPools();
  });

  it('uses a small, non-pipelined fetch pool with a single allowed origin', () => {
    expect(DEPENDENCY_FETCH_POOL_OPTIONS).toMatchObject({
      connections: 4,
      pipelining: 1,
      maxOrigins: 1,
      connectTimeout: 3_000,
      headersTimeout: 15_000,
      bodyTimeout: 20_000,
    });
  });

  it('keeps fetch pools isolated by dependency and reuses each dependency pool', () => {
    const firstResend = getDependencyFetchDispatcher('resend');

    expect(getDependencyFetchDispatcher('resend')).toBe(firstResend);
    expect(getDependencyFetchDispatcher('twilio')).not.toBe(firstResend);
  });

  it('passes the dependency dispatcher to the existing global fetch seam', async () => {
    const response = new Response(null, { status: 204 });
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(response);

    await expect(
      fetchWithDependencyPool('weather', 'https://weather.example/current'),
    ).resolves.toBe(response);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://weather.example/current',
      expect.objectContaining({
        dispatcher: getDependencyFetchDispatcher('weather'),
      }),
    );
  });

  it('uses a dispatcher compatible with the Node 24 fetch implementation', async () => {
    const server = createServer((_request, response) => {
      response.end('ok');
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });

    try {
      const { port } = server.address() as AddressInfo;
      const response = await fetchWithDependencyPool(
        'weather',
        `http://127.0.0.1:${port}/health`,
      );

      expect(response.status).toBe(200);
      await expect(response.text()).resolves.toBe('ok');
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it('bounds both per-origin and total Node sockets for SDK and axios clients', () => {
    expect(DEPENDENCY_NODE_AGENT_OPTIONS).toMatchObject({
      keepAlive: true,
      maxSockets: 4,
      maxTotalSockets: 4,
      maxFreeSockets: 2,
      timeout: 30_000,
    });

    const stripe = getDependencyNodeAgents('stripe');
    expect(stripe.httpsAgent.maxSockets).toBe(4);
    expect(stripe.httpsAgent.maxTotalSockets).toBe(4);
    expect(stripe.httpsAgent.maxFreeSockets).toBe(2);
  });

  it('keeps Node pools isolated by dependency and reuses each dependency pool', () => {
    const firstStripe = getDependencyNodeAgents('stripe');

    expect(getDependencyNodeAgents('stripe')).toBe(firstStripe);
    expect(getDependencyNodeAgents('r2')).not.toBe(firstStripe);
  });

  it('closes every created pool and permits clean recreation', async () => {
    const fetchPool = getDependencyFetchDispatcher('resend');
    const nodePools = getDependencyNodeAgents('stripe');
    const destroyFetch = jest
      .spyOn(fetchPool, 'destroy')
      .mockResolvedValue(undefined);
    const destroyHttp = jest.spyOn(nodePools.httpAgent, 'destroy');
    const destroyHttps = jest.spyOn(nodePools.httpsAgent, 'destroy');

    await closeDependencyHttpPools();

    expect(destroyFetch).toHaveBeenCalledTimes(1);
    expect(destroyHttp).toHaveBeenCalledTimes(1);
    expect(destroyHttps).toHaveBeenCalledTimes(1);
    expect(getDependencyFetchDispatcher('resend')).not.toBe(fetchPool);
    expect(getDependencyNodeAgents('stripe')).not.toBe(nodePools);
  });
});
