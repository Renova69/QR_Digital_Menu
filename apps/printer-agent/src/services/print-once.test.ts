import {
  PrintOutcomeUncertainError,
  executePrintOnce,
  type PrintLedgerRecord,
  type PrintLedgerStore,
} from "./print-once";

function createStore(
  initial: Record<string, PrintLedgerRecord> = {},
): PrintLedgerStore & { records: Map<string, PrintLedgerRecord> } {
  const records = new Map(Object.entries(initial));
  return {
    records,
    read: async (jobId) => records.get(jobId) ?? null,
    write: async (record) => {
      records.set(record.jobId, record);
    },
  };
}

describe("executePrintOnce", () => {
  it("serializes concurrent duplicate deliveries into one physical print", async () => {
    const store = createStore();
    let releasePrint!: () => void;
    const printBlocked = new Promise<void>((resolve) => {
      releasePrint = resolve;
    });
    const print = jest.fn(() => printBlocked);

    const first = executePrintOnce(store, "job-1", "ticket-a", print);
    const second = executePrintOnce(store, "job-1", "ticket-a", print);
    await Promise.resolve();
    releasePrint();

    await expect(first).resolves.toEqual({ printed: true });
    await expect(second).resolves.toEqual({ printed: false });
    expect(print).toHaveBeenCalledTimes(1);
  });

  it("replays success after restart without touching the printer again", async () => {
    const store = createStore({
      "job-1": {
        jobId: "job-1",
        ticketFingerprint: "ticket-a",
        state: "COMPLETED",
        updatedAt: "2026-08-02T10:00:00.000Z",
      },
    });
    const print = jest.fn().mockResolvedValue(undefined);

    await expect(
      executePrintOnce(store, "job-1", "ticket-a", print),
    ).resolves.toEqual({ printed: false });
    expect(print).not.toHaveBeenCalled();
  });

  it("makes interrupted work visible instead of risking a duplicate print", async () => {
    const store = createStore({
      "job-1": {
        jobId: "job-1",
        ticketFingerprint: "ticket-a",
        state: "STARTED",
        updatedAt: "2026-08-02T10:00:00.000Z",
      },
    });
    const print = jest.fn().mockResolvedValue(undefined);

    await expect(
      executePrintOnce(store, "job-1", "ticket-a", print),
    ).rejects.toBeInstanceOf(PrintOutcomeUncertainError);
    expect(print).not.toHaveBeenCalled();
  });

  it("rejects the same job id with a different ticket", async () => {
    const store = createStore({
      "job-1": {
        jobId: "job-1",
        ticketFingerprint: "ticket-a",
        state: "COMPLETED",
        updatedAt: "2026-08-02T10:00:00.000Z",
      },
    });

    await expect(
      executePrintOnce(store, "job-1", "ticket-b", jest.fn()),
    ).rejects.toThrow(/different ticket/i);
  });

  it("retains STARTED when the printer outcome cannot be proven", async () => {
    const store = createStore();
    const print = jest.fn().mockRejectedValue(new Error("socket closed"));

    await expect(
      executePrintOnce(store, "job-1", "ticket-a", print),
    ).rejects.toBeInstanceOf(PrintOutcomeUncertainError);
    expect(store.records.get("job-1")?.state).toBe("STARTED");
  });
});
