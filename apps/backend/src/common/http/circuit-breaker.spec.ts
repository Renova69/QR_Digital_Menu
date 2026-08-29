import { CircuitBreaker, CircuitOpenError } from './circuit-breaker';

describe('CircuitBreaker', () => {
  let now: number;
  let transitions: jest.Mock;
  let breaker: CircuitBreaker;
  const down = new Error('unavailable');
  beforeEach(() => {
    now = 0;
    transitions = jest.fn();
    breaker = new CircuitBreaker({
      dependency: 'test',
      failureThreshold: 2,
      cooldownMs: 100,
      now: () => now,
      onTransition: transitions,
    });
  });
  async function open() {
    for (let i = 0; i < 2; i++)
      await expect(breaker.execute(() => Promise.reject(down))).rejects.toBe(
        down,
      );
  }
  it('preserves success values and never adds a retry', async () => {
    const work = jest.fn().mockResolvedValue({ id: 1 });
    await expect(breaker.execute(work)).resolves.toEqual({ id: 1 });
    expect(work).toHaveBeenCalledTimes(1);
  });
  it('stops invoking work after consecutive failures and reports the transition once', async () => {
    await open();
    const work = jest.fn();
    await expect(breaker.execute(work)).rejects.toMatchObject({
      code: 'DEPENDENCY_CIRCUIT_OPEN',
      retryAfterMs: 100,
    });
    expect(work).not.toHaveBeenCalled();
    expect(transitions.mock.calls).toEqual([['open']]);
  });
  it('resets failures after a healthy response', async () => {
    await expect(breaker.execute(() => Promise.reject(down))).rejects.toBe(
      down,
    );
    await breaker.execute(() => Promise.resolve('ok'));
    await expect(breaker.execute(() => Promise.reject(down))).rejects.toBe(
      down,
    );
    await expect(
      breaker.execute(() => Promise.resolve('still allowed')),
    ).resolves.toBe('still allowed');
  });
  it('allows only one half-open probe and recovers at the exact cooldown boundary', async () => {
    await open();
    now = 100;
    let finish!: (value: string) => void;
    const probe = breaker.execute(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    await expect(
      breaker.execute(() => Promise.resolve('competing')),
    ).rejects.toBeInstanceOf(CircuitOpenError);
    finish('recovered');
    await expect(probe).resolves.toBe('recovered');
    await expect(breaker.execute(() => Promise.resolve('next'))).resolves.toBe(
      'next',
    );
    expect(transitions.mock.calls).toEqual([
      ['open'],
      ['half-open'],
      ['closed'],
    ]);
  });
  it('reopens for a full cooldown after a failed probe', async () => {
    await open();
    now = 100;
    await expect(breaker.execute(() => Promise.reject(down))).rejects.toBe(
      down,
    );
    now = 199;
    await expect(
      breaker.execute(() => Promise.resolve('no')),
    ).rejects.toBeInstanceOf(CircuitOpenError);
    now = 200;
    await expect(breaker.execute(() => Promise.resolve('yes'))).resolves.toBe(
      'yes',
    );
  });
  it('ignores late success from an older generation', async () => {
    let finish!: (value: string) => void;
    const old = breaker.execute(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    await open();
    finish('old success');
    await old;
    await expect(
      breaker.execute(() => Promise.resolve('no')),
    ).rejects.toBeInstanceOf(CircuitOpenError);
  });
  it('does not let late failures extend the cooldown', async () => {
    let fail!: (reason: Error) => void;
    const old = breaker.execute(
      () =>
        new Promise<string>((_, reject) => {
          fail = reject;
        }),
    );
    const rejected = expect(old).rejects.toBe(down);
    await open();
    now = 80;
    fail(down);
    await rejected;
    now = 100;
    await expect(breaker.execute(() => Promise.resolve('ok'))).resolves.toBe(
      'ok',
    );
  });
  it('preserves provider 5xx responses while counting them', async () => {
    const response = { status: 503 };
    for (let i = 0; i < 2; i++)
      await expect(
        breaker.execute(() => Promise.resolve(response), {
          failedResponse: (r) => r.status >= 500,
        }),
      ).resolves.toBe(response);
    await expect(
      breaker.execute(() => Promise.resolve(response)),
    ).rejects.toBeInstanceOf(CircuitOpenError);
  });
  it('does not count customer errors as dependency failures', async () => {
    for (let i = 0; i < 10; i++)
      await expect(
        breaker.execute(() => Promise.reject(down), { error: () => 'healthy' }),
      ).rejects.toBe(down);
    expect(transitions).not.toHaveBeenCalled();
  });
  it('releases a cancelled probe without permanently wedging half-open', async () => {
    await open();
    now = 100;
    await expect(
      breaker.execute(() => Promise.reject(down), { error: () => 'ignored' }),
    ).rejects.toBe(down);
    await expect(
      breaker.execute(() => Promise.resolve('next probe')),
    ).resolves.toBe('next probe');
  });
  it('does not let telemetry failure change the provider outcome', async () => {
    transitions.mockImplementation(() => {
      throw new Error('telemetry unavailable');
    });
    await open();
    await expect(
      breaker.execute(() => Promise.resolve('no')),
    ).rejects.toBeInstanceOf(CircuitOpenError);
  });
});
