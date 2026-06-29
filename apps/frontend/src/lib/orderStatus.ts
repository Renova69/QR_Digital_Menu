/**
 * After an optimistic batch status update, restore only the orders whose server
 * call failed back to their pre-update status, leaving the successful ones in
 * their new (optimistic) status. Operates on the latest array passed in, so it
 * is safe to call from a functional `setState` updater even if other events
 * mutated the list in between.
 */
export function revertFailedOrders<T extends { id: string; status: string }>(
  current: T[],
  previous: readonly T[],
  failedIds: Iterable<string>,
): T[] {
  const failed = new Set(failedIds);
  if (failed.size === 0) return current;

  const previousStatus = new Map<string, T["status"]>(
    previous.map((order) => [order.id, order.status]),
  );

  return current.map((order) =>
    failed.has(order.id) && previousStatus.has(order.id)
      ? { ...order, status: previousStatus.get(order.id)! }
      : order,
  ) as T[];
}
