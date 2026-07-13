import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { getTableStatuses, getZones } from "./api";
import { getPosSnapshot, putPosSnapshot } from "./posOfflineOrders";
import { loadPosTables, loadPosZones } from "./posOfflineCatalog";

vi.mock("./api", () => ({
  getTableStatuses: vi.fn(),
  getZones: vi.fn(),
}));

vi.mock("./posOfflineOrders", () => ({
  getPosSnapshot: vi.fn(),
  putPosSnapshot: vi.fn().mockResolvedValue(undefined),
}));

describe("POS offline catalog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns fresh tables but redacts session tokens from the snapshot", async () => {
    const tables = [
      {
        id: "table-1",
        name: "Table 1",
        status: "occupied" as const,
        sessionId: "session-1",
        sessionToken: "secret-session-token",
        orderCount: 1,
        totalAmount: 10,
        customerNames: ["Guest"],
        sessionStatus: "OPEN",
        updatedAt: "2026-07-13T10:00:00.000Z",
      },
    ];
    (getTableStatuses as Mock).mockResolvedValue(tables);

    await expect(loadPosTables("restaurant-1")).resolves.toEqual(tables);
    expect(putPosSnapshot).toHaveBeenCalledWith("pos-tables:restaurant-1:all", [
      expect.objectContaining({
        sessionId: "session-1",
        sessionToken: null,
      }),
    ]);
  });

  it("uses cached table identities and session preconditions when offline", async () => {
    (getTableStatuses as Mock).mockRejectedValue({ code: "ERR_NETWORK" });
    (getPosSnapshot as Mock).mockResolvedValue({
      key: "pos-tables:restaurant-1:all",
      cachedAt: "2026-07-13T10:00:00.000Z",
      value: [
        {
          id: "table-1",
          name: "Table 1",
          status: "occupied",
          sessionId: "session-1",
          sessionToken: null,
        },
      ],
    });

    await expect(loadPosTables("restaurant-1")).resolves.toEqual([
      expect.objectContaining({
        id: "table-1",
        sessionId: "session-1",
        sessionToken: null,
      }),
    ]);
  });

  it("falls back to cached zones", async () => {
    (getZones as Mock).mockRejectedValue({ code: "ERR_NETWORK" });
    (getPosSnapshot as Mock).mockResolvedValue({
      key: "pos-zones:restaurant-1",
      cachedAt: "2026-07-13T10:00:00.000Z",
      value: [{ id: "zone-1", name: "Terrace" }],
    });

    await expect(loadPosZones("restaurant-1")).resolves.toEqual([
      { id: "zone-1", name: "Terrace" },
    ]);
  });

  it("does not hide an authorization failure behind cached table data", async () => {
    const unauthorized = { response: { status: 401 } };
    (getTableStatuses as Mock).mockRejectedValue(unauthorized);

    await expect(loadPosTables("restaurant-1")).rejects.toBe(unauthorized);
    expect(getPosSnapshot).not.toHaveBeenCalled();
  });
});
