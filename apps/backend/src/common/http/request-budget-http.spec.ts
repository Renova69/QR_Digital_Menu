jest.mock('@sentry/nestjs', () => ({
  captureException: jest.fn(),
  setUser: jest.fn(),
  setTag: jest.fn(),
}));

import {
  Controller,
  Get,
  Injectable,
  UseGuards,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as Sentry from '@sentry/nestjs';
import { get as httpGet, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import request from 'supertest';
import { AllExceptionsFilter } from '../filters/all-exceptions.filter';
import { requestBudgetMiddleware } from './request-budget.middleware';
import { RequestBudgetInterceptor } from './request-budget.interceptor';
import {
  currentRequestBudget,
  type RequestBudget,
  withoutRequestBudget,
} from './request-budget';

@Injectable()
class NeverFinishingGuard {
  canActivate(): Promise<boolean> {
    return new Promise(() => {});
  }
}

@Injectable()
class Probe {
  seen?: RequestBudget;
  entered: () => void = () => {};
  background?: Promise<RequestBudget | undefined>;
  foregroundCalls = 0;
}

@Controller()
class ProbeController {
  constructor(private readonly probe: Probe) {}

  @Get('ok')
  ok() {
    this.probe.seen = currentRequestBudget();
    return { ok: true };
  }

  @Get('hung')
  hung(): Promise<never> {
    this.probe.seen = currentRequestBudget();
    this.probe.entered();
    return new Promise(() => {});
  }

  @Get('late-rejection')
  async lateRejection() {
    await delay(250);
    throw new Error('late provider failure');
  }

  @UseGuards(NeverFinishingGuard)
  @Get('guard')
  guarded() {
    this.probe.foregroundCalls++;
    return { ok: true };
  }

  @Get('background')
  background() {
    this.probe.seen = currentRequestBudget();
    this.probe.background = withoutRequestBudget(async () => {
      await delay(150);
      return currentRequestBudget();
    });
    return { accepted: true };
  }
}

describe('request deadline through the Nest HTTP lifecycle', () => {
  let app: INestApplication;
  let probe: Probe;
  let server: Server;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [ProbeController],
      providers: [Probe, NeverFinishingGuard],
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.use(requestBudgetMiddleware(100));
    app.useGlobalInterceptors(new RequestBudgetInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.listen(0, '127.0.0.1');
    probe = app.get(Probe);
    server = app.getHttpServer() as Server;
  });

  afterEach(async () => {
    server.closeAllConnections();
    await app.close();
  });

  it('closes a completed request budget without emitting a later timeout', async () => {
    await request(server).get('/ok').expect(200, { ok: true });
    expect(probe.seen?.signal.aborted).toBe(true);
    await delay(130);
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('bounds a hung handler and ignores a caller-supplied timeout extension', async () => {
    const response = await request(server)
      .get('/hung')
      .set('x-request-timeout', '600000')
      .expect(504);
    expect(response.body).toMatchObject({
      code: 'REQUEST_DEADLINE_EXCEEDED',
      statusCode: 504,
    });
    expect(response.body.message).toContain('may still complete');
    expect(probe.seen?.signal.aborted).toBe(true);
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error), {
      tags: { subsystem: 'request-budget' },
    });
  });

  it('bounds a hung guard before interceptors run without executing the handler', async () => {
    await request(server).get('/guard').expect(504);
    expect(probe.foregroundCalls).toBe(0);
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it('still responds if timeout telemetry fails', async () => {
    jest.mocked(Sentry.captureException).mockImplementationOnce(() => {
      throw new Error('telemetry unavailable');
    });
    await request(server).get('/hung').expect(504);
    expect(probe.seen?.signal.aborted).toBe(true);
  });

  it('observes a timed-out handler rejection without an unhandled rejection or duplicate report', async () => {
    await request(server).get('/late-rejection').expect(504);
    await delay(200);
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it('cancels foreground work when the client disconnects, without reporting an outage', async () => {
    const entered = new Promise<void>((resolve) => {
      probe.entered = resolve;
    });
    const port = (server.address() as AddressInfo).port;
    const client = httpGet(`http://127.0.0.1:${port}/hung`);
    client.on('error', () => {});
    await entered;
    const closed = new Promise<void>((resolve) => {
      probe.seen!.signal.addEventListener('abort', () => resolve(), {
        once: true,
      });
    });
    client.destroy();
    await closed;
    expect(probe.seen?.signal.reason).toMatchObject({ kind: 'closed' });
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('lets explicitly detached work outlive a successful response', async () => {
    await request(server).get('/background').expect(200, { accepted: true });
    expect(probe.seen?.signal.aborted).toBe(true);
    await expect(probe.background).resolves.toBeUndefined();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});
