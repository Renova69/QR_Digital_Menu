import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';

@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  @Cron('0 3 * * *')
  async runDailyRetention() {
    const settings = await this.platformSettings.getSettings();
    if (!settings.retentionCronEnabled) return;

    const now = new Date();

    const tokenCutoff = new Date(now);
    tokenCutoff.setDate(
      tokenCutoff.getDate() - settings.verificationTokenTtlDays,
    );
    const { count: deletedVerificationTokens } =
      await this.prisma.verificationToken.deleteMany({
        where: { expiresAt: { lt: tokenCutoff } },
      });

    const orderCutoff = new Date(now);
    orderCutoff.setFullYear(
      orderCutoff.getFullYear() - settings.orderPiiRetentionYears,
    );
    const { count: anonymizedOrders } = await this.prisma.order.updateMany({
      where: {
        createdAt: { lt: orderCutoff },
        customerId: { not: null },
      },
      data: {
        customerName: '[REDACTED]',
        customerPhone: null,
        specialRequests: null,
        customerId: null,
      },
    });

    this.logger.log(
      `Retention run: deleted ${deletedVerificationTokens} tokens, anonymized ${anonymizedOrders} orders`,
    );
  }
}
