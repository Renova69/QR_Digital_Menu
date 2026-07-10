import { Injectable, Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MenuViewService {
  private readonly logger = new Logger(MenuViewService.name);

  constructor(private prisma: PrismaService) {}

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
    } catch (err) {
      this.logger.error('Failed to record menu view', err);
    }
  }

  async getScanStats(restaurantId: string): Promise<{
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

    const since = new Date();
    since.setDate(since.getDate() - 7);

    const today = DateTime.now().setZone(tz).startOf('day').toJSDate();

    // Unique-visitor counts are computed with COUNT(DISTINCT) at the DB layer.
    // The previous implementation pulled every row in the 7-day window into
    // memory just to de-dup visitorIds — an OOM / event-loop-lockup vector for
    // popular restaurants or a MenuView flood (#18).
    type UniqueTotalRow = { count: bigint | number };
    type PerTableUniqueRow = {
      tableId: string | null;
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
        where: { restaurantId, createdAt: { gte: since } },
      }),
      this.prisma.menuView.count({
        where: { restaurantId, createdAt: { gte: today } },
      }),
      this.prisma.menuView.groupBy({
        by: ['tableId', 'tableName'],
        where: {
          restaurantId,
          createdAt: { gte: since },
          tableId: { not: null },
        },
        _count: { id: true },
      }),
      this.prisma.$queryRaw<UniqueTotalRow[]>`
          SELECT COUNT(DISTINCT "visitorId")::int AS count
          FROM menu_view
          WHERE "restaurantId" = ${restaurantId}
            AND "createdAt" >= ${since}
            AND "visitorId" IS NOT NULL
        `,
      this.prisma.$queryRaw<PerTableUniqueRow[]>`
          SELECT "tableId",
                 "tableName",
                 COUNT(DISTINCT "visitorId")::int AS unique_visitors
          FROM menu_view
          WHERE "restaurantId" = ${restaurantId}
            AND "createdAt" >= ${since}
            AND "visitorId" IS NOT NULL
            AND "tableId" IS NOT NULL
          GROUP BY "tableId", "tableName"
        `,
    ]);

    const uniqueTotal = Number(uniqueTotalRows[0]?.count ?? 0);

    const uniqueByKey = new Map<string, number>();
    for (const row of perTableUnique) {
      const key = row.tableId ?? row.tableName ?? 'unknown';
      uniqueByKey.set(
        key,
        (uniqueByKey.get(key) ?? 0) + Number(row.unique_visitors),
      );
    }

    const perTableMap = new Map<
      string,
      { tableName: string; views: number; uniqueVisitors: number }
    >();

    for (const row of perTableRaw) {
      const key = row.tableId ?? row.tableName ?? 'unknown';
      const label = row.tableName ?? 'Unknown table';
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
