import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { CreateRestaurantDto } from './dto/create-restaurant.dto';
import { UpdateRestaurantDto } from './dto/update-restaurant.dto';
import { PrismaService } from '../prisma/prisma.service';
import { TranslationService } from '../translation/translation.service';
import { StripeProvider } from '../payment/stripe.provider';
import { FeatureService } from '../subscription/feature.service';
import { FeatureFlag } from '../subscription/feature-flag.enum';
import { stripBrandingFields } from './branding-fields';
import { encryptSecret } from '../payment/secret-crypto';
import { DeviceEnrollmentService } from './device-enrollment.service';
import { EventsGateway } from '../events/events.gateway';
import { isPresetTagKey } from '../menu/menu-tags';
import { MenuTranslationEnqueueService } from '../menu/menu-translation-enqueue.service';
import { MenuTranslationWorkerService } from '../menu/menu-translation-worker.service';
import { TranslationQuotaService } from '../translation/translation-quota.service';
import * as dns from 'dns';
import * as http from 'http';
import * as https from 'https';

// Logo fetch (getLogoBase64) hardening: bound the request so a slow/malicious
// origin can't hang a request or exhaust memory with an oversized response.
const LOGO_FETCH_TIMEOUT_MS = 5000;
const LOGO_MAX_BYTES = 5 * 1024 * 1024; // 5MB — logos are small; fail closed past this.

const RESTAURANT_READ_SELECT = {
  id: true,
  name: true,
  country: true,
  city: true,
  logoUrl: true,
  logoThumbnailUrl: true,
  accentColor: true,
  googleReviewUrl: true,
  facebookUrl: true,
  instagramUrl: true,
  tiktokUrl: true,
  websiteUrl: true,
  youtubeUrl: true,
  address: true,
  contactInfo: true,
  targetLanguages: true,
  dashboardLanguage: true,
  menuSourceLanguage: true,
  timezone: true,
  ownerId: true,
  createdAt: true,
  updatedAt: true,
  fontBody: true,
  fontHeading: true,
  themeBgColor: true,
  themeCardColor: true,
  themeTextColor: true,
  themeLightBgColor: true,
  themeLightTextColor: true,
  themeLightCardColor: true,
  themeLightAccentColor: true,
  themeDarkBgColor: true,
  themeDarkTextColor: true,
  themeDarkCardColor: true,
  themeDarkAccentColor: true,
  trendingMode: true,
  happyHourEnable: true,
  happyHourDays: true,
  happyHourStartTime: true,
  happyHourEndTime: true,
  happyHourMultiplier: true,
  isLoyaltyEnabled: true,
  loyaltyExchangeRate: true,
  loyaltySignupBonus: true,
  loyaltyRedeemRate: true,
  loyaltyMaxRedemptionPercent: true,
  loyaltyExpiryReminderDays: true,
  loyaltyGoldMultiplier: true,
  loyaltyGoldThreshold: true,
  loyaltyPointExpiryDays: true,
  loyaltySilverMultiplier: true,
  loyaltySilverThreshold: true,
  defaultTheme: true,
  stripeOnboarded: true,
  paymentsEnabled: true,
  epayEnabled: true,
  epayMode: true,
  epayClientId: true,
  epayMerchantEmail: true,
  epaySecretEncrypted: true,
  epayPage: true,
  boricaEnabled: true,
  boricaMode: true,
  boricaTerminalId: true,
  boricaMerchantId: true,
  boricaMerchantName: true,
  boricaPrivateKeyEncrypted: true,
  boricaPublicCert: true,
  boricaCurrency: true,
  myposEnabled: true,
  myposMode: true,
  myposClientNumber: true,
  myposStoreId: true,
  myposKeyIndex: true,
  myposPrivateKeyEncrypted: true,
  myposPublicCert: true,
  myposCurrency: true,
  sharedDeviceModeEnabled: true,
  notifyAllStaffOnPayment: true,
  tipsEnabled: true,
  tipOptions: true,
  platformFeePercent: true,
  tier: true,
  forceTier: true,
  tierUpdatedAt: true,
  isActive: true,
  deletedAt: true,
};

