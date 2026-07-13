import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReservationAccessService } from './reservation-access.service';
import { sanitizeCustomPreferenceLabels } from './reservation-tags';

export interface ReservationServiceHoursRow {
  weekday: number;
  openMinute: number;
  lastSlotMinute: number;
}

/**
 * Pure data-layer operations behind the settings / service-hours endpoints.
 * Exported as plain functions (not only as methods on the `@Injectable` class
 * below) so `ReservationsService` can reuse the exact same logic without
 * taking on a new constructor dependency — its constructor shape is pinned by
 * existing tests that construct it positionally.
 */
export async function getReservationSettings(
  prisma: PrismaService,
  restaurantId: string,
) {
  const [settings, hours] = await Promise.all([
    prisma.reservationSettings.findUnique({ where: { restaurantId } }),
    prisma.reservationServiceHours.findMany({
      where: { restaurantId },
      orderBy: { weekday: 'asc' },
    }),
  ]);
  return { settings, serviceHours: hours };
}

export async function updateReservationSettings(
  prisma: PrismaService,
  restaurantId: string,
  data: Record<string, unknown>,
  requireEntitlement: (restaurantId: string) => Promise<unknown>,
) {
  if (data.enabled === true) {
    await requireEntitlement(restaurantId);
    const hours = await prisma.reservationServiceHours.count({
      where: { restaurantId },
    });
    if (hours === 0) {
      throw new BadRequestException(
        'Add at least one service-hours row before enabling reservations',
      );
    }
  }

  // Sanitize owner-defined preference labels (trim/dedupe/cap) before storing.
  if ('customPreferences' in data) {
    data = {
      ...data,
      customPreferences: sanitizeCustomPreferenceLabels(data.customPreferences),
    };
  }

  return prisma.reservationSettings.upsert({
    where: { restaurantId },
    create: { restaurantId, ...(data as any) },
    update: data as any,
  });
}

export async function setReservationServiceHours(
  prisma: PrismaService,
  restaurantId: string,
  rows: ReservationServiceHoursRow[],
) {
  for (const row of rows) {
    if (row.lastSlotMinute < row.openMinute) {
      throw new BadRequestException(
        `Weekday ${row.weekday}: last slot cannot be before opening`,
      );
    }
  }
  await prisma.$transaction(async (tx) => {
    for (const row of rows) {
      await tx.reservationServiceHours.upsert({
        where: {
          restaurantId_weekday: { restaurantId, weekday: row.weekday },
        },
        create: { restaurantId, ...row },
        update: {
          openMinute: row.openMinute,
          lastSlotMinute: row.lastSlotMinute,
        },
      });
    }
  });
  return prisma.reservationServiceHours.findMany({
    where: { restaurantId },
    orderBy: { weekday: 'asc' },
  });
}

export async function deleteReservationServiceHours(
  prisma: PrismaService,
  restaurantId: string,
  weekday: number,
) {
  await prisma.reservationServiceHours.deleteMany({
    where: { restaurantId, weekday },
  });
  return { success: true };
}

@Injectable()
export class ReservationSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ReservationAccessService,
  ) {}

  async getSettings(restaurantId: string, userId: string) {
    const role = await this.access.resolveActor(restaurantId, userId);
    this.access.assertRole(role, ['MANAGER']);
    return getReservationSettings(this.prisma, restaurantId);
  }

  async updateSettings(
    restaurantId: string,
    userId: string,
    data: Record<string, unknown>,
  ) {
    const role = await this.access.resolveActor(restaurantId, userId);
    this.access.assertRole(role, ['MANAGER']);
    return updateReservationSettings(this.prisma, restaurantId, data, (id) =>
      this.access.requireEntitlement(id),
    );
  }

  async setServiceHours(
    restaurantId: string,
    userId: string,
    rows: ReservationServiceHoursRow[],
  ) {
    const role = await this.access.resolveActor(restaurantId, userId);
    this.access.assertRole(role, ['MANAGER']);
    return setReservationServiceHours(this.prisma, restaurantId, rows);
  }

  async deleteServiceHours(
    restaurantId: string,
    userId: string,
    weekday: number,
  ) {
    const role = await this.access.resolveActor(restaurantId, userId);
    this.access.assertRole(role, ['MANAGER']);
    return deleteReservationServiceHours(this.prisma, restaurantId, weekday);
  }
}
