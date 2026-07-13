import { BadRequestException, Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';
import { ReservationAccessService } from './reservation-access.service';

// Accept only a strict restaurant-local calendar date (YYYY-MM-DD) and echo it
// back canonicalized. Rejects times, timezones, and impossible dates so the
// value stored compares cleanly against the availability engine's localDate.
function normalizeIsoDate(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const parsed = DateTime.fromISO(trimmed, { zone: 'utc' });
  if (!parsed.isValid) return null;
  return parsed.toISODate();
}

/**
 * Blackout-day (Feature 5) data-layer operations, exported as plain functions
 * so `ReservationsService` can reuse them without a new constructor
 * dependency — see `reservation-access.service.ts` for why.
 */
export async function listReservationBlackouts(
  prisma: PrismaService,
  restaurantId: string,
) {
  return prisma.reservationBlackout.findMany({
    where: { restaurantId },
    orderBy: { date: 'asc' },
  });
}

export async function addReservationBlackout(
  prisma: PrismaService,
  restaurantId: string,
  date: string,
  reason?: string | null,
) {
  const normalized = normalizeIsoDate(date);
  if (!normalized) {
    throw new BadRequestException('Invalid date — expected YYYY-MM-DD');
  }
  const trimmedReason = reason?.trim() || null;
  return prisma.reservationBlackout.upsert({
    where: { restaurantId_date: { restaurantId, date: normalized } },
    create: { restaurantId, date: normalized, reason: trimmedReason },
    update: { reason: trimmedReason },
  });
}

export async function removeReservationBlackout(
  prisma: PrismaService,
  restaurantId: string,
  date: string,
) {
  const normalized = normalizeIsoDate(date);
  if (!normalized) {
    throw new BadRequestException('Invalid date — expected YYYY-MM-DD');
  }
  await prisma.reservationBlackout.deleteMany({
    where: { restaurantId, date: normalized },
  });
  return { success: true };
}

@Injectable()
export class ReservationBlackoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ReservationAccessService,
  ) {}

  async listBlackouts(restaurantId: string, userId: string) {
    const role = await this.access.resolveActor(restaurantId, userId);
    this.access.assertRole(role, ['MANAGER']);
    return listReservationBlackouts(this.prisma, restaurantId);
  }

  async addBlackout(
    restaurantId: string,
    userId: string,
    date: string,
    reason?: string | null,
  ) {
    const role = await this.access.resolveActor(restaurantId, userId);
    this.access.assertRole(role, ['MANAGER']);
    return addReservationBlackout(this.prisma, restaurantId, date, reason);
  }

  async removeBlackout(restaurantId: string, userId: string, date: string) {
    const role = await this.access.resolveActor(restaurantId, userId);
    this.access.assertRole(role, ['MANAGER']);
    return removeReservationBlackout(this.prisma, restaurantId, date);
  }
}
