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
import { RestaurantSlugService } from '../restaurants/slug/restaurant-slug.service';
import { normalizeReservationNotificationLocale } from './reservation-notification-copy';
import {
  ActorRole,
  resolveReservationActor,
  assertReservationRole,
  requireReservationEntitlement,
} from './reservation-access.service';
import {
  ReservationServiceHoursRow,
  getReservationSettings,
  updateReservationSettings,
  setReservationServiceHours,
  deleteReservationServiceHours,
} from './reservation-settings.service';
import {
  listReservationBlackouts,
  addReservationBlackout,
  removeReservationBlackout,
} from './reservation-blackout.service';
import { fetchReservationAnalytics } from './reservation-analytics.service';
import {
  hasDietaryPreference,
  sanitizeCustomerPreferences,
  sanitizeStaffTags,
} from './reservation-tags';
import { CreateReservationDto } from './dto/public-reservation.dto';
import {
  ManualReservationDto,
  ReservationActionType,
} from './dto/reservation-ops.dto';

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

// Context threaded through the create-reservation helpers below.
interface CreateReservationContext {
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
  defaultLocale?: string | null;
  createdById?: string;
  internalNotes?: string;
  staffTags?: string[];
  skipConsentGate?: boolean;
}

interface ReservationPersistFields {
  phone: string;
  adults: number;
  children: number;
  total: number;
  startsAt: Date;
  status: 'PENDING' | 'CONFIRMED';
  marketingConsentAt: Date | null;
  notifyByEmail: boolean;
  notifyBySms: boolean;
  notificationLocale: string;
  preferredZone: string | null;
  manageToken: string;
  durationMinutes: number;
  customerPreferences: string[];
  allergyNotes: string | null;
  dietaryConsentAt: Date | null;
}

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
    // Appended, not inserted — this constructor's positional order is pinned
    // by reservations.service.spec.ts's build() helper (see comment above).
    private readonly slugs: RestaurantSlugService,
  ) {}

  // ── Access control ──────────────────────────────────────────────────────
  // Delegates to the shared primitives in reservation-access.service.ts. Kept
  // as local methods (rather than an injected collaborator) because this
  // class's constructor shape is pinned by existing tests that construct it
  // positionally.

  private resolveActor(
    restaurantId: string,
    userId: string,
  ): Promise<ActorRole> {
    return resolveReservationActor(this.prisma, restaurantId, userId);
  }

  private assertRole(role: ActorRole, allowed: ActorRole[]): void {
    assertReservationRole(role, allowed);
  }

  private requireEntitlement(restaurantId: string) {
    return requireReservationEntitlement(
      this.prisma,
      this.features,
      restaurantId,
    );
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

  /**
   * Resolve a manage token to the full frontend manage URL for the short SMS
   * redirect (`GET /r/:token`). Looks the reservation up by token alone (the
   * token is @unique and is itself the credential), then reconstructs the
   * public manage link with the stored restaurant + notification locale.
   * Returns null when the token is unknown so the caller can 404/redirect home.
   */
  async resolveManageRedirect(token: string): Promise<string | null> {
    const trimmed = (token || '').trim();
    if (!trimmed) return null;
    const r = await this.prisma.reservation.findUnique({
      where: { manageToken: trimmed },
      select: { restaurantId: true, notificationLocale: true },
    });
    if (!r) return null;
    const base = (process.env.FRONTEND_URL || 'http://localhost:3001').replace(
      /\/+$/,
      '',
    );
    const params = new URLSearchParams({
      r: r.restaurantId,
      lang: r.notificationLocale || 'en',
    });
    // Token goes in the fragment, not the query string — fragments are never
    // sent to the server, so they don't end up in this redirect's own
    // Location header or the frontend host's access/CDN logs (#SEC-H1).
    return `${base}/booking/manage?${params.toString()}#token=${trimmed}`;
  }

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
    const now = new Date();
    if (r.startsAt <= now) {
      throw new ConflictException(
        'This reservation has already started and cannot be cancelled online.',
      );
    }

    // Guarded CAS: only a live booking can be self-cancelled; a concurrent
    // staff action or double-submit no-ops.
    const { count } = await this.prisma.reservation.updateMany({
      where: {
        id: r.id,
        restaurantId,
        status: { in: ['PENDING', 'CONFIRMED'] },
        startsAt: { gt: now },
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
    await this.notifications.notify('CANCELLED', {
      restaurantId,
      guestEmail: r.guestEmail,
      guestPhone: r.guestPhone,
      guestName: r.guestName,
      startsAt: r.startsAt,
      referenceCode: r.referenceCode,
      notifyByEmail: r.notifyByEmail,
      notifyBySms: r.notifyBySms,
      notificationLocale: r.notificationLocale,
    });
    return { status: 'CANCELLED' as const };
  }

  async modifyByManageToken(
    restaurantId: string,
    token: string,
    dto: { startsAt?: string; adultsCount?: number; childrenCount?: number },
  ) {
    const r = await this.loadByToken(restaurantId, token);

    // Unlike cancel (which should stay permissive so a guest can always back
    // out), a booking *change* re-runs availability/slot logic against the
    // restaurant's live settings — block it once the restaurant itself is
    // suspended so a guest can't produce a "confirmed" edit against a tenant
    // that's no longer operating (#SEC-M2).
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { isActive: true },
    });
    if (!restaurant || restaurant.isActive === false) {
      throw new ForbiddenException('Restaurant is not active');
    }

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

    if (!slotChanged) {
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

    await this.prisma.$transaction(
      async (tx) => {
        await this.lockReservationCapacity(tx, restaurantId);

        if (slotChanged) {
          // Moving to a different time must satisfy the full guard (hours, lead,
          // horizon, blackout, capacity) — excluding this reservation's own hold.
          await this.availability.assertSlotBookable(
            restaurantId,
            startsAt,
            total,
            r.id,
            tx,
          );
        } else if (total > r.adultsCount + r.childrenCount) {
          await this.availability.assertCapacityAvailable(
            restaurantId,
            startsAt,
            total,
            r.id,
            tx,
          );
        }

        // Guarded CAS on BOTH status and updatedAt: a concurrent staff decision or
        // second modify that already wrote bumps updatedAt, so this write no-ops
        // instead of silently clobbering it (last-writer-wins).
        const { count } = await tx.reservation.updateMany({
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
            // A time change re-arms the 24h reminder for the new slot.
            ...(slotChanged ? { reminderSentAt: null } : {}),
          },
        });
        if (count === 0) {
          throw new ConflictException(
            'This reservation was just updated elsewhere. Please reload.',
          );
        }

        await tx.reservationEvent.create({
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
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );

    this.events.emitReservationUpdated(restaurantId, {
      id: r.id,
      status: r.status,
    });
    // Acknowledge the change with a dedicated "updated" notice that echoes the
    // NEW details (party size / time), not the generic received/confirmed copy.
    await this.notifications.notify('MODIFIED', {
      restaurantId,
      guestEmail: r.guestEmail,
      guestPhone: r.guestPhone,
      guestName: r.guestName,
      startsAt,
      referenceCode: r.referenceCode,
      notifyByEmail: r.notifyByEmail,
      notifyBySms: r.notifyBySms,
      notificationLocale: r.notificationLocale,
      manageToken: r.manageToken,
      // New headcount from this edit; the remaining details are unchanged.
      adultsCount: adults,
      childrenCount: children,
      occasion: r.occasion,
      customerNotes: r.customerNotes,
      customerPreferences: r.customerPreferences,
      preferredZone: r.preferredZone,
      allergyNotes: r.allergyNotes,
    });

    return {
      status: r.status,
      startsAt,
      adultsCount: adults,
      childrenCount: children,
      totalGuests: total,
    };
  }

  async createPublic(restaurantId: string, dto: CreateReservationDto) {
    const restaurant = await this.requireEntitlement(restaurantId);
    const settings = await this.prisma.reservationSettings.findUnique({
      where: { restaurantId },
    });
    if (!settings?.enabled) {
      throw new ForbiddenException('Reservations are not open for booking');
    }
    return this.createReservation(restaurantId, dto, {
      source: 'PUBLIC',
      settings,
      defaultLocale: restaurant?.dashboardLanguage ?? 'bg',
    });
  }

  async createManual(
    restaurantId: string,
    userId: string,
    dto: ManualReservationDto,
  ) {
    const role = await this.resolveActor(restaurantId, userId);
    this.assertRole(role, ['MANAGER', 'WAITER']);
    const [settings, restaurant] = await Promise.all([
      this.prisma.reservationSettings.findUnique({
        where: { restaurantId },
      }),
      this.prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { dashboardLanguage: true, timezone: true },
      }),
    ]);
    const {
      localStartsAt: submittedLocalStartsAt,
      internalNotes,
      staffTags,
      ...reservationFields
    } = dto;
    const zone = restaurant?.timezone ?? 'UTC';
    const localStartsAt = DateTime.fromISO(submittedLocalStartsAt, { zone });
    if (
      !localStartsAt.isValid ||
      localStartsAt.toFormat("yyyy-MM-dd'T'HH:mm") !==
        submittedLocalStartsAt.slice(0, 16)
    ) {
      throw new BadRequestException(
        'The selected local reservation time is not valid',
      );
    }
    const reservationDto: CreateReservationDto = {
      ...reservationFields,
      startsAt: localStartsAt.toUTC().toISO()!,
    };
    return this.createReservation(restaurantId, reservationDto, {
      source: 'STAFF',
      settings,
      defaultLocale: restaurant?.dashboardLanguage ?? 'bg',
      createdById: userId,
      internalNotes,
      staffTags,
      skipConsentGate: true,
    });
  }

  // ── Reservation creation (createPublic / createManual) ─────────────────
  //
  // Broken into focused helpers: input validation, consent gating, preferred
  // zone resolution, the locked advisory-transaction insert (+ idempotency
  // recheck + P2002 fallback), and the post-commit notification dispatch.

  private async createReservation(
    restaurantId: string,
    dto: CreateReservationDto,
    ctx: CreateReservationContext,
  ) {
    const { phone, adults, children, total, startsAt } =
      this.validatePartyAndTime(dto, ctx);
    const consent = this.buildConsentedFields(dto, ctx);

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
    const notificationLocale = normalizeReservationNotificationLocale(
      dto.locale ?? ctx.defaultLocale,
    );
    const preferredZone = await this.resolvePreferredZone(restaurantId, dto);
    // Feature 2: unguessable token for the guest's private self-service link.
    const manageToken = randomBytes(24).toString('base64url');
    // Feature 4: snapshot the expected dining duration for this party size.
    const durationMinutes = computeDiningDuration(total, ctx.settings);

    const outcome = await this.persistReservationTx(restaurantId, dto, ctx, {
      phone,
      adults,
      children,
      total,
      startsAt,
      status,
      marketingConsentAt,
      notifyByEmail,
      notifyBySms,
      notificationLocale,
      preferredZone,
      manageToken,
      durationMinutes,
      ...consent,
    });
    if (outcome.replayed) {
      return this.toCreateResult(outcome.reservation);
    }

    const created = outcome.reservation;

    // Fire-and-forget: the reservation transaction above committed. A
    // reservation never touches the slug otherwise (it arrives through
    // /book/:restaurantId, not a public menu load or an order). Not
    // awaited — commitOnActivity does its own DB work and must never delay
    // the booking confirmation, and it already swallows its own errors so
    // slug bookkeeping can never fail a reservation.
    void this.slugs.commitOnActivity(restaurantId);

    this.events.emitReservationCreated(restaurantId, {
      id: created.id,
      referenceCode: created.referenceCode,
      status: created.status,
      startsAt: created.startsAt,
      guestName: created.guestName,
      totalGuests: created.adultsCount + created.childrenCount,
    });

    await this.dispatchCreateNotifications(restaurantId, created, ctx);

    return this.toCreateResult(created);
  }

  private validatePartyAndTime(
    dto: CreateReservationDto,
    ctx: CreateReservationContext,
  ): {
    phone: string;
    adults: number;
    children: number;
    total: number;
    startsAt: Date;
  } {
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
    return { phone, adults, children, total, startsAt };
  }

  // Consent gate: only persist dietary/allergy (special-category) data when
  // the guest explicitly consented. Staff manual bookings bypass the gate.
  // Owner-defined custom preference labels are allowed through validation too.
  private buildConsentedFields(
    dto: CreateReservationDto,
    ctx: CreateReservationContext,
  ): {
    customerPreferences: string[];
    allergyNotes: string | null;
    dietaryConsentAt: Date | null;
  } {
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
    return { customerPreferences, allergyNotes, dietaryConsentAt };
  }

  // Feature 3: accept a preferred seating zone only when it matches a zone the
  // restaurant actually has. The client sends the preset key (e.g. TERRACE)
  // or, for a custom zone, its name — match either. Store the preset key when
  // the zone has one so the dashboard can translate it; else store the name.
  private async resolvePreferredZone(
    restaurantId: string,
    dto: CreateReservationDto,
  ): Promise<string | null> {
    const requestedZone = dto.preferredZone?.trim();
    if (!requestedZone) return null;
    const match = await this.prisma.tableZone.findFirst({
      where: {
        restaurantId,
        OR: [{ zoneKey: requestedZone }, { name: requestedZone }],
      },
      select: { zoneKey: true, name: true },
    });
    return match ? (match.zoneKey ?? match.name) : null;
  }

  // The advisory-lock transaction: idempotency recheck, slot assertion, patron
  // matching, persistence — with a P2002 fallback that replays the winning
  // insert instead of surfacing a raw unique-constraint 500.
  private async persistReservationTx(
    restaurantId: string,
    dto: CreateReservationDto,
    ctx: CreateReservationContext,
    fields: ReservationPersistFields,
  ): Promise<{
    reservation: Prisma.ReservationGetPayload<object>;
    replayed: boolean;
  }> {
    try {
      return await this.withReferenceRetry((referenceCode) =>
        this.prisma.$transaction(
          async (tx) => {
            await this.lockReservationCapacity(tx, restaurantId);

            // The fast idempotency check above avoids taking a lock for ordinary
            // retries. This second check is the concurrency boundary: a request
            // that waited for the same restaurant lock must observe the winner
            // before running capacity checks or emitting duplicate effects.
            if (dto.idempotencyKey) {
              const existing = await tx.reservation.findUnique({
                where: {
                  restaurantId_idempotencyKey: {
                    restaurantId,
                    idempotencyKey: dto.idempotencyKey,
                  },
                },
              });
              if (existing) {
                return { reservation: existing, replayed: true };
              }
            }

            // Public bookings must make the capacity decision while holding the
            // same transaction-scoped lock used for the insert. Staff bookings
            // deliberately remain an override, but take the lock so later public
            // requests see them in commit order.
            if (ctx.source === 'PUBLIC') {
              await this.availability.assertSlotBookable(
                restaurantId,
                fields.startsAt,
                fields.total,
                undefined,
                tx,
              );
            }

            const patron = await this.patrons.matchOrCreate(
              tx,
              restaurantId,
              fields.phone,
              dto.guestName.trim(),
              dto.guestEmail,
            );
            // Patron-level updates (staff tags, durable marketing opt-in). Marketing
            // consent is sticky once given; a later booking without it doesn't revoke.
            const patronData: Record<string, unknown> = {};
            if (ctx.staffTags?.length) {
              patronData.staffTags = sanitizeStaffTags(ctx.staffTags);
            }
            if (fields.marketingConsentAt) {
              patronData.marketingConsent = true;
              patronData.marketingConsentAt = fields.marketingConsentAt;
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
                status: fields.status,
                guestName: dto.guestName.trim(),
                guestPhone: fields.phone,
                guestEmail: dto.guestEmail?.trim() || null,
                startsAt: fields.startsAt,
                occasion: dto.occasion ?? ReservationOccasion.NONE,
                adultsCount: fields.adults,
                childrenCount: fields.children,
                customerNotes: dto.customerNotes?.trim() || null,
                internalNotes: ctx.internalNotes?.trim() || null,
                customerPreferences: fields.customerPreferences,
                allergyNotes: fields.allergyNotes,
                dietaryConsentAt: fields.dietaryConsentAt,
                marketingConsentAt: fields.marketingConsentAt,
                notifyByEmail: fields.notifyByEmail,
                notifyBySms: fields.notifyBySms,
                notificationLocale: fields.notificationLocale,
                preferredZone: fields.preferredZone,
                manageToken: fields.manageToken,
                durationMinutes: fields.durationMinutes,
                idempotencyKey: dto.idempotencyKey ?? null,
                createdById: ctx.createdById ?? null,
              },
            });
            await tx.reservationEvent.create({
              data: {
                reservationId: reservation.id,
                type: 'CREATED',
                actorUserId: ctx.createdById ?? null,
                metadata: { source: ctx.source, status: fields.status },
              },
            });
            return { reservation, replayed: false };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
        ),
      );
    } catch (err) {
      const replay = await this.recoverIdempotentReservation(
        restaurantId,
        dto,
        err,
      );
      if (replay) return { reservation: replay, replayed: true };
      throw err;
    }
  }

  // Defense in depth for a writer that does not participate in this lock (for
  // example an older deployment during a rolling release): return the
  // idempotency-key winner instead of surfacing a raw unique-constraint 500.
  // Prisma's P2002 `meta.target` is a string[] (or occasionally a string), so
  // normalize before matching.
  private async recoverIdempotentReservation(
    restaurantId: string,
    dto: CreateReservationDto,
    err: unknown,
  ) {
    const meta = (err as { code?: string; meta?: { target?: unknown } })?.meta;
    const rawTarget = meta?.target;
    const target = Array.isArray(rawTarget)
      ? rawTarget.join(',')
      : typeof rawTarget === 'string'
        ? rawTarget
        : '';
    if (
      !dto.idempotencyKey ||
      (err as { code?: string }).code !== 'P2002' ||
      !target.toLowerCase().includes('idempotency')
    ) {
      return null;
    }
    return this.prisma.reservation.findUnique({
      where: {
        restaurantId_idempotencyKey: {
          restaurantId,
          idempotencyKey: dto.idempotencyKey,
        },
      },
    });
  }

  // Guest notification ("received"/"confirmed" per Feature 1 channels), plus
  // the owner/manager new-request notice (Fix 5) when configured.
  private async dispatchCreateNotifications(
    restaurantId: string,
    created: Prisma.ReservationGetPayload<object>,
    ctx: CreateReservationContext,
  ): Promise<void> {
    await this.notifications.notify(
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
        notificationLocale: created.notificationLocale,
        manageToken: created.manageToken,
        adultsCount: created.adultsCount,
        childrenCount: created.childrenCount,
        occasion: created.occasion,
        customerNotes: created.customerNotes,
        customerPreferences: created.customerPreferences,
        preferredZone: created.preferredZone,
        allergyNotes: created.allergyNotes,
      },
    );

    if (ctx.settings?.notifyEmail || ctx.settings?.notifyPhone) {
      await this.notifications.notifyOwner({
        restaurantId,
        notifyEmail: ctx.settings.notifyEmail,
        notifyPhone: ctx.settings.notifyPhone,
        guestName: created.guestName,
        guestPhone: created.guestPhone,
        startsAt: created.startsAt,
        partySize: created.adultsCount + created.childrenCount,
        referenceCode: created.referenceCode,
        adultsCount: created.adultsCount,
        childrenCount: created.childrenCount,
        occasion: created.occasion,
        customerNotes: created.customerNotes,
        customerPreferences: created.customerPreferences,
        preferredZone: created.preferredZone,
        allergyNotes: created.allergyNotes,
      });
    }
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
      await this.notifications.notify(guestKind, {
        restaurantId,
        guestEmail: reservation.guestEmail,
        guestPhone: reservation.guestPhone,
        guestName: reservation.guestName,
        startsAt: reservation.startsAt,
        referenceCode: reservation.referenceCode,
        notifyByEmail: reservation.notifyByEmail,
        notifyBySms: reservation.notifyBySms,
        notificationLocale: reservation.notificationLocale,
        manageToken: reservation.manageToken,
        adultsCount: reservation.adultsCount,
        childrenCount: reservation.childrenCount,
        occasion: reservation.occasion,
        customerNotes: reservation.customerNotes,
        customerPreferences: reservation.customerPreferences,
        preferredZone: reservation.preferredZone,
        allergyNotes: reservation.allergyNotes,
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
  // Thin wrappers: the data-layer logic lives in reservation-settings.service.ts
  // (shared with ReservationSettingsService) so this class stays focused on the
  // core booking lifecycle.

  async getSettings(restaurantId: string, userId: string) {
    const role = await this.resolveActor(restaurantId, userId);
    this.assertRole(role, ['MANAGER']);
    return getReservationSettings(this.prisma, restaurantId);
  }

  async updateSettings(
    restaurantId: string,
    userId: string,
    data: Record<string, unknown>,
  ) {
    const role = await this.resolveActor(restaurantId, userId);
    this.assertRole(role, ['MANAGER']);
    return updateReservationSettings(this.prisma, restaurantId, data, (id) =>
      this.requireEntitlement(id),
    );
  }

  async setServiceHours(
    restaurantId: string,
    userId: string,
    rows: ReservationServiceHoursRow[],
  ) {
    const role = await this.resolveActor(restaurantId, userId);
    this.assertRole(role, ['MANAGER']);
    return setReservationServiceHours(this.prisma, restaurantId, rows);
  }

  async deleteServiceHours(
    restaurantId: string,
    userId: string,
    weekday: number,
  ) {
    const role = await this.resolveActor(restaurantId, userId);
    this.assertRole(role, ['MANAGER']);
    return deleteReservationServiceHours(this.prisma, restaurantId, weekday);
  }

  // ── Analytics (Feature 6) ────────────────────────────────────────────────
  // Thin wrapper: the aggregation lives in reservation-analytics.service.ts
  // (shared with ReservationAnalyticsService).

  async getAnalytics(restaurantId: string, userId: string) {
    const role = await this.resolveActor(restaurantId, userId);
    this.assertRole(role, ['MANAGER']);
    return fetchReservationAnalytics(this.prisma, restaurantId);
  }

  // ── Blackout days (Feature 5) ────────────────────────────────────────────
  // Thin wrappers: the data-layer logic lives in reservation-blackout.service.ts
  // (shared with ReservationBlackoutService).

  async listBlackouts(restaurantId: string, userId: string) {
    const role = await this.resolveActor(restaurantId, userId);
    this.assertRole(role, ['MANAGER']);
    return listReservationBlackouts(this.prisma, restaurantId);
  }

  async addBlackout(
    restaurantId: string,
    userId: string,
    date: string,
    reason?: string | null,
  ) {
    const role = await this.resolveActor(restaurantId, userId);
    this.assertRole(role, ['MANAGER']);
    return addReservationBlackout(this.prisma, restaurantId, date, reason);
  }

  async removeBlackout(restaurantId: string, userId: string, date: string) {
    const role = await this.resolveActor(restaurantId, userId);
    this.assertRole(role, ['MANAGER']);
    return removeReservationBlackout(this.prisma, restaurantId, date);
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private async lockReservationCapacity(
    tx: Prisma.TransactionClient,
    restaurantId: string,
  ): Promise<void> {
    // One transaction-scoped lock per restaurant serializes the short
    // capacity-check/write critical section across processes and pods. Hash
    // collisions can only cause harmless extra serialization, never an unsafe
    // unlock. Parameters remain bound through Prisma's tagged template.
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(
        hashtext('reservation_capacity'),
        hashtext(${restaurantId})
      )
    `;
  }

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
          e.metadata.source === 'GUEST',
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

  private async withReferenceRetry<T>(
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
