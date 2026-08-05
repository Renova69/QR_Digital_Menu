export type PrintLedgerState = "STARTED" | "COMPLETED";

export interface PrintLedgerRecord {
  jobId: string;
  ticketFingerprint: string;
  state: PrintLedgerState;
  updatedAt: string;
}

export interface PrintLedgerStore {
  read(jobId: string): Promise<PrintLedgerRecord | null>;
  write(record: PrintLedgerRecord): Promise<void>;
}

export class PrintOutcomeUncertainError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PrintOutcomeUncertainError";
  }
}

export class PrintIdentityConflictError extends PrintOutcomeUncertainError {
  constructor(jobId: string) {
    super(`Print job ${jobId} was replayed with a different ticket`);
    this.name = "PrintIdentityConflictError";
  }
}

let executionQueue: Promise<void> = Promise.resolve();

export function fingerprintTicket(ticketBase64: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < ticketBase64.length; index += 1) {
    hash ^= ticketBase64.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${ticketBase64.length}:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function executePrintOnce(
  store: PrintLedgerStore,
  jobId: string,
  ticketFingerprint: string,
  print: () => Promise<void>,
): Promise<{ printed: boolean }> {
  const execution = executionQueue.then(async () => {
    const existing = await store.read(jobId);
    if (existing) {
      if (existing.ticketFingerprint !== ticketFingerprint) {
        throw new PrintIdentityConflictError(jobId);
      }
      if (existing.state === "COMPLETED") {
        return { printed: false };
      }
      throw new PrintOutcomeUncertainError(
        `Print job ${jobId} was interrupted after printing may have started`,
      );
    }

    await store.write({
      jobId,
      ticketFingerprint,
      state: "STARTED",
      updatedAt: new Date().toISOString(),
    });

    try {
      await print();
    } catch (cause) {
      throw new PrintOutcomeUncertainError(
        `Print job ${jobId} failed after printing may have started`,
        { cause },
      );
    }

    try {
      await store.write({
        jobId,
        ticketFingerprint,
        state: "COMPLETED",
        updatedAt: new Date().toISOString(),
      });
    } catch (cause) {
      throw new PrintOutcomeUncertainError(
        `Print job ${jobId} completed but its durable receipt could not be saved`,
        { cause },
      );
    }

    return { printed: true };
  });

  executionQueue = execution.then(
    () => undefined,
    () => undefined,
  );
  return execution;
}
