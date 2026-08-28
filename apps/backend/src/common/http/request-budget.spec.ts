import { getEventListeners } from 'node:events';
import { firstValueFrom, Observable, of } from 'rxjs';
import type { ExecutionContext } from '@nestjs/common';
import {
  assertRequestBudget,
  currentRequestBudget,
  RequestBudget,
  RequestBudgetError,
  requestBudgetSignal,
  withRequestBudget,
  withoutRequestBudget,
} from './request-budget';
import { RequestBudgetInterceptor } from './request-budget.interceptor';

describe('shared request budget', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('gives a second call only the two seconds left after a three-second first call', () => {
    const budget = new RequestBudget(5_000);
    withRequestBudget(budget, () => {
      const firstSignal = requestBudgetSignal();
      jest.advanceTimersByTime(3_000);
      expect(budget.remainingMs()).toBe(2_000);
      expect(requestBudgetSignal()).toBe(firstSignal);
      jest.advanceTimersByTime(2_000);
      expect(budget.remainingMs()).toBe(0);
      expect(firstSignal?.reason).toMatchObject({ kind: 'deadline' });
      expect(assertRequestBudget).toThrow(RequestBudgetError);
    });
    budget.close();
  });

  it('uses a server-owned 25-second default', () => {
    const budget = new RequestBudget();
    jest.advanceTimersByTime(24_999);
    expect(budget.signal.aborted).toBe(false);
    jest.advanceTimersByTime(1);
    expect(budget.signal.aborted).toBe(true);
    budget.close();
  });

  it('enforces an elapsed deadline even before its delayed timer gets a turn', () => {
    const budget = new RequestBudget(100);
    jest.spyOn(performance, 'now').mockReturnValue(101);
    expect(budget.signal.aborted).toBe(true);
    jest.restoreAllMocks();
    budget.close();
  });

  it.each([0, -1, Infinity, NaN])('rejects invalid duration %s', (duration) => {
    expect(() => new RequestBudget(duration)).toThrow('positive finite');
  });

  it('preserves a shorter provider timeout and does not cancel sibling calls', () => {
    const budget = new RequestBudget(5_000);
    const provider = new AbortController();
    withRequestBudget(budget, () => {
      const merged = requestBudgetSignal(provider.signal);
      provider.abort(new Error('provider timeout'));
      expect(merged?.reason).toEqual(new Error('provider timeout'));
      expect(budget.signal.aborted).toBe(false);
    });
    budget.close();
  });

  it('propagates the request deadline when it is shorter than the provider timeout', () => {
    const budget = new RequestBudget(100);
    withRequestBudget(budget, () => {
      const provider = new AbortController();
      const merged = requestBudgetSignal(provider.signal);
      jest.advanceTimersByTime(100);
      expect(merged?.reason).toBe(budget.signal.reason);
      expect(provider.signal.aborted).toBe(false);
    });
    budget.close();
  });

  it('isolates interleaved async requests and restores the outer context', async () => {
    const first = new RequestBudget(100);
    const second = new RequestBudget(1_000);
    const observed = await Promise.all([
      withRequestBudget(first, async () => {
        await Promise.resolve();
        return currentRequestBudget();
      }),
      withRequestBudget(second, async () => {
        await Promise.resolve();
        return currentRequestBudget();
      }),
    ]);
    expect(observed).toEqual([first, second]);
    jest.advanceTimersByTime(100);
    expect(first.signal.aborted).toBe(true);
    expect(second.signal.aborted).toBe(false);
    expect(currentRequestBudget()).toBeUndefined();
    first.close();
    second.close();
  });

  it('detaches background continuations without losing the foreground budget', async () => {
    const budget = new RequestBudget(100);
    await withRequestBudget(budget, async () => {
      const job = withoutRequestBudget(async () => {
        await Promise.resolve();
        return requestBudgetSignal();
      });
      expect(currentRequestBudget()).toBe(budget);
      budget.close();
      await expect(job).resolves.toBeUndefined();
    });
  });

  it('leaves cron/provider-only calls unchanged', () => {
    const provider = new AbortController();
    expect(requestBudgetSignal()).toBeUndefined();
    expect(requestBudgetSignal(provider.signal)).toBe(provider.signal);
    expect(assertRequestBudget).not.toThrow();
  });

  it('cleans its timer and refuses late foreground work after the response closes', () => {
    const budget = new RequestBudget(500);
    budget.close();
    budget.close();
    expect(jest.getTimerCount()).toBe(0);
    withRequestBudget(budget, () => {
      expect(assertRequestBudget).toThrow(RequestBudgetError);
      expect(budget.signal.reason).toMatchObject({ kind: 'closed' });
    });
  });
});

describe('request budget interceptor', () => {
  const interceptor = new RequestBudgetInterceptor();
  const http = { getType: () => 'http' } as ExecutionContext;

  it('does not open HTTP context for another transport', async () => {
    const context = {
      getType: () => 'ws',
      switchToHttp: jest.fn(() => {
        throw new Error('not HTTP');
      }),
    } as unknown as ExecutionContext;
    await expect(
      firstValueFrom(
        interceptor.intercept(context, { handle: () => of('ok') }),
      ),
    ).resolves.toBe('ok');
    expect(context.switchToHttp).not.toHaveBeenCalled();
  });

  it('binds a cold subscription to its original request and removes its listener', async () => {
    const budget = new RequestBudget(1_000);
    const result = withRequestBudget(budget, () =>
      interceptor.intercept(http, {
        handle: () =>
          new Observable((subscriber) => {
            subscriber.next(currentRequestBudget());
            subscriber.complete();
          }),
      }),
    );
    await expect(firstValueFrom(result)).resolves.toBe(budget);
    expect(getEventListeners(budget.signal, 'abort')).toHaveLength(0);
    budget.close();
  });

  it('unsubscribes a hung handler on cancellation and removes its listener', async () => {
    const budget = new RequestBudget(1_000);
    const teardown = jest.fn();
    const result = withRequestBudget(budget, () =>
      interceptor.intercept(http, {
        handle: () => new Observable(() => teardown),
      }),
    );
    const pending = firstValueFrom(result);
    const rejected = expect(pending).rejects.toBeInstanceOf(RequestBudgetError);
    budget.close();
    await rejected;
    expect(teardown).toHaveBeenCalledTimes(1);
    expect(getEventListeners(budget.signal, 'abort')).toHaveLength(0);
  });

  it('does not invoke the handler if the budget expired during guards', async () => {
    const budget = new RequestBudget(1_000);
    budget.close();
    const handle = jest.fn(() => of('should not run'));
    const result = withRequestBudget(budget, () =>
      interceptor.intercept(http, { handle }),
    );
    await expect(firstValueFrom(result)).rejects.toBeInstanceOf(
      RequestBudgetError,
    );
    expect(handle).not.toHaveBeenCalled();
  });

  it('removes its cancellation listener if handle throws synchronously', async () => {
    const budget = new RequestBudget(1_000);
    const result = withRequestBudget(budget, () =>
      interceptor.intercept(http, {
        handle: () => {
          throw new Error('handler setup failed');
        },
      }),
    );
    await expect(firstValueFrom(result)).rejects.toThrow(
      'handler setup failed',
    );
    expect(getEventListeners(budget.signal, 'abort')).toHaveLength(0);
    budget.close();
  });
});
