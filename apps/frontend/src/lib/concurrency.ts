/**
 * Run `worker` over `items` with at most `limit` in flight at once (L-TRANS-3).
 *
 * The public menu fetches every category's items in parallel, and each fetch in
 * a non-default language can trigger an on-demand DeepL translation on the
 * backend. Firing all of them at once bursts the translation provider and
 * queues behind the browser's per-host connection cap. A small fixed pool keeps
 * throughput high while bounding the burst.
 *
 * `worker` is expected to handle its own errors (this never rejects); a throw is
 * swallowed so one bad item can't stall the pool.
 */
export async function runWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  const size = Math.max(1, Math.min(limit, items.length));
  let cursor = 0;

  const runner = async (): Promise<void> => {
    while (cursor < items.length) {
      const index = cursor++;
      try {
        await worker(items[index], index);
      } catch {
        // Worker owns its error handling; never let one item stall the pool.
      }
    }
  };

  await Promise.all(Array.from({ length: size }, () => runner()));
}
