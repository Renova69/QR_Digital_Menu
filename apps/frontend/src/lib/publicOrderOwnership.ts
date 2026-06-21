const OWNED_ORDERS_PREFIX = 'public-owned-orders';

function ownedOrdersKey(
  restaurantId: string,
  tableNumber: string,
  sessionToken: string,
) {
  return `${OWNED_ORDERS_PREFIX}:${restaurantId}:${tableNumber}:${sessionToken}`;
}

export function getOwnedOrderIds(
  restaurantId: string | undefined | null,
  tableNumber: string | undefined | null,
  sessionToken: string | undefined | null,
): string[] {
  if (!restaurantId || !tableNumber || !sessionToken) return [];
  try {
    const raw = localStorage.getItem(
      ownedOrdersKey(restaurantId, tableNumber, sessionToken),
    );
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === 'string' && id.length > 0)
      : [];
  } catch {
    return [];
  }
}

export function rememberOwnedOrder(
  restaurantId: string | undefined | null,
  tableNumber: string | undefined | null,
  sessionToken: string | undefined | null,
  orderId: string | undefined | null,
) {
  if (!restaurantId || !tableNumber || !sessionToken || !orderId) return;
  try {
    const key = ownedOrdersKey(restaurantId, tableNumber, sessionToken);
    const current = getOwnedOrderIds(restaurantId, tableNumber, sessionToken);
    localStorage.setItem(key, JSON.stringify(Array.from(new Set([...current, orderId]))));
  } catch {
    // Best-effort local ownership hint. Checkout still works as full-table pay.
  }
}

export function clearOwnedOrderIds(
  restaurantId: string | undefined | null,
  tableNumber: string | undefined | null,
  sessionToken: string | undefined | null,
) {
  if (!restaurantId || !tableNumber || !sessionToken) return;
  try {
    localStorage.removeItem(ownedOrdersKey(restaurantId, tableNumber, sessionToken));
  } catch {}
}
