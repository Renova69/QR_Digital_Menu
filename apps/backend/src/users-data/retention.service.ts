import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';

const MENU_VIEW_RETENTION_DAYS = 365;
const TENANT_BATCH_SIZE = 100;
const FAILURE_DETAIL_LIMIT = 100;

type RetentionDuty =
  'verificationTokens' | 'orderPiiAnonymization' | 'menuViewPruning';
type RetentionFailureDuty = RetentionDuty | 'settings';
type RetentionFailureScope = 'global' | 'tenant-enumeration' | 'tenant';

export interface RetentionDutySummary {
  scopesAttempted: number;
  scopesSucceeded: number;
  scopesFailed: number;
  affectedRows: number;
}

export interface RetentionFailure {
  duty: RetentionFailureDuty;
  scope: RetentionFailureScope;
  restaurantId?: string;
  error: string;
}

export interface RetentionRunSummary {
  startedAt: string;
  completedAt: string;
  enabled: boolean | null;
  status: 'COMPLETED' | 'COMPLETED_WITH_ERRORS' | 'SKIPPED' | 'FAILED';
  totals: RetentionDutySummary;
  duties: Record<RetentionDuty, RetentionDutySummary>;
  failures: RetentionFailure[];
  failuresTruncated: number;
}

function emptyDutySummary(): RetentionDutySummary {
  return {
    scopesAttempted: 0,
    scopesSucceeded: 0,
    scopesFailed: 0,
    affectedRows: 0,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  @Cron('0 3 * * *')
  async runDailyRetention(): Promise<RetentionRunSummary> {
    const startedAt = new Date();
    const summary: RetentionRunSummary = {
      startedAt: startedAt.toISOString(),
      completedAt: startedAt.toISOString(),
      enabled: null,
      status: 'COMPLETED',
      totals: emptyDutySummary(),
      duties: {
        verificationTokens: emptyDutySummary(),
        orderPiiAnonymization: emptyDutySummary(),
        menuViewPruning: emptyDutySummary(),
      },
      failures: [],
      failuresTruncated: 0,
    };

    let settings: Awaited<ReturnType<PlatformSettingsService['getSettings']>>;
    try {
      settings = await this.platformSettings.getSettings();
    } catch (error) {
      summary.status = 'FAILED';
      summary.totals.scopesAttempted = 1;
      summary.totals.scopesFailed = 1;
      this.appendFailure(summary, {
        duty: 'settings',
        scope: 'global',
        error: errorMessage(error),
      });
      summary.completedAt = new Date().toISOString();
      this.logger.error({ event: 'retention.run.failed', ...summary });
      return summary;
    }

    summary.enabled = settings.retentionCronEnabled;
    if (!settings.retentionCronEnabled) {
      summary.status = 'SKIPPED';
      summary.completedAt = new Date().toISOString();
      this.logger.log({ event: 'retention.run.skipped', ...summary });
      return summary;
    }

    const now = new Date(startedAt);
    await this.runGlobalDuty(
      summary,
      'verificationTokens',
      async () =>
        (
          await this.prisma.verificationToken.deleteMany({
            where: { expiresAt: { lt: now } },
          })
        ).count,
    );

    const orderCutoff = new Date(now);
    orderCutoff.setFullYear(
      orderCutoff.getFullYear() - settings.orderPiiRetentionYears,
    );
    await this.runTenantDuty(
      summary,
      'orderPiiAnonymization',
      async (restaurantId) =>
        (
          await this.prisma.order.updateMany({
            where: {
              restaurantId,
              createdAt: { lt: orderCutoff },
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
          })
        ).count,
    );

    const menuViewCutoff = new Date(now);
    menuViewCutoff.setDate(menuViewCutoff.getDate() - MENU_VIEW_RETENTION_DAYS);
    await this.runTenantDuty(
      summary,
      'menuViewPruning',
      async (restaurantId) =>
        (
          await this.prisma.menuView.deleteMany({
            where: {
              restaurantId,
              createdAt: { lt: menuViewCutoff },
            },
          })
        ).count,
    );

    summary.status =
      summary.totals.scopesFailed > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED';
    summary.completedAt = new Date().toISOString();
    this.logger.log({ event: 'retention.run.completed', ...summary });
    return summary;
  }

  private async runGlobalDuty(
    summary: RetentionRunSummary,
    duty: RetentionDuty,
    operation: () => Promise<number>,
  ): Promise<void> {
    this.markAttempt(summary, duty);
    try {
      this.markSuccess(summary, duty, await operation());
    } catch (error) {
      this.markFailure(summary, duty, {
        duty,
        scope: 'global',
        error: errorMessage(error),
      });
    }
  }

  private async runTenantDuty(
    summary: RetentionRunSummary,
    duty: RetentionDuty,
    operation: (restaurantId: string) => Promise<number>,
  ): Promise<void> {
    let cursor: string | undefined;

    while (true) {
      let restaurants: Array<{ id: string }>;
      try {
        restaurants = await this.prisma.restaurant.findMany({
          select: { id: true },
          orderBy: { id: 'asc' },
          take: TENANT_BATCH_SIZE,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
      } catch (error) {
        this.markAttempt(summary, duty);
        this.markFailure(summary, duty, {
          duty,
          scope: 'tenant-enumeration',
          error: errorMessage(error),
        });
        return;
      }

      for (const restaurant of restaurants) {
        this.markAttempt(summary, duty);
        try {
          this.markSuccess(summary, duty, await operation(restaurant.id));
        } catch (error) {
          this.markFailure(summary, duty, {
            duty,
            scope: 'tenant',
            restaurantId: restaurant.id,
            error: errorMessage(error),
          });
        }
      }

      if (restaurants.length < TENANT_BATCH_SIZE) return;
      cursor = restaurants[restaurants.length - 1].id;
    }
  }

  private markAttempt(summary: RetentionRunSummary, duty: RetentionDuty): void {
    summary.duties[duty].scopesAttempted += 1;
    summary.totals.scopesAttempted += 1;
  }

  private markSuccess(
    summary: RetentionRunSummary,
    duty: RetentionDuty,
    affectedRows: number,
  ): void {
    summary.duties[duty].scopesSucceeded += 1;
    summary.duties[duty].affectedRows += affectedRows;
    summary.totals.scopesSucceeded += 1;
    summary.totals.affectedRows += affectedRows;
  }

  private markFailure(
    summary: RetentionRunSummary,
    duty: RetentionDuty,
    failure: RetentionFailure,
  ): void {
    summary.duties[duty].scopesFailed += 1;
    summary.totals.scopesFailed += 1;
    this.appendFailure(summary, failure);
    this.logger.error({ event: 'retention.scope.failed', ...failure });
  }

  private appendFailure(
    summary: RetentionRunSummary,
    failure: RetentionFailure,
  ): void {
    if (summary.failures.length < FAILURE_DETAIL_LIMIT) {
      summary.failures.push(failure);
      return;
    }
    summary.failuresTruncated += 1;
  }
}
