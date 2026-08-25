import {
  FATAL_FLUSH_TIMEOUT_MS,
  handleFatalError,
  installFatalErrorHandlers,
  resetFatalErrorState,
  toFatalError,
} from './fatal-error';

interface MockedDeps {
  captureException: jest.Mock;
  flush: jest.Mock;
  exit: jest.Mock;
  logger: { error: jest.Mock };
}

function buildDeps(overrides: Partial<MockedDeps> = {}): MockedDeps {
  return {
    captureException: jest.fn(),
    flush: jest.fn().mockResolvedValue(true),
    exit: jest.fn(),
    logger: { error: jest.fn() },
    ...overrides,
  };
}

describe('handleFatalError', () => {
  beforeEach(() => {
    resetFatalErrorState();
  });

  it('reports the error, flushes within the deadline, and exits non-zero', async () => {
    const deps = buildDeps();
    const failure = new Error('boot failed');

    await handleFatalError(failure, 'bootstrap', deps);

    expect(deps.captureException).toHaveBeenCalledWith(failure);
    expect(deps.flush).toHaveBeenCalledWith(FATAL_FLUSH_TIMEOUT_MS);
    expect(deps.exit).toHaveBeenCalledWith(1);
  });

  it('reports and exits exactly once when two fatal signals arrive', async () => {
    const deps = buildDeps();

    await handleFatalError(new Error('first'), 'bootstrap', deps);
    await handleFatalError(new Error('second'), 'unhandledRejection', deps);

    expect(deps.captureException).toHaveBeenCalledTimes(1);
    expect(deps.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'first' }),
    );
    expect(deps.exit).toHaveBeenCalledTimes(1);
  });

  it('still exits when the flush rejects', async () => {
    const deps = buildDeps({
      flush: jest.fn().mockRejectedValue(new Error('transport down')),
    });

    await handleFatalError(new Error('boom'), 'bootstrap', deps);

    expect(deps.exit).toHaveBeenCalledWith(1);
  });

  it('still exits when the flush resolves false, having sent nothing', async () => {
    const deps = buildDeps({ flush: jest.fn().mockResolvedValue(false) });

    await handleFatalError(new Error('boom'), 'bootstrap', deps);

    expect(deps.exit).toHaveBeenCalledWith(1);
  });

  it('exits on the watchdog when the flush never settles', async () => {
    jest.useFakeTimers();
    try {
      // A flush that ignores its own timeout contract: the process must still
      // die, or a broken transport keeps a bad instance serving traffic.
      const deps = buildDeps({
        flush: jest.fn().mockReturnValue(new Promise(() => {})),
      });

      const pending = handleFatalError(new Error('boom'), 'bootstrap', deps);
      await jest.advanceTimersByTimeAsync(FATAL_FLUSH_TIMEOUT_MS + 500);
      await pending;

      expect(deps.exit).toHaveBeenCalledWith(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('exits even when the logger throws', async () => {
    const deps = buildDeps({
      logger: {
        error: jest.fn(() => {
          throw new Error('logger unavailable');
        }),
      },
    });

    await handleFatalError(new Error('boom'), 'bootstrap', deps);

    expect(deps.exit).toHaveBeenCalledWith(1);
  });

  it('exits even when capturing throws', async () => {
    const deps = buildDeps({
      captureException: jest.fn(() => {
        throw new Error('sentry not initialised');
      }),
    });

    await handleFatalError(new Error('boom'), 'bootstrap', deps);

    expect(deps.exit).toHaveBeenCalledWith(1);
  });

  it.each([
    ['a string', 'plain string rejection', 'plain string rejection'],
    ['an object', { code: 500 }, '{"code":500}'],
    ['null', null, 'null'],
    ['undefined', undefined, 'undefined'],
  ])(
    'normalises %s reason into a reportable Error',
    async (_label, reason, rendered) => {
      const deps = buildDeps();

      await handleFatalError(reason, 'unhandledRejection', deps);

      expect(deps.captureException).toHaveBeenCalledWith(expect.any(Error));
      const captured = deps.captureException.mock.calls[0][0] as Error;
      expect(captured.message).toBe(
        `Fatal non-Error value from unhandledRejection: ${rendered}`,
      );
      expect(deps.exit).toHaveBeenCalledWith(1);
    },
  );

  it('survives a reason that cannot be serialised', async () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const deps = buildDeps();

    await handleFatalError(circular, 'unhandledRejection', deps);

    const captured = deps.captureException.mock.calls[0][0] as Error;
    expect(captured.message).toContain('[object Object]');
    expect(deps.exit).toHaveBeenCalledWith(1);
  });
});

describe('toFatalError', () => {
  it('passes an Error through untouched, preserving its stack', () => {
    const original = new Error('original');

    expect(toFatalError(original, 'bootstrap')).toBe(original);
  });
});

describe('installFatalErrorHandlers', () => {
  beforeEach(() => {
    resetFatalErrorState();
  });

  it('handles an unhandled rejection through the shared fatal path', async () => {
    const deps = buildDeps();
    const uninstall = installFatalErrorHandlers(deps);

    try {
      process.emit(
        'unhandledRejection',
        new Error('nobody awaited me'),
        Promise.resolve(),
      );
      // The listener is synchronous but the handler is not; yield to it.
      await Promise.resolve();
      await Promise.resolve();

      expect(deps.captureException).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'nobody awaited me' }),
      );
    } finally {
      uninstall();
    }
  });

  it('removes only its own listener, leaving the process as it found it', () => {
    const before = process.listenerCount('unhandledRejection');

    const uninstall = installFatalErrorHandlers(buildDeps());
    expect(process.listenerCount('unhandledRejection')).toBe(before + 1);

    uninstall();
    expect(process.listenerCount('unhandledRejection')).toBe(before);
  });

  it('is safe to uninstall twice', () => {
    const before = process.listenerCount('unhandledRejection');
    const uninstall = installFatalErrorHandlers(buildDeps());

    uninstall();
    uninstall();

    expect(process.listenerCount('unhandledRejection')).toBe(before);
  });
});
