import { Logger } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { redactDiagnosticText } from './logging/redact-secrets';

/**
 * A fatal error is one the process cannot continue past: a failed boot, or a
 * rejected promise nobody observed. Both mean some part of the application is
 * in a state no request handler ever accounted for.
 *
 * The policy is deliberately narrow and always the same: report it once, give
 * Sentry a bounded window to deliver the event, then terminate with a non-zero
 * code so Cloud Run replaces the instance. Logging and carrying on is not an
 * option — after an unhandled rejection the process keeps serving traffic with
 * an unknown amount of work silently abandoned, which is exactly the failure
 * mode that looks like "the app is fine" right up until the data says
 * otherwise.
 */

/**
 * How long Sentry gets to deliver the event before the process exits anyway.
 * Short on purpose: a wedged process that will not die is worse than a lost
 * event, and Cloud Run's shutdown grace is not generous.
 */
export const FATAL_FLUSH_TIMEOUT_MS = 2_000;

/**
 * Extra grace on top of the flush's own deadline. `Sentry.flush` is documented
 * to resolve `false` on timeout, but this path must not depend on a transport
 * honouring its own contract while the process is already in a bad state.
 */
export const FLUSH_WATCHDOG_GRACE_MS = 500;

export interface FatalErrorDeps {
  captureException?: (exception: unknown) => unknown;
  flush?: (timeout: number) => Promise<boolean>;
  exit?: (code: number) => void;
  logger?: Pick<Logger, 'error'>;
}

const defaultLogger = new Logger('FatalError');

let fatalHandled = false;

/** Test seam: the module-level latch would otherwise survive between cases. */
export function resetFatalErrorState(): void {
  fatalHandled = false;
}

function renderReason(reason: unknown): string {
  if (typeof reason === 'string') return reason;
  try {
    return JSON.stringify(reason) ?? String(reason);
  } catch {
    // Circular structures, BigInt, throwing getters.
    return Object.prototype.toString.call(reason);
  }
}

/**
 * `throw 'boom'` and `Promise.reject({ code: 500 })` are both legal. Sentry
 * groups non-Error values poorly and loses the stack entirely, so normalise to
 * an Error that records both where it came from and what the value was.
 */
export function toFatalError(reason: unknown, origin: string): Error {
  if (reason instanceof Error) return reason;
  return new Error(
    `Fatal non-Error value from ${origin}: ${renderReason(reason)}`,
  );
}

async function flushWithin(
  flush: (timeout: number) => Promise<boolean>,
  timeoutMs: number,
): Promise<void> {
  let watchdog: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      flush(timeoutMs),
      new Promise<void>((resolve) => {
        watchdog = setTimeout(resolve, timeoutMs + FLUSH_WATCHDOG_GRACE_MS);
        // Keep this timer referenced deliberately. During an early bootstrap
        // failure there may be no other active handles, so unref() would let
        // Node exit naturally with code 0 before the mandatory exit(1).
      }),
    ]);
  } finally {
    if (watchdog) clearTimeout(watchdog);
  }
}

/**
 * The single fatal path, shared by `bootstrap().catch()` and the
 * `unhandledRejection` listener. Idempotent: the first caller wins and every
 * later one returns immediately, so a boot failure that also rejects a
 * background promise reports once and exits once rather than racing itself
 * through capture, flush and `process.exit`.
 *
 * Termination is unconditional. A failed or timed-out flush costs one event;
 * skipping the exit would leave a process running in the state that produced
 * the error in the first place.
 */
export async function handleFatalError(
  reason: unknown,
  origin: string,
  deps: FatalErrorDeps = {},
): Promise<void> {
  if (fatalHandled) return;
  fatalHandled = true;

  const {
    captureException = Sentry.captureException,
    flush = Sentry.flush,
    exit = (code: number) => process.exit(code),
    logger = defaultLogger,
  } = deps;

  const error = toFatalError(reason, origin);

  try {
    const safeMessage = redactDiagnosticText(error.message);
    const safeStack = error.stack
      ? redactDiagnosticText(error.stack)
      : undefined;
    logger.error(`Fatal error (${origin}): ${safeMessage}`, safeStack);
  } catch {
    // A logger that throws must not be the reason the process survives.
  }

  try {
    captureException(error);
  } catch {
    // Same: reporting is best effort, terminating is not.
  }

  try {
    await flushWithin(flush, FATAL_FLUSH_TIMEOUT_MS);
  } catch {
    // Flush rejected. Nothing left to do but exit, which happens next.
  }

  exit(1);
}

/**
 * Registers the `unhandledRejection` listener and returns its uninstaller.
 *
 * Call this *before* `bootstrap()`: a rejection thrown while the application
 * is still wiring itself up is exactly the kind that has no other observer,
 * and Node's default for an unhandled rejection is to terminate with no report
 * at all.
 *
 * The uninstaller exists for tests — a suite that installs listeners without
 * removing them leaks them across files and eventually trips Node's
 * max-listeners warning.
 */
export function installFatalErrorHandlers(
  deps: FatalErrorDeps = {},
): () => void {
  const onUnhandledRejection = (reason: unknown) => {
    void handleFatalError(reason, 'unhandledRejection', deps);
  };

  process.on('unhandledRejection', onUnhandledRejection);

  return () => {
    process.off('unhandledRejection', onUnhandledRejection);
  };
}
