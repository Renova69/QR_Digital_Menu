import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Prisma, ReservationOccasion } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { FeatureService } from '../subscription/feature.service';
import { FeatureFlag } from '../subscription/feature-flag.enum';
import { ReservationAvailabilityService } from './reservation-availability.service';
import { ReservationAllergensService } from './reservation-allergens.service';
import { PatronService } from './patron.service';
import { ReservationNotificationsService } from './reservation-notifications.service';
import {
  hasDietaryPreference,
  sanitizeCustomerPreferences,
  sanitizeCustomPreferenceLabels,
  sanitizeStaffTags,
} from './reservation-tags';
import { CreateReservationDto } from './dto/public-reservation.dto';
import {
  ManualReservationDto,
  ReservationActionType,
} from './dto/reservation-ops.dto';

type ActorRole = 'OWNER' | 'MANAGER' | 'WAITER' | 'STAFF' | 'SUPER_ADMIN';

// action -> { from statuses allowed, target, roles beyond OWNER/SUPER_ADMIN }
const ACTION_RULES: Record<
  ReservationActionType,
  { from: string[]; to: string; roles: ActorRole[]; afterStart?: boolean }
> = {
  ACCEPT: { from: ['PENDING'], to: 'CONFIRMED', roles: ['MANAGER'] },
  DECLINE: { from: ['PENDING'], to: 'DECLINED', roles: ['MANAGER'] },
  CANCEL: {
    from: ['PENDING', 'CONFIRMED'],
    to: 'CANCELLED',
    roles: ['MANAGER'],
  },
  NO_SHOW: {
    from: ['CONFIRMED'],
    to: 'NO_SHOW',
    roles: ['MANAGER', 'WAITER'],
    afterStart: true,
  },
  ARRIVED: {
    from: ['CONFIRMED'],
    to: 'ARRIVED',
    roles: ['MANAGER', 'WAITER', 'STAFF'],
  },
};

const REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

@Injectable()
export class ReservationsService {
  private readonly logger = new Logger(ReservationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: ReservationAvailabilityService,
    private readonly allergens: ReservationAllergensService,
    private readonly patrons: PatronService,
    private readonly features: FeatureService,
    private readonly events: EventsGateway,
    private readonly notifications: ReservationNotificationsService,
  ) {}

  // ── Access control ──────────────────────────────────────────────────────

