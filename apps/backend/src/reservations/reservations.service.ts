import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { DateTime } from 'luxon';
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
      return user.role;
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
    const [restaurant, settings, zoneRows] = await Promise.all([
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
      // Feature 3: seating zones reuse the POS table zones the owner already
      // set. Return the preset `key` (translatable on the booking form) plus the
      // raw `name` as a fallback for fully custom zones.
      this.prisma.tableZone.findMany({
        where: { restaurantId },
        orderBy: { displayOrder: 'asc' },
        select: { name: true, zoneKey: true },
      }),
    ]);
    if (!restaurant) throw new NotFoundException('Restaurant not found');

    const zones = zoneRows.map((z) => ({ key: z.zoneKey, name: z.name }));

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
            slotIntervalMinutes: settings.slotIntervalMinutes,
            minLeadMinutes: settings.minLeadMinutes,
            bookingHorizonDays: settings.bookingHorizonDays,
            maxTotalGuests: settings.maxTotalGuests,
            requirePhone: settings.requirePhone,
            allergenSectionEnabled: settings.allergenSectionEnabled,
            customPreferences: settings.customPreferences ?? [],
            zones,
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

  // ── Guest self-service via private manage token (Feature 2) ───────────────

  private async loadByToken(restaurantId: string, token: string) {
    const trimmed = (token || '').trim();
    if (!trimmed) throw new NotFoundException('Reservation not found');
    const reservation = await this.prisma.reservation.findUnique({
      where: { manageToken: trimmed },
    });
    // The token is the credential; still bind it to the restaurant in the URL so
    // a token can't be replayed against the wrong tenant's public page.
    if (!reservation || reservation.restaurantId !== restaurantId) {
      throw new NotFoundException('Reservation not found');
    }
    return reservation;
  }

  async getByManageToken(restaurantId: string, token: string) {
    const r = await this.loadByToken(restaurantId, token);
    const settings = await this.prisma.reservationSettings.findUnique({
      where: { restaurantId },
    });
    const modifiable =
      (r.status === 'PENDING' || r.status === 'CONFIRMED') &&
      r.startsAt.getTime() > Date.now();
    return {
      referenceCode: r.referenceCode,
      status: r.status,
      startsAt: r.startsAt,
      guestName: r.guestName,
      adultsCount: r.adultsCount,
      childrenCount: r.childrenCount,
      totalGuests: r.adultsCount + r.childrenCount,
      occasion: r.occasion,
      preferredZone: r.preferredZone,
      canModify: modifiable,
      canCancel: modifiable,
      policy: {
        maxTotalGuests: settings?.maxTotalGuests ?? 12,
        slotIntervalMinutes: settings?.slotIntervalMinutes ?? 30,
        minLeadMinutes: settings?.minLeadMinutes ?? 60,
        bookingHorizonDays: settings?.bookingHorizonDays ?? 60,
      },
    };
  }

  async cancelByManageToken(restaurantId: string, token: string) {
    const r = await this.loadByToken(restaurantId, token);

    // Guarded CAS: only a live booking can be self-cancelled; a concurrent
    // staff action or double-submit no-ops.
    const { count } = await this.prisma.reservation.updateMany({
      where: {
        id: r.id,
        restaurantId,
        status: { in: ['PENDING', 'CONFIRMED'] },
      },
      data: { status: 'CANCELLED' },
    });
    if (count === 0) {
      throw new ConflictException(
        'This reservation can no longer be cancelled. Please contact the restaurant.',
      );
    }

    await this.prisma.reservationEvent.create({
      data: {
        reservationId: r.id,
        type: 'CANCEL',
        metadata: { source: 'GUEST' },
      },
    });
    this.events.emitReservationUpdated(restaurantId, {
      id: r.id,
      status: 'CANCELLED',
    });
    this.notifications.notify('CANCELLED', {
      restaurantId,
      guestEmail: r.guestEmail,
      guestPhone: r.guestPhone,
      guestName: r.guestName,
      startsAt: r.startsAt,
      referenceCode: r.referenceCode,
      notifyByEmail: r.notifyByEmail,
      notifyBySms: r.notifyBySms,
    });
    return { status: 'CANCELLED' as const };
  }

  async modifyByManageToken(
    restaurantId: string,
    token: string,
    dto: { startsAt?: string; adultsCount?: number; childrenCount?: number },
  ) {
    const r = await this.loadByToken(restaurantId, token);

    if (r.status !== 'PENDING' && r.status !== 'CONFIRMED') {
      throw new ConflictException(
        'This reservation can no longer be changed. Please contact the restaurant.',
      );
    }
    if (r.startsAt.getTime() <= Date.now()) {
      throw new ConflictException(
        'This reservation has already started and cannot be changed.',
      );
    }

    const adults = dto.adultsCount ?? r.adultsCount;
    const children = dto.childrenCount ?? r.childrenCount;
    const total = adults + children;

    let startsAt = r.startsAt;
    if (dto.startsAt) {
      startsAt = new Date(dto.startsAt);
      if (isNaN(startsAt.getTime())) {
        throw new BadRequestException('Invalid reservation time');
      }
    }
    const slotChanged = startsAt.getTime() !== r.startsAt.getTime();

    const settings = await this.prisma.reservationSettings.findUnique({
      where: { restaurantId },
    });

    if (slotChanged) {
      // Moving to a different time must satisfy the full guard (hours, lead,
      // horizon, blackout, capacity) — excluding this reservation's own hold.
      await this.availability.assertSlotBookable(
        restaurantId,
        startsAt,
        total,
        r.id,
      );
    } else {
      // Same slot, party-size-only change: the time is already an accepted
      // booking, so re-applying the lead-time/hours guard would wrongly reject
      // an edit made inside the lead window. Enforce only the hard party cap.
      const maxTotal = settings?.maxTotalGuests ?? 12;
      if (total < 1 || total > maxTotal) {
        throw new BadRequestException(
          `Party size must be between 1 and ${maxTotal}`,
        );
      }
    }

    // Feature 4: a party-size change moves the expected turnover, so re-snapshot
    // the dining duration (else the staff "table free" time would go stale).
    const durationMinutes = computeDiningDuration(total, settings);

    // Guarded CAS on BOTH status and updatedAt: a concurrent staff decision or a
    // second modify (retry / shared link) that already wrote bumps updatedAt, so
    // this write no-ops instead of silently clobbering it (last-writer-wins).
    // Resetting reminderSentAt on a time change re-arms the 24h reminder for the
    // new slot; a party-only change keeps the existing reminder state.
    const { count } = await this.prisma.reservation.updateMany({
      where: {
        id: r.id,
        restaurantId,
        status: r.status,
        updatedAt: r.updatedAt,
      },
      data: {
        startsAt,
        adultsCount: adults,
        childrenCount: children,
        durationMinutes,
        ...(slotChanged ? { reminderSentAt: null } : {}),
      },
    });
    if (count === 0) {
      throw new ConflictException(
        'This reservation was just updated elsewhere. Please reload.',
      );
    }

    await this.prisma.reservationEvent.create({
      data: {
        reservationId: r.id,
        type: 'MODIFIED',
        metadata: {
          source: 'GUEST',
          startsAt: startsAt.toISOString(),
          adultsCount: adults,
          childrenCount: children,
        },
      },
    });
    this.events.emitReservationUpdated(restaurantId, {
      id: r.id,
      status: r.status,
    });
    // Re-send the guest the current-state notice with the new details.
    this.notifications.notify(
      r.status === 'CONFIRMED' ? 'CONFIRMED' : 'RECEIVED',
      {
        restaurantId,
        guestEmail: r.guestEmail,
        guestPhone: r.guestPhone,
        guestName: r.guestName,
        startsAt,
        referenceCode: r.referenceCode,
        notifyByEmail: r.notifyByEmail,
        notifyBySms: r.notifyBySms,
        manageToken: r.manageToken,
      },
    );

    return {
      status: r.status,
      startsAt,
      adultsCount: adults,
      childrenCount: children,
      totalGuests: total,
    };
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
        notifyEmail?: string | null;
        notifyPhone?: string | null;
        diningDurationMinutes?: number;
        largePartyThreshold?: number;
        largePartyDurationMinutes?: number;
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

    // Fixes 1 + 2: re-validate the slot server-side for public bookings (in
    // service hours, within lead/horizon, not full). Staff manual bookings are
    // trusted and may book outside hours (e.g. taking a phone booking).
    if (ctx.source === 'PUBLIC') {
      await this.availability.assertSlotBookable(restaurantId, startsAt, total);
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
    // Only the guest can grant marketing consent. A staff-entered (STAFF) phone
    // booking must never record durable patron marketing opt-in on the guest's
    // behalf, even if the field is set on the DTO.
    const marketingConsentAt =
      ctx.source === 'PUBLIC' && dto.marketingConsent === true
        ? new Date()
        : null;

    // Feature 1: notification channels. Default to email when unspecified and an
    // address was given; SMS only when the guest opted in (phone is mandatory).
    const notifyByEmail = dto.notifyByEmail ?? !!dto.guestEmail?.trim();
    const notifyBySms = dto.notifyBySms ?? false;

    // Feature 3: accept a preferred seating zone only when it matches a zone the
    // restaurant actually has. The client sends the preset key (e.g. TERRACE)
    // or, for a custom zone, its name — match either. Store the preset key when
    // the zone has one so the dashboard can translate it; else store the name.
    let preferredZone: string | null = null;
    const requestedZone = dto.preferredZone?.trim();
    if (requestedZone) {
      const match = await this.prisma.tableZone.findFirst({
        where: {
          restaurantId,
          OR: [{ zoneKey: requestedZone }, { name: requestedZone }],
        },
        select: { zoneKey: true, name: true },
      });
      preferredZone = match ? (match.zoneKey ?? match.name) : null;
    }

    // Feature 2: unguessable token for the guest's private self-service link.
    const manageToken = randomBytes(24).toString('base64url');

    // Feature 4: snapshot the expected dining duration for this party size.
    const durationMinutes = computeDiningDuration(total, ctx.settings);

    let created;
    try {
      created = await this.withReferenceRetry(async (referenceCode) =>
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
              notifyByEmail,
              notifyBySms,
              preferredZone,
              manageToken,
              durationMinutes,
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
    } catch (err) {
      // Idempotency race: two concurrent requests with the same key both passed
      // the earlier findUnique, and this one lost the unique-constraint insert.
      // Return the winner's row instead of surfacing a raw 500 (the whole point
      // of the idempotency key). Prisma's P2002 `meta.target` is a string[] (or
      // occasionally a string), so normalize before matching.
      const meta = (err as { code?: string; meta?: { target?: unknown } })
        ?.meta;
      const rawTarget = meta?.target;
      const target = Array.isArray(rawTarget)
        ? rawTarget.join(',')
        : typeof rawTarget === 'string'
          ? rawTarget
          : '';
      if (
        dto.idempotencyKey &&
        (err as { code?: string }).code === 'P2002' &&
        target.toLowerCase().includes('idempotency')
      ) {
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
      throw err;
    }

    this.events.emitReservationCreated(restaurantId, {
      id: created.id,
      referenceCode: created.referenceCode,
      status: created.status,
      startsAt: created.startsAt,
      guestName: created.guestName,
      totalGuests: created.adultsCount + created.childrenCount,
    });

    // Guest notification: "received" for a pending request, "confirmed" if
    // auto-confirmed. Sent over the channels the guest opted into (Feature 1).
    this.notifications.notify(
      created.status === 'CONFIRMED' ? 'CONFIRMED' : 'RECEIVED',
      {
        restaurantId,
        guestEmail: created.guestEmail,
        guestPhone: created.guestPhone,
        guestName: created.guestName,
        startsAt: created.startsAt,
        referenceCode: created.referenceCode,
        notifyByEmail: created.notifyByEmail,
        notifyBySms: created.notifyBySms,
        manageToken: created.manageToken,
      },
    );

    // Fix 5: notify the owner/manager of the new request (email and/or SMS).
    if (ctx.settings?.notifyEmail || ctx.settings?.notifyPhone) {
      this.notifications.notifyOwner({
        restaurantId,
        notifyEmail: ctx.settings.notifyEmail,
        notifyPhone: ctx.settings.notifyPhone,
        guestName: created.guestName,
        guestPhone: created.guestPhone,
        startsAt: created.startsAt,
        partySize: created.adultsCount + created.childrenCount,
        referenceCode: created.referenceCode,
      });
    }

    return this.toCreateResult(created);
  }

  // ── Dashboard surface ───────────────────────────────────────────────────

  async list(
    restaurantId: string,
    userId: string,
    query: { date?: string; status?: string; upcoming?: string },
  ) {
    await this.resolveActor(restaurantId, userId);
    // Fix 3: "today" and the date filter are interpreted in the RESTAURANT's
    // local timezone, not the server's — otherwise late-night bookings land on
    // the wrong day for a UTC+2/3 restaurant.
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { timezone: true },
    });
    const zone = restaurant?.timezone || 'Europe/Sofia';
    const where: Prisma.ReservationWhereInput = { restaurantId };

    if (query.upcoming === 'true' || query.upcoming === '1') {
      // Always-on summary: every still-actionable booking from the start of
      // today (restaurant-local) forward, across all days, ordered by time.
      where.startsAt = {
        gte: DateTime.now().setZone(zone).startOf('day').toJSDate(),
      };
      // Show real upcoming bookings (needs-action + confirmed + already seated);
      // hide the dead ones (DECLINED / CANCELLED / NO_SHOW).
      where.status = { in: ['PENDING', 'CONFIRMED', 'ARRIVED'] as any };
    } else {
      if (query.status) where.status = query.status as any;
      if (query.date) {
        const day = DateTime.fromISO(query.date, { zone });
        if (day.isValid) {
          where.startsAt = {
            gte: day.startOf('day').toJSDate(),
            lte: day.endOf('day').toJSDate(),
          };
        }
      }
    }

    const rows = await this.prisma.reservation.findMany({
      where,
      orderBy: { startsAt: 'asc' },
      include: {
        patron: { select: { staffTags: true, staffNotes: true } },
        events: {
          where: { type: 'MODIFIED' },
          select: { id: true, metadata: true },
          take: 1,
        },
      },
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

    // Guest email on the decisions that matter to them (Fix 4 adds CANCEL).
    const guestKind =
      action === 'ACCEPT'
        ? 'CONFIRMED'
        : action === 'DECLINE'
          ? 'DECLINED'
          : action === 'CANCEL'
            ? 'CANCELLED'
            : null;
    if (guestKind) {
      this.notifications.notify(guestKind, {
        restaurantId,
        guestEmail: reservation.guestEmail,
        guestPhone: reservation.guestPhone,
        guestName: reservation.guestName,
        startsAt: reservation.startsAt,
        referenceCode: reservation.referenceCode,
        notifyByEmail: reservation.notifyByEmail,
        notifyBySms: reservation.notifyBySms,
        manageToken: reservation.manageToken,
      });
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

  // ── Analytics (Feature 6) ────────────────────────────────────────────────

  async getAnalytics(restaurantId: string, userId: string) {
    const role = await this.resolveActor(restaurantId, userId);
    this.assertRole(role, ['MANAGER']);

    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { timezone: true },
    });
    const zone = restaurant?.timezone || 'Europe/Sofia';
    const windowDays = 30;
    const now = DateTime.now().setZone(zone);
    const since = now.minus({ days: windowDays }).startOf('day').toJSDate();
    const weekStart = now.minus({ days: 7 }).toJSDate();

    const rows = await this.prisma.reservation.findMany({
      where: { restaurantId, startsAt: { gte: since } },
      select: {
        startsAt: true,
        status: true,
        adultsCount: true,
        childrenCount: true,
      },
      take: 5000,
    });

    const statusCounts: Record<string, number> = {};
    const hourCounts = new Map<number, number>();
    let partySum = 0;
    let partyRows = 0;
    let thisWeek = 0;

    for (const r of rows) {
      statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;
      if (r.startsAt >= weekStart) thisWeek += 1;
      // Party-size average over bookings that represent real demand (exclude
      // declined/cancelled requests that never became a real party).
      if (r.status !== 'DECLINED' && r.status !== 'CANCELLED') {
        partySum += r.adultsCount + r.childrenCount;
        partyRows += 1;
        const hour = DateTime.fromJSDate(r.startsAt).setZone(zone).hour;
        hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);
      }
    }

    const popularHours = [...hourCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([hour, count]) => ({
        hour,
        label: `${String(hour).padStart(2, '0')}:00`,
        count,
      }));

    return {
      windowDays,
      total: rows.length,
      thisWeek,
      noShows: statusCounts['NO_SHOW'] ?? 0,
      avgPartySize:
        partyRows > 0 ? Math.round((partySum / partyRows) * 10) / 10 : 0,
      statusCounts,
      popularHours,
    };
  }

  // ── Blackout days (Feature 5) ────────────────────────────────────────────

  async listBlackouts(restaurantId: string, userId: string) {
    const role = await this.resolveActor(restaurantId, userId);
    this.assertRole(role, ['MANAGER']);
    return this.prisma.reservationBlackout.findMany({
      where: { restaurantId },
      orderBy: { date: 'asc' },
    });
  }

  async addBlackout(
    restaurantId: string,
    userId: string,
    date: string,
    reason?: string | null,
  ) {
    const role = await this.resolveActor(restaurantId, userId);
    this.assertRole(role, ['MANAGER']);
    const normalized = normalizeIsoDate(date);
    if (!normalized) {
      throw new BadRequestException('Invalid date — expected YYYY-MM-DD');
    }
    const trimmedReason = reason?.trim() || null;
    return this.prisma.reservationBlackout.upsert({
      where: { restaurantId_date: { restaurantId, date: normalized } },
      create: { restaurantId, date: normalized, reason: trimmedReason },
      update: { reason: trimmedReason },
    });
  }

  async removeBlackout(restaurantId: string, userId: string, date: string) {
    const role = await this.resolveActor(restaurantId, userId);
    this.assertRole(role, ['MANAGER']);
    const normalized = normalizeIsoDate(date);
    if (!normalized) {
      throw new BadRequestException('Invalid date — expected YYYY-MM-DD');
    }
    await this.prisma.reservationBlackout.deleteMany({
      where: { restaurantId, date: normalized },
    });
    return { success: true };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private toCreateResult(r: {
    referenceCode: string;
    status: string;
    startsAt: Date;
    manageToken?: string | null;
  }) {
    return {
      referenceCode: r.referenceCode,
      status: r.status,
      startsAt: r.startsAt,
      manageToken: r.manageToken ?? null,
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
      preferredZone: r.preferredZone ?? null,
      durationMinutes: r.durationMinutes ?? null,
      endsAt: r.durationMinutes
        ? new Date(r.startsAt.getTime() + r.durationMinutes * 60000)
        : null,
      allergyNotes: r.allergyNotes,
      staffTags: r.patron?.staffTags ?? [],
      marketingConsent: !!r.marketingConsentAt,
      guestModified: (r.events ?? []).some(
        (e: any) =>
          e.metadata &&
          typeof e.metadata === 'object' &&
          (e.metadata as any).source === 'GUEST',
      ),
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
          String(err?.meta?.target ?? '').includes('referenceCode');
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

// Feature 4: two-tier turnover time. Parties at or above the large-party
// threshold get the longer duration; everyone else gets the base duration.
function computeDiningDuration(
  partySize: number,
  settings: {
    diningDurationMinutes?: number;
    largePartyThreshold?: number;
    largePartyDurationMinutes?: number;
  } | null,
): number {
  const base = settings?.diningDurationMinutes ?? 90;
  const threshold = settings?.largePartyThreshold ?? 5;
  const large = settings?.largePartyDurationMinutes ?? 150;
  return partySize >= threshold ? large : base;
}

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
