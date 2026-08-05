import AsyncStorage from "@react-native-async-storage/async-storage";
import type {
  PrintLedgerRecord,
  PrintLedgerStore,
} from "../services/print-once";

const KEY = "@qr_print_agent/durable_print_ledger_v1";
export const PRINT_LEDGER_RETENTION_MS = 48 * 60 * 60 * 1000;

export function retainPrintLedgerRecords(
  records: Record<string, PrintLedgerRecord>,
  now = Date.now(),
): Record<string, PrintLedgerRecord> {
  return Object.fromEntries(
    Object.entries(records).filter(([, record]) => {
      const updatedAt = Date.parse(record.updatedAt);
      return (
        Number.isFinite(updatedAt) &&
        now - updatedAt <= PRINT_LEDGER_RETENTION_MS
      );
    }),
  );
}

async function loadRecords(): Promise<Record<string, PrintLedgerRecord>> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return {};
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Durable print ledger is invalid");
  }
  return parsed as Record<string, PrintLedgerRecord>;
}

export const durablePrintLedger: PrintLedgerStore = {
  async read(jobId) {
    const records = await loadRecords();
    return records[jobId] ?? null;
  },

  async write(record) {
    const records = await loadRecords();
    records[record.jobId] = record;
    const retained = retainPrintLedgerRecords(records);
    await AsyncStorage.setItem(KEY, JSON.stringify(retained));
  },
};