// Fields stripped from every public-facing restaurant read.
// Most are already excluded by RESTAURANT_READ_SELECT at the query level, so the deletes
// below are no-ops in production. They are kept here as defense-in-depth: if a future
// query accidentally omits the select, sensitive fields are still stripped at the DTO
// boundary. forceTier IS in RESTAURANT_READ_SELECT (needed by applyEffectiveTier) and
// must always be deleted here.
const RESTAURANT_PRIVATE_FIELDS = [
  'forceTier',
  'stripeAccountId',
  'stripeCustomerId',
  'stripeSubscriptionId',
  'stripePriceId',
  'epaySecretEncrypted',
  'boricaPrivateKeyEncrypted',
  'myposPrivateKeyEncrypted',
  'importApiKeyHash',
  'pastDueGraceExpiry',
  'forceTierExpiresAt',
  'deletedAt',
] as const;

@Injectable()
export class RestaurantsService {
  private readonly logger = new Logger(RestaurantsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly translationService: TranslationService,
    private readonly stripeProvider: StripeProvider,
    private readonly featureService: FeatureService,
    private readonly deviceEnrollmentService: DeviceEnrollmentService,
    private readonly eventsGateway: EventsGateway,
    private readonly translationEnqueue: MenuTranslationEnqueueService,
    private readonly translationWorker: MenuTranslationWorkerService,
    private readonly translationQuota: TranslationQuotaService,
  ) {}

  async create(createRestaurantDto: CreateRestaurantDto, userId: string) {
    const existing = await this.prisma.restaurant.count({
      where: { ownerId: userId, deletedAt: null },
    });
    if (existing > 0) {
      throw new ConflictException(
        'Owner already has a restaurant. Contact support to enable multi-location.',
      );
    }
    // New restaurants start on FREE — no branding entitlement. Strip any
    // branding fields (logoUrl, accentColor) so creation can't seed them.
    const restaurant = await this.prisma.restaurant.create({
      data: {
        ...stripBrandingFields({ ...createRestaurantDto }),
        country: createRestaurantDto.country ?? 'Bulgaria',
        ownerId: userId,
      },
    });
    return restaurant;
  }

  private applyEffectiveTier<
    T extends { tier: string; forceTier?: string | null },
  >(r: T): T {
    return r.forceTier ? { ...r, tier: r.forceTier } : r;
  }

  private toRestaurantReadDto<
    T extends { tier: string; forceTier?: string | null },
  >(restaurant: T) {
    const dto = { ...this.applyEffectiveTier(restaurant) } as Record<
      string,
      unknown
    >;
    dto['epaySecretConfigured'] = !!dto['epaySecretEncrypted'];
    dto['boricaPrivateKeyConfigured'] = !!dto['boricaPrivateKeyEncrypted'];
    dto['myposPrivateKeyConfigured'] = !!dto['myposPrivateKeyEncrypted'];
    for (const field of RESTAURANT_PRIVATE_FIELDS) {
      delete dto[field];
    }
    return dto;
  }

  async findByOwner(ownerId: string) {
    // D-6: filter deleted rows and order deterministically.
    return this.prisma.restaurant.findFirst({
      where: { ownerId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findAll(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { restaurantId: true },
    });

    const rows = user?.restaurantId
      ? await this.prisma.restaurant.findMany({
          where: { id: user.restaurantId, deletedAt: null },
          select: RESTAURANT_READ_SELECT,
        })
      : await this.prisma.restaurant.findMany({
          where: { ownerId: userId, deletedAt: null },
          select: RESTAURANT_READ_SELECT,
        });

    return rows.map((r) => this.toRestaurantReadDto(r));
  }

  async findOne(id: string, userId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id },
      select: RESTAURANT_READ_SELECT,
    });

    if (!restaurant || restaurant.deletedAt) {
      throw new NotFoundException(`Restaurant with ID "${id}" not found`);
    }

