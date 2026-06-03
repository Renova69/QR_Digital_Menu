import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardViewsService implements OnModuleInit {
  private readonly logger = new Logger(DashboardViewsService.name);
  private ready = false;

  constructor(private readonly prisma: PrismaService) {}

  isReady(): boolean {
    return this.ready;
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.createViews();
      this.ready = true;
      this.logger.log('Analytics materialized views initialised');
    } catch (err) {
      this.logger.warn(
        'Materialized views unavailable — falling back to raw queries',
        err,
      );
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async refreshViews(): Promise<void> {
    if (!this.ready) return;
    try {
      await this.prisma.$executeRawUnsafe(
        'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_stats',
      );
      await this.prisma.$executeRawUnsafe(
        'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_peak_hours',
      );
      await this.prisma.$executeRawUnsafe(
        'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_item_stats',
      );
      this.logger.log('Analytics views refreshed');
    } catch (err) {
      this.logger.warn('View refresh failed', err);
    }
  }

  private async createViews(): Promise<void> {
    // Revenue + order count per restaurant per UTC day
    await this.prisma.$executeRawUnsafe(`
      CREATE MATERIALIZED VIEW IF NOT EXISTS mv_daily_stats AS
      SELECT
        o."restaurantId",
        DATE_TRUNC('day', o."createdAt") AS day_utc,
        COUNT(*)::int                    AS order_count,
        COALESCE(SUM(o."totalPrice"), 0) AS revenue
      FROM customer_order o
      WHERE o.status != 'CANCELED'
      GROUP BY o."restaurantId", DATE_TRUNC('day', o."createdAt")
    `);

    await this.prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS mv_daily_stats_uid
        ON mv_daily_stats ("restaurantId", day_utc)
    `);

    // Order count per restaurant per UTC day × UTC hour (for timezone-aware reshaping at read time)
    await this.prisma.$executeRawUnsafe(`
      CREATE MATERIALIZED VIEW IF NOT EXISTS mv_peak_hours AS
      SELECT
        o."restaurantId",
        DATE_TRUNC('day', o."createdAt")        AS day_utc,
        EXTRACT(HOUR FROM o."createdAt")::int   AS hour_utc,
        COUNT(*)::int                           AS order_count
      FROM customer_order o
      WHERE o.status != 'CANCELED'
      GROUP BY o."restaurantId", DATE_TRUNC('day', o."createdAt"), EXTRACT(HOUR FROM o."createdAt")
    `);

    await this.prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS mv_peak_hours_uid
        ON mv_peak_hours ("restaurantId", day_utc, hour_utc)
    `);

    // Item-level stats per restaurant per UTC day
    await this.prisma.$executeRawUnsafe(`
      CREATE MATERIALIZED VIEW IF NOT EXISTS mv_item_stats AS
      SELECT
        o."restaurantId",
        oi."menuItemId",
        mi.name                                        AS item_name,
        mi.price                                       AS item_price,
        DATE_TRUNC('day', o."createdAt")               AS day_utc,
        SUM(oi.quantity)::int                          AS total_quantity,
        COALESCE(SUM(mi.price * oi.quantity), 0)       AS total_revenue
      FROM order_item oi
      JOIN customer_order o  ON oi."orderId"    = o.id
      JOIN menu_item     mi  ON oi."menuItemId" = mi.id
      WHERE o.status != 'CANCELED'
        AND oi."menuItemId" IS NOT NULL
      GROUP BY o."restaurantId", oi."menuItemId", mi.name, mi.price, DATE_TRUNC('day', o."createdAt")
    `);

    await this.prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS mv_item_stats_uid
        ON mv_item_stats ("restaurantId", "menuItemId", day_utc)
    `);
  }
}
