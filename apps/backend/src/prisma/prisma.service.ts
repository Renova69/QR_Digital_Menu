import { INestApplication, Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import {
  PrismaClientKnownRequestError,
  PrismaClientInitializationError,
  PrismaClientRustPanicError,
} from '@prisma/client/runtime/library';
import { setTimeout as sleep } from 'timers/promises';

// Prisma error codes that are transient (connection/timeout) — safe to retry
const TRANSIENT_CODES = new Set(['P1001', 'P1002', 'P1008', 'P1017', 'P2024', 'P1012']);

function isTransient(err: unknown): boolean {
  if (err instanceof PrismaClientKnownRequestError) {
    return TRANSIENT_CODES.has(err.code);
  }
  return err instanceof PrismaClientInitializationError || err instanceof PrismaClientRustPanicError;
}

function jitteredDelay(attempt: number, baseMs = 500, maxMs = 30_000): number {
  const exp = Math.min(baseMs * 2 ** attempt, maxMs);
  return exp * (0.5 + Math.random() * 0.5); // 50–100% of exponential cap
}

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger(PrismaService.name);

  private circuitState: CircuitState = 'CLOSED';
  private consecutiveFailures = 0;
  private openedAt = 0;
  private readonly FAILURE_THRESHOLD = 5;
  private readonly OPEN_DURATION_MS = 30_000;

  async onModuleInit() {
    const maxRetries = 15;

    for (let i = 0; i < maxRetries; i++) {
      try {
        await this.$connect();
        this.logger.log('Connected to database');
        return;
      } catch (error) {
        const delay = jitteredDelay(i, 1_000, 30_000);
        this.logger.warn(`DB connection attempt ${i + 1}/${maxRetries} failed — retrying in ${Math.round(delay)}ms`);
        if (i === maxRetries - 1) {
          this.logger.error('Failed to connect to database after maximum retries');
          throw error;
        }
        await sleep(delay);
      }
    }
  }

  /**
   * Execute `fn` with retry + circuit breaker protection.
   * Use for critical DB calls that must be resilient to transient errors.
   */
  async withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
    this.checkCircuit();

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const result = await fn();
        this.onSuccess();
        return result;
      } catch (err) {
        if (!isTransient(err) || attempt === maxAttempts - 1) {
          this.onFailure();
          throw err;
        }
        const delay = jitteredDelay(attempt);
        this.logger.warn(`Transient DB error on attempt ${attempt + 1} — retrying in ${Math.round(delay)}ms`);
        await sleep(delay);
      }
    }
    // unreachable — loop always returns or throws
    throw new Error('Unexpected exit from retry loop');
  }

  private checkCircuit(): void {
    if (this.circuitState === 'CLOSED') return;

    if (this.circuitState === 'OPEN') {
      const elapsed = Date.now() - this.openedAt;
      if (elapsed < this.OPEN_DURATION_MS) {
        throw new Error(`Circuit breaker OPEN — DB unavailable (retry in ${Math.round((this.OPEN_DURATION_MS - elapsed) / 1000)}s)`);
      }
      this.circuitState = 'HALF_OPEN';
      this.logger.log('Circuit breaker → HALF_OPEN (probing)');
    }
    // HALF_OPEN: let request through as probe
  }

  private onSuccess(): void {
    if (this.circuitState !== 'CLOSED') {
      this.logger.log('Circuit breaker → CLOSED');
    }
    this.circuitState = 'CLOSED';
    this.consecutiveFailures = 0;
  }

  private onFailure(): void {
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= this.FAILURE_THRESHOLD || this.circuitState === 'HALF_OPEN') {
      this.circuitState = 'OPEN';
      this.openedAt = Date.now();
      this.logger.error(`Circuit breaker → OPEN after ${this.consecutiveFailures} consecutive failures`);
    }
  }

  async enableShutdownHooks(app: INestApplication) {
    process.on('SIGINT', async () => {
      await app.close();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      await app.close();
      process.exit(0);
    });
  }
}
