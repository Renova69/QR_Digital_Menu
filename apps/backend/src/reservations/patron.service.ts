import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { sanitizeStaffTags } from './reservation-tags';

@Injectable()
export class PatronService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find or create the cross-visit patron for (restaurantId, phone). Runs inside
   * the caller's booking transaction. Race-safe: a concurrent create that loses
   * the unique index (P2002) falls back to the existing row (same pattern as
   * getOrCreateSession). Existing staff tags are never touched here.
   */
  async matchOrCreate(
    tx: Prisma.TransactionClient,
    restaurantId: string,
    phone: string,
    name: string,
    email?: string | null,
  ): Promise<{ id: string }> {
    const where = { restaurantId_phone: { restaurantId, phone } };
    const existing = await tx.patron.findUnique({
      where,
      select: { id: true },
    });
    if (existing) return existing;

    try {
      return await tx.patron.create({
        data: { restaurantId, phone, name, email: email ?? null },
        select: { id: true },
      });
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') {
        const row = await tx.patron.findUnique({ where, select: { id: true } });
        if (row) return row;
      }
      throw err;
    }
  }

  /** Owner/staff overwrite of a patron's staff tags (validated subset). */
  async setStaffTags(patronId: string, tags: unknown): Promise<void> {
    await this.prisma.patron.update({
      where: { id: patronId },
      data: { staffTags: sanitizeStaffTags(tags) },
    });
  }
}
