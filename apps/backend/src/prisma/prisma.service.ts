import { INestApplication, Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { setTimeout as sleep } from 'timers/promises';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    const maxRetries = 15;
    const retryDelay = 2000; // 2 seconds

    for (let i = 0; i < maxRetries; i++) {
      try {
        await this.$connect();
        this.logger.log('Connected to database');
        return;
      } catch (error) {
        this.logger.warn(`Database connection attempt ${i + 1} failed`);
        if (i === maxRetries - 1) {
          this.logger.error('Failed to connect to database after maximum retries');
          throw error;
        }
        await sleep(retryDelay);
      }
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