  private async resolveActor(
    restaurantId: string,
    userId: string,
  ): Promise<ActorRole> {
    const [restaurant, user] = await Promise.all([
      this.prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { ownerId: true },
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { restaurantId: true, role: true },
      }),
    ]);
    if (!restaurant) throw new NotFoundException('Restaurant not found');
    if (user?.role === 'SUPER_ADMIN') return 'SUPER_ADMIN';
    if (restaurant.ownerId === userId) return 'OWNER';
    // KITCHEN never touches reservations (no guest PII).
    if (
      user?.restaurantId === restaurantId &&
      (user.role === 'MANAGER' ||
        user.role === 'WAITER' ||
        user.role === 'STAFF')
    ) {
      return user.role as ActorRole;
    }
    throw new ForbiddenException(
      'You do not have permission to access reservations for this restaurant',
    );
  }

  private assertRole(role: ActorRole, allowed: ActorRole[]): void {
    if (role === 'OWNER' || role === 'SUPER_ADMIN') return;
    if (!allowed.includes(role)) {
      throw new ForbiddenException(
        'Your role cannot perform this reservation action',
      );
    }
  }

  private async requireEntitlement(restaurantId: string): Promise<void> {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { tier: true, forceTier: true },
    });
    if (
      !this.features.restaurantHasFeature(restaurant, FeatureFlag.RESERVATIONS)
    ) {
      throw new ForbiddenException({
        code: 'FEATURE_LOCKED',
        message: 'Reservations require a Professional plan or above',
      });
    }
  }

  // ── Public surface ──────────────────────────────────────────────────────

  async getPublicConfig(restaurantId: string) {
    const [restaurant, settings] = await Promise.all([
      this.prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: {
          name: true,
          logoUrl: true,
          address: true,
          contactInfo: true,
          timezone: true,
          tier: true,
          forceTier: true,
          isActive: true,
          // Branding + theme so the booking page matches the public menu.
          accentColor: true,
          defaultTheme: true,
          themeBgColor: true,
          themeTextColor: true,
          themeCardColor: true,
          themeLightBgColor: true,
          themeLightTextColor: true,
          themeLightCardColor: true,
          themeLightAccentColor: true,
          themeDarkBgColor: true,
          themeDarkTextColor: true,
          themeDarkCardColor: true,
          themeDarkAccentColor: true,
          targetLanguages: true,
          dashboardLanguage: true,
        },
      }),
      this.prisma.reservationSettings.findUnique({ where: { restaurantId } }),
    ]);
    if (!restaurant) throw new NotFoundException('Restaurant not found');

    const entitled = this.features.restaurantHasFeature(
      restaurant,
      FeatureFlag.RESERVATIONS,
    );
    const enabled = !!settings?.enabled && entitled && restaurant.isActive;

    const allergenSummary =
      enabled && settings?.allergenSectionEnabled
        ? await this.allergens.getMenuAllergenSummary(restaurantId)
        : { allergens: [], dietaryTags: [] };

    const defaultLanguage = restaurant.dashboardLanguage || 'bg';
    const languages = [
      ...new Set([defaultLanguage, ...(restaurant.targetLanguages ?? [])]),
    ];

    return {
      enabled,
      restaurant: {
        name: restaurant.name,
        logoUrl: restaurant.logoUrl,
        address: restaurant.address,
        contactInfo: restaurant.contactInfo,
        timezone: restaurant.timezone,
        accentColor: restaurant.accentColor,
        defaultTheme: restaurant.defaultTheme,
        themeBgColor: restaurant.themeBgColor,
        themeTextColor: restaurant.themeTextColor,
        themeCardColor: restaurant.themeCardColor,
        themeLightBgColor: restaurant.themeLightBgColor,
        themeLightTextColor: restaurant.themeLightTextColor,
        themeLightCardColor: restaurant.themeLightCardColor,
        themeLightAccentColor: restaurant.themeLightAccentColor,
        themeDarkBgColor: restaurant.themeDarkBgColor,
        themeDarkTextColor: restaurant.themeDarkTextColor,
        themeDarkCardColor: restaurant.themeDarkCardColor,
        themeDarkAccentColor: restaurant.themeDarkAccentColor,
      },
      languages,
      defaultLanguage,
      policy: enabled
        ? {
            slotIntervalMinutes: settings!.slotIntervalMinutes,
            minLeadMinutes: settings!.minLeadMinutes,
            bookingHorizonDays: settings!.bookingHorizonDays,
            maxTotalGuests: settings!.maxTotalGuests,
            requirePhone: settings!.requirePhone,
            allergenSectionEnabled: settings!.allergenSectionEnabled,
            customPreferences: settings!.customPreferences ?? [],
          }
        : null,
      allergens: allergenSummary,
    };
  }

  async getPublicAvailability(
    restaurantId: string,
    date: string,
    adults: number,
    children: number,
  ) {
    await this.requireEntitlement(restaurantId);
    const slots = await this.availability.getSlots(
      restaurantId,
      date,
      adults + children,
    );
    return { slots };
  }

  async getPublicStatus(restaurantId: string, referenceCode: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: {
        restaurantId_referenceCode: { restaurantId, referenceCode },
      },
      select: { referenceCode: true, status: true, startsAt: true },
    });
    if (!reservation) throw new NotFoundException('Reservation not found');
    return reservation; // non-secret fields only
  }

  async createPublic(restaurantId: string, dto: CreateReservationDto) {
    await this.requireEntitlement(restaurantId);
    const settings = await this.prisma.reservationSettings.findUnique({
      where: { restaurantId },
    });
    if (!settings?.enabled) {
      throw new ForbiddenException('Reservations are not open for booking');
    }
    return this.createReservation(restaurantId, dto, {
      source: 'PUBLIC',
      settings,
    });
  }

  async createManual(
    restaurantId: string,
    userId: string,
    dto: ManualReservationDto,
  ) {
    const role = await this.resolveActor(restaurantId, userId);
    this.assertRole(role, ['MANAGER', 'WAITER']);
    const settings = await this.prisma.reservationSettings.findUnique({
      where: { restaurantId },
    });
    return this.createReservation(restaurantId, dto, {
      source: 'STAFF',
      settings,
      createdById: userId,
      internalNotes: dto.internalNotes,
      staffTags: dto.staffTags,
      skipConsentGate: true,
    });
  }

  private async createReservation(
    restaurantId: string,
    dto: CreateReservationDto,
    ctx: {
      source: 'PUBLIC' | 'STAFF';
      settings: {
        maxTotalGuests: number;
        autoConfirm: boolean;
        requirePhone: boolean;
        customPreferences?: string[];
      } | null;
      createdById?: string;
      internalNotes?: string;
      staffTags?: string[];
      skipConsentGate?: boolean;
    },
  ) {
    const phone = this.normalizePhone(dto.guestPhone);
    if ((ctx.settings?.requirePhone ?? true) && !phone) {
      throw new BadRequestException('A valid phone number is required');
    }
    const adults = dto.adultsCount;
    const children = dto.childrenCount ?? 0;
    const total = adults + children;
    const maxTotal = ctx.settings?.maxTotalGuests ?? 50;
    if (total < 1 || total > maxTotal) {
      throw new BadRequestException(
        `Party size must be between 1 and ${maxTotal}`,
      );
    }

    const startsAt = new Date(dto.startsAt);
    if (isNaN(startsAt.getTime())) {
      throw new BadRequestException('Invalid reservation time');
    }

    // Consent gate: only persist dietary/allergy (special-category) data when
    // the guest explicitly consented. Staff manual bookings bypass the gate.
    // Owner-defined custom preference labels are allowed through validation too.
    const preferences = sanitizeCustomerPreferences(
      dto.customerPreferences,
      ctx.settings?.customPreferences ?? [],
    );
    const consented = ctx.skipConsentGate || dto.dietaryConsent === true;
    const dietaryPresent =
      hasDietaryPreference(preferences) || !!dto.allergyNotes?.trim();
    const storeDietary = consented && dietaryPresent;
    const customerPreferences = storeDietary
      ? preferences
      : preferences.filter((p) => !isDietary(p));
    const allergyNotes = storeDietary ? dto.allergyNotes?.trim() || null : null;
    const dietaryConsentAt = storeDietary ? new Date() : null;

    // Idempotent replay: same key for this restaurant returns the first result.
    if (dto.idempotencyKey) {
      const existing = await this.prisma.reservation.findUnique({
        where: {
          restaurantId_idempotencyKey: {
            restaurantId,
            idempotencyKey: dto.idempotencyKey,
          },
        },
      });
      if (existing) return this.toCreateResult(existing);
    }

    const autoConfirm = ctx.settings?.autoConfirm ?? false;
    const status = autoConfirm ? 'CONFIRMED' : 'PENDING';
    const marketingConsentAt =
      dto.marketingConsent === true ? new Date() : null;

    const created = await this.withReferenceRetry(async (referenceCode) =>
      this.prisma.$transaction(async (tx) => {
        const patron = await this.patrons.matchOrCreate(
          tx,
          restaurantId,
          phone,
          dto.guestName.trim(),
          dto.guestEmail,
        );
        // Patron-level updates (staff tags, durable marketing opt-in). Marketing
        // consent is sticky once given; a later booking without it doesn't revoke.
        const patronData: Record<string, unknown> = {};
        if (ctx.staffTags?.length) {
          patronData.staffTags = sanitizeStaffTags(ctx.staffTags);
        }
        if (marketingConsentAt) {
          patronData.marketingConsent = true;
          patronData.marketingConsentAt = marketingConsentAt;
        }
        if (Object.keys(patronData).length > 0) {
          await tx.patron.update({
            where: { id: patron.id },
            data: patronData,
          });
        }
        const reservation = await tx.reservation.create({
          data: {
            restaurantId,
            patronId: patron.id,
            referenceCode,
            source: ctx.source,
            status,
            guestName: dto.guestName.trim(),
            guestPhone: phone,
            guestEmail: dto.guestEmail?.trim() || null,
            startsAt,
            occasion: dto.occasion ?? ReservationOccasion.NONE,
            adultsCount: adults,
            childrenCount: children,
            customerNotes: dto.customerNotes?.trim() || null,
            internalNotes: ctx.internalNotes?.trim() || null,
            customerPreferences,
            allergyNotes,
            dietaryConsentAt,
            marketingConsentAt,
            idempotencyKey: dto.idempotencyKey ?? null,
            createdById: ctx.createdById ?? null,
          },
        });
        await tx.reservationEvent.create({
          data: {
            reservationId: reservation.id,
            type: 'CREATED',
            actorUserId: ctx.createdById ?? null,
            metadata: { source: ctx.source, status },
          },
        });
        return reservation;
      }),
    );

    this.events.emitReservationCreated(restaurantId, {
      id: created.id,
      referenceCode: created.referenceCode,
      status: created.status,
      startsAt: created.startsAt,
      guestName: created.guestName,
      totalGuests: created.adultsCount + created.childrenCount,
    });

    // Guest email: "received" for a pending request, "confirmed" if auto-confirmed.
    this.notifications.notify(
      created.status === 'CONFIRMED' ? 'CONFIRMED' : 'RECEIVED',
      {
        restaurantId,
        guestEmail: created.guestEmail,
        guestName: created.guestName,
        startsAt: created.startsAt,
        referenceCode: created.referenceCode,
      },
    );

    return this.toCreateResult(created);
  }

  // ── Dashboard surface ───────────────────────────────────────────────────

  async list(
    restaurantId: string,
    userId: string,
    query: { date?: string; status?: string; upcoming?: string },
  ) {
    await this.resolveActor(restaurantId, userId);
    const where: Prisma.ReservationWhereInput = { restaurantId };

    if (query.upcoming === 'true' || query.upcoming === '1') {
      // Always-on summary: every still-actionable booking from the start of
      // today forward, across all days, ordered by time. Ignores the date
      // filter and only surfaces the statuses staff still need to act on.
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      where.startsAt = { gte: startOfToday };
      // Show real upcoming bookings (needs-action + confirmed + already seated);
      // hide the dead ones (DECLINED / CANCELLED / NO_SHOW).
      where.status = { in: ['PENDING', 'CONFIRMED', 'ARRIVED'] as any };
    } else {
      if (query.status) where.status = query.status as any;
      if (query.date) {
        const start = new Date(`${query.date}T00:00:00.000Z`);
        const end = new Date(`${query.date}T23:59:59.999Z`);
        if (!isNaN(start.getTime())) where.startsAt = { gte: start, lte: end };
      }
    }

    const rows = await this.prisma.reservation.findMany({
      where,
      orderBy: { startsAt: 'asc' },
      include: { patron: { select: { staffTags: true, staffNotes: true } } },
      take: 500,
    });
    return rows.map((r) => this.toStaffView(r));
  }

  async executeAction(
    reservationId: string,
    userId: string,
    restaurantId: string,
    action: ReservationActionType,
    reason?: string,
  ) {
    const role = await this.resolveActor(restaurantId, userId);
    const rule = ACTION_RULES[action];
    this.assertRole(role, rule.roles);

    const reservation = await this.prisma.reservation.findFirst({
      where: { id: reservationId, restaurantId },
    });
    if (!reservation) throw new NotFoundException('Reservation not found');

    if (rule.afterStart && reservation.startsAt.getTime() > Date.now()) {
      throw new BadRequestException(
        'Cannot mark no-show before the reservation start time',
      );
    }

    // Guarded compare-and-swap: only the caller that finds an allowed source
    // status wins; a concurrent double-action no-ops.
    const { count } = await this.prisma.reservation.updateMany({
      where: {
        id: reservationId,
        restaurantId,
        status: { in: rule.from as any },
      },
      data: { status: rule.to as any },
    });
    if (count === 0) {
      throw new ConflictException(
        'Reservation is not in a state that allows this action',
      );
    }

    await this.prisma.reservationEvent.create({
      data: {
        reservationId,
        type: action,
        actorUserId: userId,
        metadata: reason ? { reason } : undefined,
      },
    });

    this.events.emitReservationUpdated(restaurantId, {
      id: reservationId,
      status: rule.to,
    });

    // Guest email on the decisions that matter to them.
    if (action === 'ACCEPT' || action === 'DECLINE') {
      this.notifications.notify(
        action === 'ACCEPT' ? 'CONFIRMED' : 'DECLINED',
        {
          restaurantId,
          guestEmail: reservation.guestEmail,
          guestName: reservation.guestName,
          startsAt: reservation.startsAt,
          referenceCode: reservation.referenceCode,
        },
      );
    }

    const updated = await this.prisma.reservation.findFirst({
      where: { id: reservationId, restaurantId },
      include: { patron: { select: { staffTags: true, staffNotes: true } } },
    });
    return this.toStaffView(updated!);
  }

  async updateInternal(
    reservationId: string,
    userId: string,
    restaurantId: string,
    data: { internalNotes?: string; staffTags?: string[] },
  ) {
    const role = await this.resolveActor(restaurantId, userId);
    this.assertRole(role, ['MANAGER', 'WAITER']);

    const reservation = await this.prisma.reservation.findFirst({
      where: { id: reservationId, restaurantId },
      select: { id: true, patronId: true },
    });
    if (!reservation) throw new NotFoundException('Reservation not found');

    if (data.internalNotes !== undefined) {
      await this.prisma.reservation.update({
        where: { id: reservationId },
        data: { internalNotes: data.internalNotes.trim() || null },
      });
    }
    if (data.staffTags !== undefined && reservation.patronId) {
      await this.patrons.setStaffTags(reservation.patronId, data.staffTags);
    }

    const updated = await this.prisma.reservation.findFirst({
      where: { id: reservationId, restaurantId },
      include: { patron: { select: { staffTags: true, staffNotes: true } } },
    });
    return this.toStaffView(updated!);
  }

  // ── Settings & service hours ────────────────────────────────────────────

  async getSettings(restaurantId: string, userId: string) {
    const role = await this.resolveActor(restaurantId, userId);
    this.assertRole(role, ['MANAGER']);
    const [settings, hours] = await Promise.all([
      this.prisma.reservationSettings.findUnique({ where: { restaurantId } }),
      this.prisma.reservationServiceHours.findMany({
        where: { restaurantId },
        orderBy: { weekday: 'asc' },
      }),
    ]);
    return { settings, serviceHours: hours };
  }

  async updateSettings(
    restaurantId: string,
    userId: string,
    data: Record<string, unknown>,
  ) {
    const role = await this.resolveActor(restaurantId, userId);
    this.assertRole(role, ['MANAGER']);

    if (data.enabled === true) {
      await this.requireEntitlement(restaurantId);
      const hours = await this.prisma.reservationServiceHours.count({
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
        customPreferences: sanitizeCustomPreferenceLabels(
          data.customPreferences,
        ),
      };
    }

    const settings = await this.prisma.reservationSettings.upsert({
      where: { restaurantId },
      create: { restaurantId, ...(data as any) },
      update: data as any,
    });
    return settings;
  }

  async setServiceHours(
    restaurantId: string,
    userId: string,
    rows: { weekday: number; openMinute: number; lastSlotMinute: number }[],
  ) {
    const role = await this.resolveActor(restaurantId, userId);
    this.assertRole(role, ['MANAGER']);
    for (const row of rows) {
      if (row.lastSlotMinute < row.openMinute) {
        throw new BadRequestException(
          `Weekday ${row.weekday}: last slot cannot be before opening`,
        );
      }
    }
    await this.prisma.$transaction(async (tx) => {
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
    return this.prisma.reservationServiceHours.findMany({
      where: { restaurantId },
      orderBy: { weekday: 'asc' },
    });
  }

  async deleteServiceHours(
    restaurantId: string,
    userId: string,
    weekday: number,
  ) {
    const role = await this.resolveActor(restaurantId, userId);
    this.assertRole(role, ['MANAGER']);
    await this.prisma.reservationServiceHours.deleteMany({
      where: { restaurantId, weekday },
    });
    return { success: true };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private toCreateResult(r: {
    referenceCode: string;
    status: string;
    startsAt: Date;
  }) {
    return {
      referenceCode: r.referenceCode,
      status: r.status,
      startsAt: r.startsAt,
    };
  }

  private toStaffView(r: any) {
    return {
      id: r.id,
      referenceCode: r.referenceCode,
      status: r.status,
      source: r.source,
      startsAt: r.startsAt,
      guestName: r.guestName,
      guestPhone: r.guestPhone,
      guestEmail: r.guestEmail,
      adultsCount: r.adultsCount,
      childrenCount: r.childrenCount,
      totalGuests: r.adultsCount + r.childrenCount,
      occasion: r.occasion,
      customerNotes: r.customerNotes,
      internalNotes: r.internalNotes,
      customerPreferences: r.customerPreferences ?? [],
      allergyNotes: r.allergyNotes,
      staffTags: r.patron?.staffTags ?? [],
      marketingConsent: !!r.marketingConsentAt,
      createdAt: r.createdAt,
    };
  }

  private normalizePhone(raw: string | undefined): string {
    const cleaned = (raw ?? '').replace(/[^\d+]/g, '');
    if (!cleaned) return '';
    if (cleaned.startsWith('+')) return cleaned;
    if (cleaned.startsWith('00')) return `+${cleaned.slice(2)}`;
    if (cleaned.startsWith('0')) return `+359${cleaned.slice(1)}`;
    return `+359${cleaned}`;
  }

  private generateReferenceCode(): string {
    const bytes = randomBytes(6);
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += REFERENCE_ALPHABET[bytes[i] % REFERENCE_ALPHABET.length];
    }
    return code;
  }

  private async withReferenceRetry<T extends { referenceCode: string }>(
    fn: (referenceCode: string) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        return await fn(this.generateReferenceCode());
      } catch (err) {
        const isRefCollision =
          (err as { code?: string }).code === 'P2002' &&
          String((err as any)?.meta?.target ?? '').includes('referenceCode');
        if (isRefCollision && attempt < 3) continue;
        throw err;
      }
    }
    throw new ConflictException('Could not allocate a reservation reference');
  }
}

function isDietary(pref: string): boolean {
  return hasDietaryPreference([pref]);
}
