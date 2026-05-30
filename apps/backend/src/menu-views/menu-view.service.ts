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
      const exists = await this.prisma.restaurant.count({ where: { id: restaurantId } });
      if (!exists) return;

      let tableId: string | null = null;
      if (data.table) {
        const found = await this.prisma.restaurantTable.findFirst({
          where: { name: data.table, restaurantId },
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
    perTable: Array<{ tableName: string; views: number; uniqueVisitors: number }>;
  }> {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { timezone: true },
    });
    const tz = restaurant?.timezone ?? 'Europe/Sofia';

    const since = new Date();
    since.setDate(since.getDate() - 7);

    const today = DateTime.now().setZone(tz).startOf('day').toJSDate();

    const [totalViews, todayViews, perTableRaw, uniqueRows] = await Promise.all([
      this.prisma.menuView.count({
        where: { restaurantId, createdAt: { gte: since } },
      }),
      this.prisma.menuView.count({
        where: { restaurantId, createdAt: { gte: today } },
      }),
      this.prisma.menuView.groupBy({
        by: ['tableId', 'tableName'],
        where: { restaurantId, createdAt: { gte: since } },
        _count: { id: true },
      }),
      this.prisma.menuView.findMany({
        where: { restaurantId, createdAt: { gte: since }, visitorId: { not: null } },
        select: { tableId: true, tableName: true, visitorId: true },
      }),
    ]);

    const uniqueTotal = new Set(uniqueRows.map((r) => r.visitorId)).size;

    const perTableMap = new Map<
      string,
      { tableName: string; views: number; visitorIds: Set<string> }
    >();

    for (const row of perTableRaw) {
      const key = row.tableId ?? row.tableName ?? 'unknown';
      const label = row.tableName ?? 'Unknown table';
      const existing = perTableMap.get(key) ?? {
        tableName: label,
        views: 0,
        visitorIds: new Set(),
      };
      existing.views += row._count.id;
      perTableMap.set(key, existing);
    }

    for (const row of uniqueRows) {
      const key = row.tableId ?? row.tableName ?? 'unknown';
      const entry = perTableMap.get(key);
      if (entry && row.visitorId) {
        entry.visitorIds.add(row.visitorId);
      }
    }

    const perTable = Array.from(perTableMap.values())
      .map(({ tableName, views, visitorIds }) => ({
        tableName,
        views,
        uniqueVisitors: visitorIds.size,
      }))
      .sort((a, b) => b.views - a.views);

    return { totalViews, uniqueVisitors: uniqueTotal, todayViews, perTable };
  }
}
