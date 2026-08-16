import { Injectable, Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';
import { RestaurantSlugService } from '../restaurants/slug/restaurant-slug.service';

interface ScanStatsRange {
  period?: number;
  startDate?: string;
  endDate?: string;
}

@Injectable()
export class MenuViewService {
  private readonly logger = new Logger(MenuViewService.name);

  constructor(
    private prisma: PrismaService,
    private readonly slugs: RestaurantSlugService,
  ) {}

  async recordView(
    restaurantId: string,
    data: { table?: string; visitorId?: string },
  ): Promise<void> {
    try {
      const exists = await this.prisma.restaurant.count({
        where: { id: restaurantId },
      });
      if (!exists) return;

      let tableId: string | null = null;
      if (data.table) {
        const found = await this.prisma.restaurantTable.findFirst({
          where: { name: data.table, restaurantId, type: 'TABLE' },
          select: { id: true },
        });
        tableId = found?.id ?? null;
      }

      await this.prisma.menuView.create({
        data: {
          restaurantId,
          tableId,
          tableName: data.table ?? null,
          visitorId: data.visitorId ?? null,
        },
      });

      // Fire-and-forget: a customer just loaded the public menu, which is one
      // of the three activity signals that freezes the vanity slug. Not
      // awaited — commitOnActivity does its own DB work and must never delay
      // this write's response, and it already swallows its own errors so it
      // can never turn a successful view record into a failed one.
      void this.slugs.commitOnActivity(restaurantId);
    } catch (err) {
      this.logger.error('Failed to record menu view', err);
    }
  }

  async getScanStats(
    restaurantId: string,
    range: ScanStatsRange = {},
  ): Promise<{
    totalViews: number;
    uniqueVisitors: number;
    todayViews: number;
    perTable: Array<{
      tableName: string;
      views: number;
      uniqueVisitors: number;
    }>;
  }> {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { timezone: true },
    });
    const tz = restaurant?.timezone ?? 'Europe/Sofia';

    const now = DateTime.now().setZone(tz);
    const period = range.period ?? 7;
    const rangeStart =
      range.startDate && range.endDate
        ? DateTime.fromISO(range.startDate, { zone: tz }).startOf('day')
        : now.minus({ days: Math.max(0, period - 1) }).startOf('day');
    const rangeEnd =
      range.startDate && range.endDate
        ? DateTime.fromISO(range.endDate, { zone: tz }).endOf('day')
        : now;
    const since = rangeStart.toUTC().toJSDate();
    const until = rangeEnd.toUTC().toJSDate();
    const today = now.startOf('day').toUTC().toJSDate();
    const currentInstant = now.toUTC().toJSDate();

    // Unique-visitor counts are computed with COUNT(DISTINCT) at the DB layer.
    // The previous implementation pulled every row in the selected window into
    // memory just to de-dup visitorIds — an OOM / event-loop-lockup vector for
    // popular restaurants or a MenuView flood (#18).
    type UniqueTotalRow = { count: bigint | number };
    type PerTableUniqueRow = {
      tableId: string;
      tableName: string | null;
      unique_visitors: bigint | number;
    };

    const [
      totalViews,
      todayViews,
      perTableRaw,
      uniqueTotalRows,
      perTableUnique,
    ] = await Promise.all([
      this.prisma.menuView.count({
        where: { restaurantId, createdAt: { gte: since, lte: until } },
      }),
      this.prisma.menuView.count({
        where: {
          restaurantId,
          createdAt: { gte: today, lte: currentInstant },
        },
      }),
      this.prisma.menuView.groupBy({
        by: ['tableId', 'tableName'],
        where: {
          restaurantId,
          createdAt: { gte: since, lte: until },
          tableId: { not: null },
        },
        _count: { id: true },
      }),
      this.prisma.$queryRaw<UniqueTotalRow[]>`
          SELECT COUNT(DISTINCT "visitorId")::int AS count
          FROM menu_view
          WHERE "restaurantId" = ${restaurantId}
            AND "createdAt" >= ${since}
            AND "createdAt" <= ${until}
            AND "visitorId" IS NOT NULL
        `,
      this.prisma.$queryRaw<PerTableUniqueRow[]>`
          SELECT mv."tableId",
                 COALESCE(MAX(rt.name), MAX(mv."tableName")) AS "tableName",
                 COUNT(DISTINCT mv."visitorId")::int AS unique_visitors
          FROM menu_view mv
          LEFT JOIN restaurant_table rt ON rt.id = mv."tableId"
          WHERE mv."restaurantId" = ${restaurantId}
            AND mv."createdAt" >= ${since}
            AND mv."createdAt" <= ${until}
            AND mv."visitorId" IS NOT NULL
            AND mv."tableId" IS NOT NULL
          GROUP BY mv."tableId"
        `,
    ]);

    const uniqueTotal = Number(uniqueTotalRows[0]?.count ?? 0);

    const uniqueByKey = new Map<string, number>();
    const tableLabelByKey = new Map<string, string>();
    for (const row of perTableUnique) {
      uniqueByKey.set(row.tableId, Number(row.unique_visitors));
      if (row.tableName) tableLabelByKey.set(row.tableId, row.tableName);
    }

    const perTableMap = new Map<
      string,
      { tableName: string; views: number; uniqueVisitors: number }
    >();

    for (const row of perTableRaw) {
      const key = row.tableId ?? row.tableName ?? 'unknown';
      const label = tableLabelByKey.get(key) ?? row.tableName ?? '';
      const existing = perTableMap.get(key) ?? {
        tableName: label,
        views: 0,
        uniqueVisitors: uniqueByKey.get(key) ?? 0,
      };
      existing.views += row._count.id;
      perTableMap.set(key, existing);
    }

    const perTable = Array.from(perTableMap.values())
      .map(({ tableName, views, uniqueVisitors }) => ({
        tableName,
        views,
        uniqueVisitors,
      }))
      .sort((a, b) => b.views - a.views);

    return { totalViews, uniqueVisitors: uniqueTotal, todayViews, perTable };
  }
}