    if (restaurant.ownerId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to access this resource',
      );
    }

    return this.toRestaurantReadDto(restaurant);
  }

  // Internal use only: verify ownership and return raw row with Stripe billing fields
  private async findOneForBilling(id: string, userId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id },
    });
    if (!restaurant || restaurant.deletedAt) {
      throw new NotFoundException(`Restaurant with ID "${id}" not found`);
    }
    if (restaurant.ownerId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to access this resource',
      );
    }
    return restaurant;
  }

  // Allows owner OR staff member to read the restaurant
  async findOneOrStaff(id: string, userId: string) {
    const [restaurant, user] = await Promise.all([
      this.prisma.restaurant.findUnique({
        where: { id },
        select: RESTAURANT_READ_SELECT,
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { restaurantId: true },
      }),
    ]);

    if (!restaurant || restaurant.deletedAt) {
      throw new NotFoundException(`Restaurant with ID "${id}" not found`);
    }

    const isOwner = restaurant.ownerId === userId;
    const isStaff = user?.restaurantId === id;

    if (!isOwner && !isStaff) {
      throw new ForbiddenException(
        'You do not have permission to access this resource',
      );
    }

    return this.toRestaurantReadDto(restaurant);
  }

  // Allows owner OR assigned manager to manage non-billing settings.
  async findOneForManagement(id: string, userId: string) {
    const [restaurant, user] = await Promise.all([
      this.prisma.restaurant.findUnique({ where: { id } }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { restaurantId: true, role: true },
      }),
    ]);

    if (!restaurant || restaurant.deletedAt) {
      throw new NotFoundException(`Restaurant with ID "${id}" not found`);
    }

    const role = user?.role?.toUpperCase();
    const isOwner = restaurant.ownerId === userId;
    const isManager = role === 'MANAGER' && user?.restaurantId === id;

    if (!isOwner && !isManager) {
      throw new ForbiddenException(
        'You do not have permission to manage this restaurant',
      );
    }

    return restaurant;
  }

  async update(
    id: string,
    updateRestaurantDto: UpdateRestaurantDto,
    userId: string,
  ) {
    // First, ensure the restaurant exists and the user has permission
    const restaurant = await this.findOneForManagement(id, userId);

    // Tier enforcement: branding fields require BRANDING_CUSTOM (PROFESSIONAL+).
    // The frontend gate is cosmetic; this is the server-side boundary. Strip
    // branding fields silently for lower tiers so a mixed PATCH (loyalty +
    // localization + branding) still applies its non-branding fields.
    const tier = this.featureService.getEffectiveTier(
      restaurant.tier ?? 'FREE',
      restaurant.forceTier,
    );
    const data: Record<string, any> = this.featureService.hasFeature(
      tier,
      FeatureFlag.BRANDING_CUSTOM,
    )
      ? { ...updateRestaurantDto }
      : stripBrandingFields({ ...updateRestaurantDto });
    const sourceLanguageChanged =
      typeof data.menuSourceLanguage === 'string' &&
      data.menuSourceLanguage.trim().toLowerCase() !==
        (restaurant.menuSourceLanguage ?? 'bg').trim().toLowerCase();
    const nextSourceLanguage = sourceLanguageChanged
      ? data.menuSourceLanguage.trim().toLowerCase()
      : null;

    // Multi-language gating: strip targetLanguages if tier lacks multi-language feature
    if (!this.featureService.hasFeature(tier, FeatureFlag.LANGUAGES_MULTI)) {
      delete data.targetLanguages;
    }

    if ('epaySecret' in data) {
      const rawSecret = data.epaySecret;
      delete data.epaySecret;
      if (typeof rawSecret === 'string' && rawSecret.trim()) {
        data.epaySecretEncrypted = encryptSecret(rawSecret.trim(), {
          restaurantId: id,
          purpose: 'epay-secret',
        });
      } else if (rawSecret === null) {
        data.epaySecretEncrypted = null;
      }
    }

    if ('boricaPrivateKey' in data) {
      const rawKey = data.boricaPrivateKey;
      delete data.boricaPrivateKey;
      if (typeof rawKey === 'string' && rawKey.trim()) {
        data.boricaPrivateKeyEncrypted = encryptSecret(rawKey.trim(), {
          restaurantId: id,
          purpose: 'borica-private-key',
        });
      } else if (rawKey === null) {
        data.boricaPrivateKeyEncrypted = null;
      }
    }

    if ('myposPrivateKey' in data) {
      const rawKey = data.myposPrivateKey;
      delete data.myposPrivateKey;
      if (typeof rawKey === 'string' && rawKey.trim()) {
        data.myposPrivateKeyEncrypted = encryptSecret(rawKey.trim(), {
          restaurantId: id,
          purpose: 'mypos-private-key',
        });
      } else if (rawKey === null) {
        data.myposPrivateKeyEncrypted = null;
      }
    }

    for (const key of [
      'epayClientId',
      'epayMerchantEmail',
      'myposClientNumber',
      'myposStoreId',
      'myposKeyIndex',
    ] as const) {
      if (typeof data[key] === 'string') {
        const trimmed = data[key].trim();
        data[key] = trimmed === '' ? null : trimmed;
      }
    }

    const shouldEvictSharedDevices =
      data.sharedDeviceModeEnabled === false &&
      restaurant.sharedDeviceModeEnabled !== false;

    const updated = await this.prisma.restaurant.update({
      where: { id },
      select: RESTAURANT_READ_SELECT,
      data,
    });

    if (nextSourceLanguage) {
      // runId is cleared alongside the status reset. Run membership is
      // explicit and owned by enqueueTranslateAll (see the
      // translation_run_membership migration): only units a Translate All
      // queued carry a runId. Leaving the old id attached here would re-open
      // an already-finished run's denominator — its frozen totalUnits with
      // freshly outstanding units makes getRestaurantProgress recompute
      // done downward, so the dashboard bar jumps backward on a COMPLETED
      // run. These units are re-queued by an owner edit, not by that run.
      await Promise.all([
        this.prisma.menuTranslationState.updateMany({
          where: {
            restaurantId: id,
            locale: { not: nextSourceLanguage },
          },
          data: {
            status: 'STALE',
            sourceLang: nextSourceLanguage,
            runId: null,
            failureCount: 0,
            nextAttemptAt: null,
            lastError: null,
          },
        }),
        this.prisma.menuTranslationState.updateMany({
          where: { restaurantId: id, locale: nextSourceLanguage },
          data: {
            status: 'CURRENT',
            sourceLang: nextSourceLanguage,
            runId: null,
            failureCount: 0,
            nextAttemptAt: null,
            lastError: null,
          },
        }),
      ]);
      this.translationWorker.kick();
    }

    if (shouldEvictSharedDevices) {
      await this.deviceEnrollmentService.evictRestaurantDevices(id);
    }

    return this.toRestaurantReadDto(updated);
  }

  async remove(id: string, userId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id },
      select: { id: true, ownerId: true, deletedAt: true },
    });
    if (!restaurant || restaurant.deletedAt) {
      throw new NotFoundException(`Restaurant with ID "${id}" not found`);
    }
    if (restaurant.ownerId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to access this resource',
      );
    }

    const updated = await this.prisma.restaurant.update({
      where: { id },
      select: RESTAURANT_READ_SELECT,
      data: { deletedAt: new Date(), isActive: false },
    });
    await this.deviceEnrollmentService.evictRestaurantDevices(id);
    return this.toRestaurantReadDto(updated);
  }

  async updateLogo(
    id: string,
    logoUrl: string,
    logoThumbnailUrl: string,
    userId: string,
  ) {
    // First, ensure the restaurant exists and the user has permission
    await this.findOneForManagement(id, userId);

    return this.prisma.restaurant.update({
      where: { id },
      data: { logoUrl, logoThumbnailUrl },
    });
  }

  /**
   * Enqueue-only replacement for the old synchronous translateAll. Returns
   * (202-equivalent) as soon as MenuTranslationState rows are written — the
   * actual translation happens on MenuTranslationWorkerService's next tick
   * (kicked immediately below, non-blocking). This is what makes a
   * large-menu "Translate All" survive: the old version was a single HTTP
   * request that ran DeepL calls for every entity × language synchronously,
   * with no resumability and a real risk of exceeding a reverse-proxy
   * timeout on any menu of real size.
   */
  async enqueueTranslateAll(id: string, userId: string) {
    const restaurant = await this.findOneForManagement(id, userId);

    if (
      !this.featureService.restaurantHasFeature(
        restaurant,
        FeatureFlag.LANGUAGES_MULTI,
      )
    ) {
      throw new ForbiddenException(
        'Multi-language features are not available on this tier.',
      );
    }

    if (
      !restaurant.targetLanguages ||
      restaurant.targetLanguages.length === 0
    ) {
      return {
        success: true,
        message: 'No translation targets are configured.',
        runId: null,
        done: 0,
        total: 0,
        status: 'COMPLETED',
      };
    }

    const sourceLang = restaurant.menuSourceLanguage ?? 'bg';
    const targets = [
      ...new Set(
        restaurant.targetLanguages
          .map((locale) => locale.trim().toLowerCase())
          .filter(
            (locale) => locale && locale !== sourceLang.trim().toLowerCase(),
          ),
      ),
    ];
    if (targets.length === 0) {
      return {
        success: true,
        message: 'The menu source is the only configured language.',
        runId: null,
        done: 0,
        total: 0,
        status: 'COMPLETED',
      };
    }

    if (!this.translationWorker.isAvailable()) {
      return {
        success: false,
        message: 'Translation is disabled or not configured.',
        runId: null,
        done: 0,
        total: 0,
        status: 'FAILED',
      };
    }

    const existingProgress =
      await this.translationWorker.getRestaurantProgress(id);
    if (existingProgress.active) {
      this.translationWorker.kick();
      return {
        success: true,
        message: 'Translation is already running.',
        runId: existingProgress.runId,
        done: existingProgress.done,
        total: existingProgress.total,
        status: existingProgress.status,
      };
    }

    const [items, categories, options] = await Promise.all([
      this.prisma.menuItem.findMany({
        where: { category: { restaurantId: id } },
      }),
      this.prisma.menuCategory.findMany({ where: { restaurantId: id } }),
      this.prisma.menuOption.findMany({
        where: { menuItem: { category: { restaurantId: id } } },
      }),
    ]);

    // Rough pre-flight estimate — a real quota gate runs again per-batch
    // inside the worker itself; this is only to give the owner an honest
    // answer up front instead of a silent no-op once queued.
    const estimatedChars =
      (items.reduce(
        (s, i) => s + i.name.length + (i.description?.length ?? 0),
        0,
      ) +
        categories.reduce((s, c) => s + c.name.length, 0) +
        options.reduce((s, o) => s + o.name.length, 0)) *
      targets.length;

    const quotaCheck = await this.translationQuota.assertCanSpend(
      restaurant,
      estimatedChars,
    );
    if (!quotaCheck.allowed) {
      return {
        success: false,
        message: `Translation quota exceeded (${quotaCheck.reason === 'platform_quota_exceeded' ? 'platform-wide limit' : "this restaurant's monthly limit"}). ${quotaCheck.remaining} characters remaining this period.`,
        runId: null,
        done: 0,
        total: 0,
        status: 'FAILED',
      };
    }

    let run: { id: string; createdAt?: Date };
    try {
      run = await this.prisma.translationRun.create({
        data: {
          restaurantId: id,
          requestedById: userId,
          status: 'QUEUED',
          locales: targets,
          totalUnits: 0,
          doneUnits: 0,
          startedAt: new Date(),
        },
      });
    } catch (error) {
      if ((error as { code?: string })?.code !== 'P2002') throw error;
      const winningRun = await this.prisma.translationRun.findFirst({
        where: {
          restaurantId: id,
          status: { in: ['QUEUED', 'RUNNING'] },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (!winningRun) throw error;
      // A QUEUED winner is still attaching state rows. Its own request will
      // kick after switching to RUNNING; kicking here could let idle
      // reconciliation finish it prematurely at 0/0.
      if (winningRun.status === 'RUNNING') this.translationWorker.kick();
      return {
        success: true,
        message: 'Translation is already running.',
        runId: winningRun.id,
        done: winningRun.doneUnits,
        total: winningRun.totalUnits,
        status: winningRun.status === 'QUEUED' ? 'RUNNING' : winningRun.status,
      };
    }

    // Bounded concurrency (not Promise.all across every entity) — a large
    // multi-language menu is hundreds of categories/items/options, each
    // issuing its own DB upsert(s); unbounded fan-out exhausts PgBouncer's
    // connection pool and silently drops most of the enqueue (2026-07-25
    // production finding).
    try {
      await this.translationEnqueue.enqueueBatch([
        ...categories.map(
          (c) => () =>
            this.translationEnqueue.enqueueCategory(
              id,
              c,
              targets,
              sourceLang,
              run.id,
            ),
        ),
        ...items.map(
          (i) => () =>
            this.translationEnqueue.enqueueItem(
              id,
              i,
              targets,
              sourceLang,
              run.id,
            ),
        ),
        ...options.map(
          (o) => () =>
            this.translationEnqueue.enqueueOption(
              id,
              {
                id: o.id,
                name: o.name,
                choices: o.choices as any,
                translations: o.translations,
              },
              targets,
              sourceLang,
              run.id,
            ),
        ),
      ]);

      const stateCounts = await this.prisma.menuTranslationState.groupBy({
        by: ['status'],
        where: { runId: run.id },
        _count: { _all: true },
      });
      let actualEnqueued = 0;
      for (const row of stateCounts) {
        if (['STALE', 'PENDING', 'FAILED'].includes(row.status)) {
          actualEnqueued += row._count._all;
        }
      }
      const totalUnits = actualEnqueued;
      if (totalUnits === 0) {
        // NEEDS_REVIEW rows are terminal rather than queued: the enqueue path
        // deliberately preserves them (unchanged source hash + language) and
        // detaches them from the run, so they never reach actualEnqueued.
        // Counting them separately keeps this message honest — "already
        // current" contradicts the dashboard's failed badge when values are
        // sitting there waiting for a human.
        const needsReview = await this.prisma.menuTranslationState.count({
          where: {
            restaurantId: id,
            locale: { in: targets },
            status: 'NEEDS_REVIEW',
          },
        });
        await this.prisma.translationRun.update({
          where: { id: run.id },
          data: {
            status: 'COMPLETED',
            doneUnits: 0,
            failedUnits: 0,
            finishedAt: new Date(),
          },
        });
        return {
          success: true,
          // `message` is the API-level explanation. `needsReview` is what the
          // dashboard actually branches on: it renders its own localized copy
          // for this path and never displays this string, so the count has to
          // travel as data rather than prose.
          message:
            needsReview > 0
              ? `Nothing new to queue. ${needsReview} value(s) need manual review before they can be translated.`
              : 'All configured translations are already current.',
          runId: null,
          done: 0,
          total: 0,
          status: 'COMPLETED',
          needsReview,
        };
      }

      await this.prisma.translationRun.update({
        where: { id: run.id },
        data: {
          status: 'RUNNING',
          totalUnits,
          doneUnits: 0,
        },
      });

      this.eventsGateway.emitToRestaurant(id, 'translate:progress', {
        phase: 'queued',
        done: 0,
        total: totalUnits,
        runId: run.id,
        status: 'RUNNING',
      });

      this.translationWorker.kick();

      return {
        success: true,
        message: `Queued ${categories.length} categories, ${items.length} items, and ${options.length} options for translation into ${targets.length} language(s).`,
        runId: run.id,
        done: 0,
        total: totalUnits,
        status: 'RUNNING',
      };
    } catch (error) {
      await this.prisma.translationRun
        .update({
          where: { id: run.id },
          data: {
            status: 'FAILED',
            message:
              error instanceof Error
                ? error.message.slice(0, 500)
                : 'Enqueue failed',
            finishedAt: new Date(),
          },
        })
        .catch(() => undefined);
      throw error;
    }
  }

  /**
   * Aggregate translation-queue status for the dashboard's poll fallback and
   * outdated/failed badge. Deliberately restaurant-wide rather than scoped
   * to a single TranslationRun. The badge is the restaurant-wide health
   * signal, while the progress bar below uses explicit run membership.
   */
  async getTranslationStatus(id: string, userId: string) {
    await this.findOneForManagement(id, userId);

    const counts = await this.prisma.menuTranslationState.groupBy({
      by: ['status'],
      where: { restaurantId: id },
      _count: { _all: true },
    });
    const byStatus: Record<string, number> = {};
    for (const row of counts) byStatus[row.status] = row._count._all;

    const pending =
      (byStatus.STALE ?? 0) + (byStatus.PENDING ?? 0) + (byStatus.SKIPPED ?? 0);
    const failed = (byStatus.FAILED ?? 0) + (byStatus.NEEDS_REVIEW ?? 0);
    const current = byStatus.CURRENT ?? 0;

    const progress = await this.translationWorker.getRestaurantProgress(id);

    return {
      pending,
      failed,
      current,
      active: progress.active,
      done: progress.done,
      total: progress.total,
      latestRunId: progress.runId,
      latestRunStatus: progress.runId ? progress.status : null,
    };
  }

  async generateConnectLink(
    restaurantId: string,
    userId: string,
    returnUrl?: string,
    refreshUrl?: string,
  ) {
    const restaurant = await this.findOneForBilling(restaurantId, userId);

    let accountId = restaurant.stripeAccountId;
    if (!accountId) {
      accountId = await this.stripeProvider.createExpressAccount();
      await this.prisma.restaurant.update({
        where: { id: restaurantId },
        data: { stripeAccountId: accountId },
      });
    }

    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    const url = await this.stripeProvider.createAccountLink(
      accountId,
      refreshUrl || `${baseUrl}/dashboard?stripe=refresh&tab=settings`,
      returnUrl || `${baseUrl}/dashboard?stripe=success&tab=settings`,
    );

    return { url };
  }

  async getStripeStatus(restaurantId: string, userId: string) {
    const restaurant = await this.findOneForBilling(restaurantId, userId);

    if (!restaurant.stripeAccountId) {
      return { stripeOnboarded: false };
    }

    let chargesEnabled: boolean;
    try {
      chargesEnabled = await this.stripeProvider.retrieveAccount(
        restaurant.stripeAccountId,
      );
    } catch (err: unknown) {
      const stripeErr = err as { code?: string; type?: string };
      if (
        stripeErr?.code === 'resource_missing' &&
        stripeErr?.type === 'invalid_request_error'
      ) {
        // The Stripe Connect account was hard-deleted. Clear our reference.
        // Only clear paymentsEnabled when no other provider is active.
        this.logger.warn(
          `Stripe account deleted for restaurant ${restaurantId} — clearing stripeAccountId`,
        );
        const hasOtherProvider =
          restaurant.epayEnabled ||
          restaurant.boricaEnabled ||
          restaurant.myposEnabled;
        await this.prisma.restaurant.update({
          where: { id: restaurantId },
          data: {
            stripeAccountId: null,
            stripeOnboarded: false,
            ...(!hasOtherProvider && { paymentsEnabled: false }),
          },
        });
        return { stripeOnboarded: false };
      }
      throw err;
    }

    if (chargesEnabled && !restaurant.stripeOnboarded) {
      await this.prisma.restaurant.update({
        where: { id: restaurantId },
        data: { stripeOnboarded: true, paymentsEnabled: true },
      });
    } else if (!chargesEnabled && restaurant.stripeOnboarded) {
      // Persist downgrade when Stripe restricts the account after onboarding (Issue 9)
      const hasOtherProvider =
        restaurant.epayEnabled ||
        restaurant.boricaEnabled ||
        restaurant.myposEnabled;
      await this.prisma.restaurant.update({
        where: { id: restaurantId },
        data: {
          stripeOnboarded: false,
          ...(!hasOtherProvider && { paymentsEnabled: false }),
        },
      });
    }

    return { stripeOnboarded: chargesEnabled };
  }

  async disconnectStripe(restaurantId: string, userId: string) {
    const restaurant = await this.findOneForBilling(restaurantId, userId);
    const hasOtherProvider =
      restaurant.epayEnabled ||
      restaurant.boricaEnabled ||
      restaurant.myposEnabled;

    return this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        stripeAccountId: null,
        stripeOnboarded: false,
        // Clear paymentsEnabled unless another payment provider is active (Issue 8)
        ...(!hasOtherProvider && { paymentsEnabled: false }),
      },
    });
  }

  /**
   * Fetch the restaurant logo and return it as a base64 data URL so the
   * frontend can embed it inline in QR SVGs without cross-origin canvas taint
   * (Issue 18).
   */
  async getLogoBase64(
    restaurantId: string,
    userId: string,
  ): Promise<{ dataUrl: string } | null> {
    // Ownership check: this triggers a server-side outbound fetch, so restrict
    // it to the restaurant's owner/manager (matches uploadLogo) rather than any
    // authenticated account.
    await this.findOneForManagement(restaurantId, userId);

    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { logoUrl: true },
    });
    if (!restaurant?.logoUrl) return null;

    try {
      const parsedUrl = new URL(restaurant.logoUrl);
      if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
        return null;
      }

      const hostname = parsedUrl.hostname.toLowerCase();
      if (hostname === 'localhost' || hostname.endsWith('.local')) {
        return null;
      }

      // Resolve DNS exactly ONCE and reuse this same address for both the
      // validation check below AND the actual connection in fetchPinnedIp.
      // Never re-resolve — a second lookup is the DNS-rebinding window: an
      // attacker's authoritative DNS can return a public IP for the first
      // lookup (passing validation) and a private/internal IP for a second,
      // later lookup timed to land after validation passes but before the
      // real request connects.
      const { address } = await dns.promises
        .lookup(hostname)
        .catch(() => ({ address: null as string | null }));
      if (!address || this.isBlockedIp(address)) return null;

      const result = await this.fetchPinnedIp(parsedUrl, address, hostname);
      if (!result) return null;

      const mime = result.contentType ?? 'image/webp';
      const b64 = result.buffer.toString('base64');
      return { dataUrl: `data:${mime};base64,${b64}` };
    } catch {
      return null;
    }
  }

  /** True when `rawAddress` falls in a private/reserved/loopback/link-local
   *  range that must never be reachable from a server-side fetch (SSRF guard
   *  for getLogoBase64). Parses octets numerically instead of string-prefix
   *  matching, and unwraps IPv4-mapped IPv6 literals (e.g.
   *  `::ffff:169.254.169.254`) first so that form can't bypass the IPv4
   *  checks. Fails closed on anything malformed. */
  private isBlockedIp(rawAddress: string): boolean {
    return this.isBlockedIpParsed(rawAddress);
  }

  private isBlockedIpParsed(rawAddress: string): boolean {
    const withoutBrackets = rawAddress.trim().replace(/^\[|\]$/g, '');
    const address = withoutBrackets.split('%')[0].toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
    if (mapped) return this.isBlockedIpv4(mapped[1]);

    if (address.includes('.')) {
      return this.isBlockedIpv4(address);
    }

    const segments = this.expandIpv6(address);
    if (!segments) return true;

    const [first] = segments;
    const isUnspecified = segments.every((segment) => segment === 0);
    const isLoopback =
      segments.slice(0, 7).every((segment) => segment === 0) &&
      segments[7] === 1;
    if (isUnspecified || isLoopback) return true;

    const isIpv4Mapped =
      segments.slice(0, 5).every((segment) => segment === 0) &&
      segments[5] === 0xffff;
    if (isIpv4Mapped) {
      const ipv4 = [
        segments[6] >> 8,
        segments[6] & 0xff,
        segments[7] >> 8,
        segments[7] & 0xff,
      ].join('.');
      return this.isBlockedIpv4(ipv4);
    }

    if ((first & 0xfe00) === 0xfc00) return true; // unique-local fc00::/7
    if ((first & 0xffc0) === 0xfe80) return true; // link-local fe80::/10
    if ((first & 0xff00) === 0xff00) return true; // multicast ff00::/8
    if (first === 0x2001 && segments[1] === 0x0db8) return true; // documentation
    return false;
  }

  private isBlockedIpv4(address: string): boolean {
    const octets = address.split('.').map((n) => Number(n));
    if (
      octets.length !== 4 ||
      octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)
    ) {
      return true;
    }
    const [a, b, c] = octets;
    if (a === 0) return true;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 192 && b === 0 && c === 0) return true;
    if (a === 192 && b === 0 && c === 2) return true;
    if (a === 198 && (b === 18 || b === 19)) return true;
    if (a === 198 && b === 51 && c === 100) return true;
    if (a === 203 && b === 0 && c === 113) return true;
    if (a >= 224) return true;
    return false;
  }

  private expandIpv6(address: string): number[] | null {
    if (!address.includes(':')) return null;
    const parts = address.split('::');
    if (parts.length > 2) return null;

    const parseSide = (side: string): number[] | null => {
      if (!side) return [];
      const parsed = side.split(':').map((segment) => {
        if (!/^[0-9a-f]{1,4}$/i.test(segment)) return Number.NaN;
        return parseInt(segment, 16);
      });
      return parsed.some((segment) => Number.isNaN(segment)) ? null : parsed;
    };

    const left = parseSide(parts[0]);
    const right = parseSide(parts[1] ?? '');
    if (!left || !right) return null;

    if (parts.length === 1) {
      return left.length === 8 ? left : null;
    }

    const missing = 8 - left.length - right.length;
    if (missing < 1) return null;
    return [...left, ...Array(missing).fill(0), ...right];
  }

  /** Fetch `parsedUrl` by connecting directly to the pre-validated `ip`
   *  (never re-resolving DNS — see getLogoBase64), sending the original
   *  `hostname` as the Host header and, for https, as the TLS `servername`
   *  so certificate validation still checks against the real domain. Bounds
   *  the request with a timeout and a response-size cap. Returns `null` on
   *  any non-2xx status, timeout, oversized body, or transport error. */
  private fetchPinnedIp(
    parsedUrl: URL,
    ip: string,
    hostname: string,
  ): Promise<{ buffer: Buffer; contentType: string | null } | null> {
    return new Promise((resolve) => {
      const isHttps = parsedUrl.protocol === 'https:';
      const client = isHttps ? https : http;
      const port = parsedUrl.port
        ? parseInt(parsedUrl.port, 10)
        : isHttps
          ? 443
          : 80;

      let settled = false;
      const finish = (
        value: { buffer: Buffer; contentType: string | null } | null,
      ) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      const req = client.request(
        {
          host: ip,
          port,
          path: `${parsedUrl.pathname}${parsedUrl.search}`,
          method: 'GET',
          headers: { Host: hostname },
          ...(isHttps ? { servername: hostname } : {}),
          timeout: LOGO_FETCH_TIMEOUT_MS,
        },
        (res) => {
          if (
            !res.statusCode ||
            res.statusCode < 200 ||
            res.statusCode >= 300
          ) {
            res.resume();
            finish(null);
            return;
          }
          const chunks: Buffer[] = [];
          let total = 0;
          res.on('data', (chunk: Buffer) => {
            total += chunk.length;
            if (total > LOGO_MAX_BYTES) {
              req.destroy();
              finish(null);
              return;
            }
            chunks.push(chunk);
          });
          res.on('end', () => {
            finish({
              buffer: Buffer.concat(chunks),
              contentType: res.headers['content-type'] ?? null,
            });
          });
          res.on('error', () => finish(null));
        },
      );

      req.on('timeout', () => {
        req.destroy();
        finish(null);
      });
      req.on('error', () => finish(null));
      req.end();
    });
  }
}
