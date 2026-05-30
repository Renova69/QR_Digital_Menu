import { INestApplication, Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { setTimeout as sleep } from 'timers/promises';

function jitteredDelay(attempt: number, baseMs = 500, maxMs = 30_000): number {
  const exp = Math.min(baseMs * 2 ** attempt, maxMs);
  return exp * (0.5 + Math.random() * 0.5); // 50–100% of exponential cap
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: ['warn', 'error'],
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
    });
  }

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

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Database disconnected');
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
