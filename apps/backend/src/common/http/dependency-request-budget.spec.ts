import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import axios from 'axios';
import Stripe from 'stripe';
import { GoogleStrategy } from '../../auth/google.strategy';
import {
  closeDependencyHttpPools,
  fetchWithDependencyPool,
  getDependencyNodeAgents,
} from './dependency-http';
import {
  RequestBudget,
  requestBudgetDelay,
  requestBudgetSignal,
  withRequestBudget,
} from './request-budget';
import { createStripeHttpClient } from './stripe-http-client';

describe('request deadlines through real local transports (no remote services)', () => {
  let server: Server;
  let origin: string;
  let handle: (req: IncomingMessage, res: ServerResponse) => void;
  const budgets: RequestBudget[] = [];

  function budget(ms = 2_000) {
    const value = new RequestBudget(ms);
    budgets.push(value);
    return value;
  }

  beforeEach(async () => {
    handle = (_req, res) => res.end('ok');
    server = createServer((req, res) => handle(req, res));
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    budgets.splice(0).forEach((value) => value.close());
    await closeDependencyHttpPools();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('keeps cancellation attached after fetch headers, until its body is consumed', async () => {
    handle = (_req, res) => {
      res.writeHead(200);
      res.write('partial');
    };
    const requestBudget = budget();
    const response = await withRequestBudget(requestBudget, () =>
      fetchWithDependencyPool('resend', origin),
    );
    const rejected = expect(response.text()).rejects.toThrow();
    requestBudget.close();
    await rejected;
  });

  it('aborts active AND pool-queued fetches without admitting the queued request later', async () => {
    let received = 0;
    let ready!: () => void;
    const fourActive = new Promise<void>((resolve) => {
      ready = resolve;
    });
    handle = () => {
      if (++received === 4) ready();
    };
    const requestBudget = budget();
    const calls = withRequestBudget(requestBudget, () =>
      Array.from({ length: 5 }, () =>
        fetchWithDependencyPool('resend', origin),
      ),
    );
    const settled = Promise.allSettled(calls);
    await fourActive;
    requestBudget.close();
    expect(
      (await settled).every((result) => result.status === 'rejected'),
    ).toBe(true);
    await delay(20);
    expect(received).toBe(4);
  });

  it('does not start a fetch with an already-exhausted budget', async () => {
    const received = jest.fn();
    handle = (req, res) => {
      received(req.url);
      res.end('ok');
    };
    const requestBudget = budget();
    requestBudget.close();
    await expect(
      withRequestBudget(requestBudget, () =>
        fetchWithDependencyPool('resend', origin),
      ),
    ).rejects.toThrow('Request is no longer active');
    expect(received).not.toHaveBeenCalled();
  });

  it('preserves cancellation carried by a Request object and a shorter provider timeout', async () => {
    handle = () => {};
    const requestBudget = budget();
    const provider = new AbortController();
    const pending = withRequestBudget(requestBudget, () =>
      fetchWithDependencyPool(
        'resend',
        new Request(origin, { signal: provider.signal }),
      ),
    );
    const rejected = expect(pending).rejects.toThrow('provider timeout');
    provider.abort(new Error('provider timeout'));
    await rejected;
    expect(requestBudget.signal.aborted).toBe(false);
  });

  it('cancels an axios request without waiting for its longer provider timeout', async () => {
    handle = () => {};
    const requestBudget = budget(100);
    await expect(
      withRequestBudget(requestBudget, () =>
        axios.get(origin, {
          proxy: false,
          timeout: 5_000,
          httpAgent: getDependencyNodeAgents('deepl').httpAgent,
          signal: requestBudgetSignal(),
        }),
      ),
    ).rejects.toMatchObject({ code: 'ERR_CANCELED' });
  });

  it('interrupts a retry wait instead of refreshing the deadline', async () => {
    const requestBudget = budget(100);
    const retry = jest.fn();
    const pending = withRequestBudget(requestBudget, async () => {
      await requestBudgetDelay(30_000);
      retry();
    });
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(retry).not.toHaveBeenCalled();
  });

  it('cancels the real R2/S3 SDK transport with the shared signal', async () => {
    let received = 0;
    handle = () => {
      received++;
    };
    // Smithy's HTTP-only local-test path dynamically imports node:http. Run the
    // unmodified SDK in normal Node, not Jest's VM (which rejects that import).
    // Production HTTPS does not take that path; no global Jest flags or mocks.
    const script = `
      const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');
      const { NodeHttpHandler } = require('@smithy/node-http-handler');
      const { RequestBudget, withRequestBudget, requestBudgetSignal } = require('./src/common/http/request-budget');
      const endpoint = process.argv[1];
      if (new URL(endpoint).hostname !== '127.0.0.1') throw new Error('Local test only');
      const client = new S3Client({
        endpoint, region: 'auto', forcePathStyle: true, maxAttempts: 2, defaultsMode: 'standard',
        credentials: { accessKeyId: 'test-key', secretAccessKey: 'test-secret' },
        requestHandler: new NodeHttpHandler({ requestTimeout: 5000 })
      });
      const budget = new RequestBudget(700);
      withRequestBudget(budget, () => client.send(new ListObjectsV2Command({ Bucket: 'test-bucket' }), {
        abortSignal: requestBudgetSignal()
      })).then(() => { process.exitCode = 1; }, error => {
        if (error.name !== 'AbortError') { process.exitCode = 1; console.error(error.name); }
        else console.log('aborted');
      }).finally(() => { budget.close(); client.destroy(); });
    `;
    const { stdout } = await promisify(execFile)(
      process.execPath,
      ['-r', 'ts-node/register/transpile-only', '-e', script, origin],
      { cwd: resolve(__dirname, '../../..'), timeout: 10_000 },
    );
    expect(stdout.trim()).toBe('aborted');
    expect(received).toBe(1);
  }, 15_000);

  it('preserves Stripe idempotency and does not send a retry after the deadline', async () => {
    const keys: Array<string | undefined> = [];
    handle = (req) => {
      keys.push(req.headers['idempotency-key'] as string | undefined);
    };
    const stripe = new Stripe('test-secret', {
      host: '127.0.0.1',
      port: (server.address() as AddressInfo).port,
      protocol: 'http',
      timeout: 5_000,
      maxNetworkRetries: 1,
      httpClient: createStripeHttpClient(),
    });
    await expect(
      withRequestBudget(budget(200), () =>
        stripe.paymentIntents.create(
          { amount: 500, currency: 'eur' },
          { idempotencyKey: 'existing-order-id' },
        ),
      ),
    ).rejects.toThrow();
    expect(keys).toEqual(['existing-order-id']);
  });

  it('cancels a stalled Stripe response body, not only its header wait', async () => {
    handle = (_req, res) => {
      res.writeHead(200);
      res.write('{"id":');
    };
    const stripe = new Stripe('test-secret', {
      host: '127.0.0.1',
      port: (server.address() as AddressInfo).port,
      protocol: 'http',
      timeout: 5_000,
      maxNetworkRetries: 0,
      httpClient: createStripeHttpClient(),
    });
    await expect(
      withRequestBudget(budget(200), () =>
        stripe.paymentIntents.retrieve('pi_test'),
      ),
    ).rejects.toThrow();
  });

  it('propagates cancellation through the real passport Google OAuth transport seam', async () => {
    handle = () => {};
    const strategy = new GoogleStrategy();
    // Only this test instance uses HTTP; production retains its HTTPS Google pool.
    strategy['_oauth2'].setAgent(
      getDependencyNodeAgents('google-oauth').httpAgent,
    );
    const pending = withRequestBudget(
      budget(100),
      () =>
        new Promise((resolve, reject) => {
          strategy['_oauth2'].get(origin, 'test-secret', (error, data) => {
            if (error)
              reject(new Error('OAuth transport failed', { cause: error }));
            else resolve(data);
          });
        }),
    );
    await expect(pending).rejects.toMatchObject({
      cause: { name: 'AbortError', code: 'ABORT_ERR' },
    });
  });

  it('retains the Stripe provider body timeout even outside an inbound request', async () => {
    handle = (_req, res) => {
      res.writeHead(200);
      res.write('{"id":');
    };
    const stripe = new Stripe('test-secret', {
      host: '127.0.0.1',
      port: (server.address() as AddressInfo).port,
      protocol: 'http',
      timeout: 100,
      maxNetworkRetries: 0,
      httpClient: createStripeHttpClient(),
    });
    await expect(stripe.paymentIntents.retrieve('pi_test')).rejects.toThrow();
  });
});
