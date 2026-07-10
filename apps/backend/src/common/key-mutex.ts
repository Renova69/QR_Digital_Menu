const locks = new Map<string, Promise<unknown>>();

/**
 * Runs `fn` exclusively with respect to any other call currently running
 * under the same `key` on this process — calls for the same key queue and
 * run one at a time in order; calls for different keys run fully in
 * parallel. Used to close the check-then-act gap between counting an R2
 * object's remaining references and physically deleting it (two concurrent
 * deletes of rows sharing the same image URL could otherwise both see a
 * stale reference count and race).
 *
 * Single-process only — does not coordinate across multiple server
 * instances/replicas.
 */
export function withKeyLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prior = locks.get(key) ?? Promise.resolve();
  const run = prior.then(fn, fn);
  const tracked = run.then(
    () => undefined,
    () => undefined,
  );
  locks.set(key, tracked);
  void tracked.then(() => {
    if (locks.get(key) === tracked) locks.delete(key);
  });
  return run;
}
