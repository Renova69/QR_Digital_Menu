import { getTableStatuses, getZones, type TableZone } from "./api";
import { getPosSnapshot, putPosSnapshot } from "./posOfflineOrders";

export type PosTableStatus = Awaited<
  ReturnType<typeof getTableStatuses>
>[number];

const tableSnapshotKey = (restaurantId: string, zoneId?: string) =>
  `pos-tables:${restaurantId}:${zoneId ?? "all"}`;
const zoneSnapshotKey = (restaurantId: string) => `pos-zones:${restaurantId}`;

function canUseCachedCatalog(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return true;
  const response = (error as { response?: { status?: number } }).response;
  if (!response) return true;
  const status = response.status;
  return (
    status === 408 ||
    status === 425 ||
    status === 429 ||
    (typeof status === "number" && status >= 500)
  );
}

export async function loadPosTables(
  restaurantId: string,
  zoneId?: string,
): Promise<PosTableStatus[]> {
  try {
    const tables = await getTableStatuses(restaurantId, zoneId);
    const safeSnapshot = tables.map((table) => ({
      ...table,
      sessionToken: null,
    }));
    await putPosSnapshot(tableSnapshotKey(restaurantId, zoneId), safeSnapshot);
    return tables;
  } catch (error) {
    if (!canUseCachedCatalog(error)) throw error;
    const cached = await getPosSnapshot<PosTableStatus[]>(
      tableSnapshotKey(restaurantId, zoneId),
    );
    if (cached) return cached.value;
    throw error;
  }
}

export async function loadPosZones(restaurantId: string): Promise<TableZone[]> {
  try {
    const zones = await getZones(restaurantId);
    await putPosSnapshot(zoneSnapshotKey(restaurantId), zones);
    return zones;
  } catch (error) {
    if (!canUseCachedCatalog(error)) throw error;
    const cached = await getPosSnapshot<TableZone[]>(
      zoneSnapshotKey(restaurantId),
    );
    if (cached) return cached.value;
    throw error;
  }
}
