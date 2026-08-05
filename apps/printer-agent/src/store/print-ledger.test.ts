import type { PrintLedgerRecord } from "../services/print-once";
import {
  PRINT_LEDGER_RETENTION_MS,
  retainPrintLedgerRecords,
} from "./print-ledger";

function record(jobId: string, updatedAt: number): PrintLedgerRecord {
  return {
    jobId,
    ticketFingerprint: `ticket-${jobId}`,
    state: "COMPLETED",
    updatedAt: new Date(updatedAt).toISOString(),
  };
}

describe("print ledger retention", () => {
  it("retains every job throughout the backend retry window regardless of volume", () => {
    const now = Date.parse("2030-01-03T00:00:00.000Z");
    const withinRetryWindow = Object.fromEntries(
      Array.from({ length: 1_000 }, (_, index) => {
        const jobId = `job-${index}`;
        return [jobId, record(jobId, now - 24 * 60 * 60 * 1000)];
      }),
    );

    expect(
      Object.keys(retainPrintLedgerRecords(withinRetryWindow, now)),
    ).toHaveLength(1_000);
  });

  it("prunes only records older than the 48-hour safety window", () => {
    const now = Date.parse("2030-01-03T00:00:00.000Z");
    const retained = retainPrintLedgerRecords(
      {
        boundary: record("boundary", now - PRINT_LEDGER_RETENTION_MS),
        expired: record("expired", now - PRINT_LEDGER_RETENTION_MS - 1),
      },
      now,
    );

    expect(Object.keys(retained)).toEqual(["boundary"]);
  });
});
