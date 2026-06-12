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

    const { count: deletedVerificationTokens } =
      await this.prisma.verificationToken.deleteMany({
        where: { expiresAt: { lt: now } },
      });

    const orderCutoff = new Date(now);
    orderCutoff.setFullYear(
      orderCutoff.getFullYear() - settings.orderPiiRetentionYears,
    );
    // Anonymize ALL old orders, not just registered-customer ones. Guest orders
    // (customerId null) still collect customerName/customerPhone, so excluding
    // them left guest PII in the DB indefinitely — a GDPR retention violation
    // (#3). The `customerName not [REDACTED]` guard keeps the run idempotent so
    // already-anonymized rows aren't re-touched and the count stays meaningful.
    const { count: anonymizedOrders } = await this.prisma.order.updateMany({
      where: {
        createdAt: { lt: orderCutoff },
        // Any row still holding redactable PII. Idempotent: already-anonymized
        // rows (name '[REDACTED]', phone/customerId/specialRequests null) match
        // none of these and are skipped. Null-safe — a null-name guest whose
        // phone is set is still caught via the customerPhone clause.
        OR: [
          { customerName: { not: '[REDACTED]' } },
          { customerPhone: { not: null } },
          { customerId: { not: null } },
          { specialRequests: { not: null } },
        ],
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
