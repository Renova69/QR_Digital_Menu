import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MenuTranslationReadService } from './menu-translation-read.service';
import { MenuTranslationEnqueueService } from './menu-translation-enqueue.service';
import { MenuTranslationWorkerService } from './menu-translation-worker.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { CreateMenuOptionDto } from './dto/create-menu-option.dto';
import { UpdateMenuOptionDto } from './dto/update-menu-option.dto';
import {
  Prisma,
  AvailabilityType,
  OrderStatus,
  MenuItem,
} from '@prisma/client';
import { DateTime } from 'luxon';
import { FeatureService } from '../subscription/feature.service';
import { FeatureFlag } from '../subscription/feature-flag.enum';
import { stripBrandingFields } from '../restaurants/branding-fields';
import { StorageService } from '../storage/storage.service';
import { EventsGateway } from '../events/events.gateway';
import { withKeyLock } from '../common/key-mutex';
import { assertRestaurantActive } from '../restaurants/assert-restaurant-active';
import {
  getTimeUpsellContexts,
  scoreUpsellItems,
  UpsellContext,
} from './upsell/upsell-context';
import { WeatherUpsellService } from './upsell/weather-upsell.service';
import { withEffectiveRewardPointsPrice } from '../loyalty/reward-pricing';
import { SUPPORTED_TARGET_LANGUAGE_CODES } from '../restaurants/restaurant-languages';

// AUTO-trending window: only orders from the last N days count toward
// "most ordered", so trending reflects current demand rather than all-time
// history (and the groupBy scan stays bounded).
const TRENDING_WINDOW_DAYS = 30;

// P0-5: the exact MenuItem shape the public (unauthenticated) menu may see.
//
// Every public menu query previously used `include: { options: true }`, which
// returns the whole row — including `costPrice`, the restaurant's food cost.
// That field feeds owner margin analytics only (see DashboardService), so
// publishing it let anyone with curl compute every dish's margin.
//
// This is an allowlist on purpose: a new column added to MenuItem stays
// private until someone deliberately adds it here. `createdAt`/`updatedAt`
// are omitted as unused noise rather than as a secret.
const PUBLIC_MENU_ITEM_SELECT = {
  id: true,
  name: true,
  description: true,
  price: true,
  weight: true,
  currency: true,
  allergens: true,
  dietaryTags: true,
  tags: true,
  imageUrl: true,
  thumbnailUrl: true,
  isOutOfStock: true,
  categoryId: true,
  order: true,
  translations: true,
  // Drive the upsell / perfect-pairing / trending surfaces on the public menu.
  isFeatured: true,
  relatedItemIds: true,
  upsellContexts: true,
  // Loyalty: the public menu renders a points price per item.
  rewardPointsMode: true,
  rewardPointsPrice: true,
  options: {
    select: {
      id: true,
      name: true,
      type: true,
      choices: true,
      menuItemId: true,
      translations: true,
    },
  },
} satisfies Prisma.MenuItemSelect;

// Rows to skip when checking whether a stored image is still referenced вЂ” the
// row(s) currently being deleted/updated must not count as a live reference.
type ImageRefExclusions = {
  excludeItemIds?: string[];
  excludeCategoryIds?: string[];
};

@Injectable()
export class MenuCrudService {
  private readonly logger = new Logger(MenuCrudService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly menuTranslationRead: MenuTranslationReadService,
    private readonly translationEnqueue: MenuTranslationEnqueueService,
    private readonly translationWorker: MenuTranslationWorkerService,
    private readonly featureService: FeatureService,
    private readonly storageService: StorageService,
    private readonly events: EventsGateway,
    private readonly weatherUpsellService: WeatherUpsellService,
  ) {}

  private readonly autoTrendingCache = new Map<
    string,
    { data: Partial<MenuItem>[]; expiresAt: number }
  >();
  private readonly autoTrendingInFlight = new Map<
    string,
    Promise<Partial<MenuItem>[]>
  >();

  /**
   * Public-menu languages consist of the menu source language first,
   * followed by configured translation targets. The source language remains
   * available even when it was not duplicated in targetLanguages.
   */
  private buildPublicMenuLanguages(restaurant: {
    menuSourceLanguage?: string | null;
    targetLanguages?: string[] | null;
  }): string[] {
    const requestedDefault = String(restaurant.menuSourceLanguage || 'bg')
      .toLowerCase()
      .split('-')[0];
    const sourceDefault = (
      SUPPORTED_TARGET_LANGUAGE_CODES as readonly string[]
    ).includes(requestedDefault)
      ? requestedDefault
      : 'bg';
    const targets = (restaurant.targetLanguages ?? [])
      .map((language) => language.toLowerCase().split('-')[0])
      .filter(Boolean);
    return [...new Set([sourceDefault, ...targets])];
  }

  /** Resolve a requested target language whose stored translation may replace
   *  canonical menu fields. The source language deliberately resolves to
   *  undefined: owner-authored fields are authoritative and must never be
   *  replaced by a stale translations[sourceLang] snapshot. */
  private resolveStoredTranslationLang(
    restaurant: {
      targetLanguages?: string[] | null;
      menuSourceLanguage?: string | null;
    },
    tier: string,
    lang?: string,
  ): string | undefined {
    if (!lang) return undefined;
    const hasMultiLanguage = this.featureService.hasFeature(
      tier,
      FeatureFlag.LANGUAGES_MULTI,
    );
    const languageConfig = hasMultiLanguage
      ? restaurant
      : { ...restaurant, targetLanguages: [] };
    const languages = this.buildPublicMenuLanguages(languageConfig);
    const requestedLang = languages.find(
      (candidate) =>
        candidate.toLowerCase() === lang.toLowerCase().split('-')[0],
    );
    return requestedLang && requestedLang !== languages[0]
      ? requestedLang
      : undefined;
  }

  /** Fetch the public-facing restaurant context (effective tier + timezone +
   *  languages) and reject missing or suspended restaurants. Shared by the
   *  single-category and batched item endpoints. */
  private async loadPublicRestaurantContext(restaurantId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        timezone: true,
        tier: true,
        forceTier: true,
        targetLanguages: true,
        menuSourceLanguage: true,
        loyaltyRedeemRate: true,
        isActive: true,
        deletedAt: true,
      },
    });
    if (!restaurant) {
      throw new NotFoundException(
        `Restaurant with ID "${restaurantId}" not found`,
      );
    }
    this.assertRestaurantActive(restaurant);
    return {
      restaurant,
      tier: restaurant.forceTier ?? restaurant.tier ?? 'FREE',
      timezone: restaurant.timezone || 'Europe/Sofia',
    };
  }

  private normalizeRewardPricingInput<
    T extends {
      rewardPointsMode?: 'OFF' | 'AUTO' | 'CUSTOM';
      rewardPointsPrice?: number | null;
    },
  >(
    input: T,
    current?: {
      rewardPointsMode?: 'OFF' | 'AUTO' | 'CUSTOM' | null;
      rewardPointsPrice?: number | null;
    },
  ): T & { rewardPointsMode?: 'OFF' | 'AUTO' | 'CUSTOM' } {
    const hasMode = input.rewardPointsMode !== undefined;
    const hasPrice = input.rewardPointsPrice !== undefined;
    if (!hasMode && !hasPrice) return input;

    const mode =
      input.rewardPointsMode ??
      (input.rewardPointsPrice === null ? 'OFF' : 'CUSTOM');
    const customPrice = input.rewardPointsPrice ?? current?.rewardPointsPrice;

    if (
      mode === 'CUSTOM' &&
      (!Number.isInteger(customPrice) || (customPrice ?? 0) < 1)
    ) {
      throw new BadRequestException(
        'A custom loyalty reward requires a positive points price',
      );
    }

    return { ...input, rewardPointsMode: mode };
  }

  /** True when another menu row (item OR category) still points at this exact
   *  URL. The same R2 object can be shared across rows (a menu imported/cloned
   *  across restaurants reuses the URL), so we must not physically delete it
   *  while any other row references it. Checks both imageUrl and thumbnailUrl
   *  columns, excluding the row(s) currently being removed. */
  private async isImageReferencedElsewhere(
    url: string,
    exclude: ImageRefExclusions = {},
  ): Promise<boolean> {
    const { excludeItemIds = [], excludeCategoryIds = [] } = exclude;
    const [itemRefs, categoryRefs] = await Promise.all([
      this.prisma.menuItem.count({
        where: {
          OR: [{ imageUrl: url }, { thumbnailUrl: url }],
          ...(excludeItemIds.length ? { id: { notIn: excludeItemIds } } : {}),
        },
      }),
      this.prisma.menuCategory.count({
        where: {
          OR: [{ imageUrl: url }, { thumbnailUrl: url }],
          ...(excludeCategoryIds.length
            ? { id: { notIn: excludeCategoryIds } }
            : {}),
        },
      }),
    ]);
    return itemRefs + categoryRefs > 0;
  }

  /** Delete a single stored image, but only when no OTHER menu row still points
   *  at it. Note StorageService.delete(mainUrl) also removes the derived
   *  `_thumb` object, so a shared URL must be preserved for the rows that still
   *  use it. The reference-check + delete runs under a per-URL lock so two
   *  concurrent deletes of rows sharing the same image can't both read a
   *  stale "still referenced" count and disagree about who should delete it. */
  private async deleteImageIfUnreferenced(
    url: string | null | undefined,
    exclude: ImageRefExclusions = {},
  ): Promise<void> {
    if (!url) return;
    await withKeyLock(url, async () => {
      if (await this.isImageReferencedElsewhere(url, exclude)) {
        this.logger.log(`Kept shared image (still referenced): ${url}`);
        return;
      }
      await this.storageService.deleteExact(url);
    });
  }

  private async deleteStoredImagePair(
    imageUrl?: string | null,
    thumbnailUrl?: string | null,
    exclude: ImageRefExclusions = {},
  ) {
    // Delete each URL independently. Using `imageUrl ?? thumbnailUrl` previously
    // caused `_thumb_thumb.webp` if only thumbnailUrl was non-null (L1.3).
    await Promise.all([
      this.deleteImageIfUnreferenced(imageUrl, exclude),
      this.deleteImageIfUnreferenced(thumbnailUrl, exclude),
    ]);
  }

  private parseMenuOptionChoices(rawChoices: string) {
    let choices: unknown;
    try {
      choices = JSON.parse(rawChoices);
    } catch {
      throw new BadRequestException('choices must be valid JSON');
    }

    if (!Array.isArray(choices)) {
      throw new BadRequestException('choices must be a JSON array');
    }
    if (choices.length > 100) {
      throw new BadRequestException(
        'choices cannot contain more than 100 entries',
      );
    }

    const parsed = choices.map((choice: any) => {
      if (!choice || typeof choice !== 'object') {
        throw new BadRequestException('each choice must be an object');
      }
      const name = typeof choice.name === 'string' ? choice.name.trim() : '';
      if (!name) {
        throw new BadRequestException('each choice must have a name');
      }
      if (name.length > 100) {
        throw new BadRequestException(
          'choice names cannot exceed 100 characters',
        );
      }
      const priceModifier =
        choice.priceModifier === undefined ? 0 : Number(choice.priceModifier);
      if (!Number.isFinite(priceModifier) || priceModifier < 0) {
        throw new BadRequestException(
          'choice priceModifier must be a non-negative number',
        );
      }
      return {
        name,
        priceModifier,
        ...(typeof choice.weight === 'string' && choice.weight.trim()
          ? { weight: choice.weight.trim() }
          : {}),
      };
    });

    const seen = new Set<string>();
    for (const c of parsed) {
      const key = c.name.toLowerCase();
      if (seen.has(key)) {
        throw new BadRequestException(`Duplicate choice name: "${c.name}"`);
      }
      seen.add(key);
    }
    return parsed;
  }

  /** Dayparting requires the DAYPARTING feature on the restaurant's EFFECTIVE
   *  tier (honors super-admin forceTier) вЂ” not a hardcoded tier list (#11). */
  private isDaypartingEnabled(restaurant: {
    tier: string | null;
    forceTier?: string | null;
  }): boolean {
    const tier = this.featureService.getEffectiveTier(
      restaurant.tier ?? 'FREE',
      restaurant.forceTier ?? null,
    );
    return this.featureService.hasFeature(tier, FeatureFlag.DAYPARTING);
  }

  /** Strip branding fields from the public restaurant payload when the
   *  EFFECTIVE tier lacks BRANDING_CUSTOM. Non-destructive вЂ” the DB keeps
   *  the values so re-upgrade restores them instantly. Prevents stale
   *  branding (logo/colors/fonts) from a downgraded restaurant continuing
   *  to render on the public menu. Expects `restaurant.tier` to already be
   *  the effective tier (forceTier resolved). Social URLs are not branding вЂ”
   *  see branding-fields.ts вЂ” so the footer is unaffected. */
  private applyBrandingEntitlement<T>(restaurant: T): T {
    const r = restaurant as Record<string, unknown>;
    const tier = (r.tier as string | undefined) ?? 'FREE';
    if (this.featureService.hasFeature(tier, FeatureFlag.BRANDING_CUSTOM)) {
      return restaurant;
    }
    return stripBrandingFields({ ...r }) as unknown as T;
  }

  async getPublicMenu(restaurantId: string, lang?: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        name: true,
        logoUrl: true,
        accentColor: true,
        fontHeading: true,
        fontBody: true,
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
        menuSourceLanguage: true,
        timezone: true,
        defaultTheme: true,
        tier: true,
        forceTier: true,
        facebookUrl: true,
        instagramUrl: true,
        tiktokUrl: true,
        websiteUrl: true,
        youtubeUrl: true,
        address: true,
        city: true,
        contactInfo: true,
        loyaltyRedeemRate: true,
        isActive: true,
        deletedAt: true,
      } as any,
    });

    if (!restaurant) {
      throw new NotFoundException(
        `Restaurant with ID "${restaurantId}" not found`,
      );
    }
    this.assertRestaurantActive(restaurant);

    const restaurantClone = { ...restaurant } as any;
    restaurantClone.tier = restaurantClone.forceTier ?? restaurantClone.tier;
    const loyaltyRedeemRate = restaurantClone.loyaltyRedeemRate ?? 150;
    delete restaurantClone.forceTier;
    delete restaurantClone.loyaltyRedeemRate;
    // P0-5: fetched only to drive assertRestaurantActive() above. They carry
    // no meaning for a diner and leak soft-delete state, so they stop here.
    delete restaurantClone.isActive;
    delete restaurantClone.deletedAt;

    const allCategories = await this.prisma.menuCategory.findMany({
      where: { restaurantId },
      include: {
        items: {
          where: { isOutOfStock: false },
          orderBy: { order: 'asc' },
          select: PUBLIC_MENU_ITEM_SELECT,
        },
      },
      orderBy: { order: 'asc' },
    });

    const restaurantTz = restaurantClone.timezone || 'Europe/Sofia';
    const restaurantTier = restaurantClone.tier as string | undefined;
    const filteredCategories = this.filterByAvailability(
      allCategories,
      restaurantTz,
      restaurantTier,
    );

    const hasMultiLanguage = this.featureService.hasFeature(
      restaurantClone.tier ?? 'FREE',
      FeatureFlag.LANGUAGES_MULTI,
    );

    if (!hasMultiLanguage) {
      restaurantClone.targetLanguages = [];
    }

    const requestedLang = this.resolveStoredTranslationLang(
      restaurantClone,
      restaurantClone.tier ?? 'FREE',
      lang,
    );
    // Read-only: applies whatever is already cached in `translations`. No
    // provider call, no DB write — public GETs never trigger translation
    // work. See MenuTranslationReadService and MenuTranslationWorkerService.
    if (requestedLang) {
      this.menuTranslationRead.applyStoredTranslations(
        filteredCategories,
        requestedLang,
      );
    }

    restaurantClone.features = this.featureService.getFeatures(
      restaurantClone.tier ?? 'FREE',
    );

    const categoriesWithRewardPrices = filteredCategories.map(
      (category: any) => ({
        ...category,
        items: (category.items ?? []).map((item: any) =>
          withEffectiveRewardPointsPrice(item, loyaltyRedeemRate),
        ),
      }),
    );

    return {
      restaurant: this.applyBrandingEntitlement(restaurantClone),
      categories: categoriesWithRewardPrices,
    };
  }

  /** Returns restaurant branding + category metadata (no items).
   *  Frontend uses this for the initial fast paint, then lazy-loads items per category. */
  async getPublicMenuMeta(restaurantId: string, lang?: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        name: true,
        slug: true,
        logoUrl: true,
        accentColor: true,
        fontHeading: true,
        fontBody: true,
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
        menuSourceLanguage: true,
        timezone: true,
        defaultTheme: true,
        tier: true,
        forceTier: true,
        facebookUrl: true,
        instagramUrl: true,
        tiktokUrl: true,
        websiteUrl: true,
        youtubeUrl: true,
        address: true,
        city: true,
        contactInfo: true,
        paymentsEnabled: true,
        isActive: true,
        deletedAt: true,
      } as any,
    });

    if (!restaurant) {
      throw new NotFoundException(
        `Restaurant with ID "${restaurantId}" not found`,
      );
    }
    this.assertRestaurantActive(restaurant);

    const restaurantClone = { ...restaurant } as any;
    restaurantClone.tier = restaurantClone.forceTier ?? restaurantClone.tier;
    delete restaurantClone.forceTier;
    // P0-5: internal lifecycle flags — see getPublicMenu.
    delete restaurantClone.isActive;
    delete restaurantClone.deletedAt;

    const allCategories = await this.prisma.menuCategory.findMany({
      where: { restaurantId },
      select: {
        id: true,
        name: true,
        order: true,
        imageUrl: true,
        thumbnailUrl: true,
        availabilityType: true,
        startTime: true,
        endTime: true,
        daysOfWeek: true,
        translations: true,
        isDrinkCategory: true,
      },
      orderBy: { order: 'asc' },
    });

    const tz = restaurantClone.timezone || 'Europe/Sofia';
    const tier = restaurantClone.tier as string | undefined;
    const filteredCategories = this.filterByAvailability(
      allCategories as any[],
      tz,
      tier,
    );

    const hasMultiLanguage = this.featureService.hasFeature(
      tier ?? 'FREE',
      FeatureFlag.LANGUAGES_MULTI,
    );

    if (!hasMultiLanguage) {
      restaurantClone.targetLanguages = [];
    }

    restaurantClone.features = this.featureService.getFeatures(
      restaurantClone.tier ?? 'FREE',
    );

    // Apply cached target-language category names on first paint. Source-
    // language fields stay canonical so stale translations[sourceLang]
    // snapshots cannot hide an owner's latest edit.
    const requestedLang = this.resolveStoredTranslationLang(
      restaurantClone,
      restaurantClone.tier ?? 'FREE',
      lang,
    );
    if (requestedLang) {
      this.menuTranslationRead.applyStoredTranslations(
        filteredCategories,
        requestedLang,
      );
    }

    return {
      restaurant: this.applyBrandingEntitlement(restaurantClone),
      categories: filteredCategories,
    };
  }

  /** Returns items (with options + translation) for a single visible category. */
  async getCategoryItems(
    restaurantId: string,
    categoryId: string,
    lang?: string,
  ) {
    const { restaurant, tier, timezone } =
      await this.loadPublicRestaurantContext(restaurantId);

    const category = await this.prisma.menuCategory.findFirst({
      where: { id: categoryId, restaurantId },
      select: {
        id: true,
        name: true,
        translations: true,
        availabilityType: true,
        startTime: true,
        endTime: true,
        daysOfWeek: true,
      },
    });

    if (!category) {
      throw new NotFoundException(
        `Category not found or does not belong to restaurant`,
      );
    }

    const filtered = this.filterByAvailability(
      [category as any],
      timezone,
      tier,
    );
    if (filtered.length === 0) {
      throw new ForbiddenException('This category is currently unavailable');
    }

    const items = await this.prisma.menuItem.findMany({
      where: { categoryId, isOutOfStock: false },
      orderBy: { order: 'asc' },
      select: PUBLIC_MENU_ITEM_SELECT,
    });

    const requestedLang = this.resolveStoredTranslationLang(
      restaurant,
      tier,
      lang,
    );
    if (requestedLang) {
      const fakeCategory = { ...category, items };
      this.menuTranslationRead.applyStoredTranslations(
        [fakeCategory as any],
        requestedLang,
      );
      return fakeCategory.items.map((item: any) =>
        withEffectiveRewardPointsPrice(
          item,
          restaurant.loyaltyRedeemRate ?? 150,
        ),
      );
    }

    return items.map((item: any) =>
      withEffectiveRewardPointsPrice(item, restaurant.loyaltyRedeemRate ?? 150),
    );
  }

  /** Returns items (with options + translation) for ALL currently-visible
   *  categories in a single call вЂ” one restaurant fetch + one translation batch.
   *  Replaces the frontend's per-category fan-out, which re-fetched the
   *  restaurant row once per category and triggered a separate DeepL burst each
   *  time. Keyed by categoryId so the client can populate its per-category map
   *  directly. Categories hidden by availability are simply absent from the map. */
  async getPublicMenuItems(
    restaurantId: string,
    lang?: string,
  ): Promise<Record<string, any[]>> {
    const { restaurant, tier, timezone } =
      await this.loadPublicRestaurantContext(restaurantId);

    const allCategories = await this.prisma.menuCategory.findMany({
      where: { restaurantId },
      include: {
        items: {
          where: { isOutOfStock: false },
          orderBy: { order: 'asc' },
          select: PUBLIC_MENU_ITEM_SELECT,
        },
      },
      orderBy: { order: 'asc' },
    });

    const filtered = this.filterByAvailability(
      allCategories as any[],
      timezone,
      tier,
    );

    const requestedLang = this.resolveStoredTranslationLang(
      restaurant,
      tier,
      lang,
    );
    if (requestedLang) {
      this.menuTranslationRead.applyStoredTranslations(
        filtered as any[],
        requestedLang,
      );
    }

    const itemsByCategory: Record<string, any[]> = {};
    for (const category of filtered) {
      itemsByCategory[(category as any).id] = (
        (category as any).items ?? []
      ).map((item: any) =>
        withEffectiveRewardPointsPrice(
          item,
          restaurant.loyaltyRedeemRate ?? 150,
        ),
      );
    }
    return itemsByCategory;
  }

  private filterByAvailability<
    T extends {
      availabilityType: string;
      startTime: string | null;
      endTime: string | null;
      daysOfWeek: number[];
    },
  >(categories: T[], timezone: string, tier?: string): T[] {
    const daypartingEnabled = this.featureService.hasFeature(
      tier ?? 'FREE',
      FeatureFlag.DAYPARTING,
    );
    const now = DateTime.now().setZone(timezone);
    const currentTimeStr = now.toFormat('HH:mm');
    const currentDay = now.weekday === 7 ? 0 : now.weekday;

    return categories.filter((category) => {
      if (category.availabilityType === 'HIDDEN') return false;
      if (category.availabilityType === 'ALWAYS') return true;
      if (category.availabilityType === 'SCHEDULED') {
        // Treat SCHEDULED as ALWAYS when tier lacks DAYPARTING (e.g. after downgrade)
        if (!daypartingEnabled) return true;
        if (
          category.daysOfWeek &&
          Array.isArray(category.daysOfWeek) &&
          category.daysOfWeek.length > 0 &&
          !category.daysOfWeek.includes(currentDay)
        )
          return false;
        if (category.startTime && category.endTime) {
          if (category.startTime <= category.endTime) {
            return (
              currentTimeStr >= category.startTime &&
              currentTimeStr <= category.endTime
            );
          } else {
            return (
              currentTimeStr >= category.startTime ||
              currentTimeStr <= category.endTime
            );
          }
        }
      }
      return true;
    });
  }

  async getTrendingItems(
    restaurantId: string,
    lang?: string,
  ): Promise<Partial<MenuItem>[]> {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        trendingMode: true,
        id: true,
        tier: true,
        forceTier: true,
        targetLanguages: true,
        menuSourceLanguage: true,
        isActive: true,
        deletedAt: true,
        timezone: true,
        city: true,
        country: true,
        loyaltyRedeemRate: true,
      },
    });

    this.assertRestaurantActive(restaurant);

    if (
      !restaurant ||
      !this.featureService.restaurantHasFeature(
        restaurant,
        FeatureFlag.UPSELLING,
      )
    ) {
      return [];
    }

    if (restaurant.trendingMode === 'OFF') {
      return [];
    }

    const timezone = restaurant.timezone || 'UTC';
    const activeContexts = await this.getActiveUpsellContexts({
      timezone,
      city: restaurant.city,
      country: restaurant.country,
    });

    if (restaurant.trendingMode === 'MANUAL') {
      const items = await this.prisma.menuItem.findMany({
        where: {
          category: { restaurantId },
          isFeatured: true,
          isOutOfStock: false,
        },
        orderBy: { order: 'asc' },
        include: {
          options: true,
          category: { select: { isDrinkCategory: true, name: true } },
        },
      });
      const scoredItems = this.applyContextualScoring(
        items,
        activeContexts,
      ).slice(0, 4);
      return this.applyTrendingTranslations(scoredItems, restaurant, lang);
    }

    const cacheKey = `${restaurantId}:${lang || 'default'}:${restaurant.loyaltyRedeemRate ?? 150}:${this.getActiveUpsellContextKey(activeContexts)}`;
    const cached = this.autoTrendingCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const inFlight = this.autoTrendingInFlight.get(cacheKey);
    if (inFlight) return inFlight;

    const load = (async () => {
      const trendingSince = DateTime.now()
        .minus({ days: TRENDING_WINDOW_DAYS })
        .toJSDate();
      const mostOrdered = await this.prisma.orderItem.groupBy({
        by: ['menuItemId'],
        where: {
          menuItemId: { not: null },
          // Only real, recent sales drive AUTO trending: exclude CANCELED orders
          // (a canceled bulk order must not fake-inflate popularity) and bound the
          // scan to a rolling window. Served by Order
          // @@index([restaurantId, status, createdAt]).
          order: {
            restaurantId,
            status: { not: OrderStatus.CANCELED },
            createdAt: { gte: trendingSince },
          },
        },
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 20,
      });

      const itemIds = mostOrdered
        .map((mo: { menuItemId: string | null }) => mo.menuItemId)
        .filter((id: string | null): id is string => id !== null);
      if (itemIds.length === 0) return [];

      const trendingItems = await this.prisma.menuItem.findMany({
        where: {
          id: { in: itemIds },
          isOutOfStock: false,
        },
        include: {
          options: true,
          category: { select: { isDrinkCategory: true, name: true } },
        },
      });

      const ordered = itemIds
        .map((id: string) =>
          trendingItems.find((item: { id: string }) => item.id === id),
        )
        .filter((item): item is NonNullable<typeof item> => Boolean(item));

      const scoredItems = this.applyContextualScoring(
        ordered as Partial<MenuItem>[],
        activeContexts,
      ).slice(0, 4);

      const result = await this.applyTrendingTranslations(
        scoredItems,
        restaurant,
        lang,
      );
      this.autoTrendingCache.set(cacheKey, {
        data: result,
        expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes cache
      });
      return result;
    })().finally(() => {
      this.autoTrendingInFlight.delete(cacheKey);
    });
    this.autoTrendingInFlight.set(cacheKey, load);
    return load;
  }

  private applyContextualScoring(
    items: Partial<MenuItem>[],
    activeContexts: ReadonlySet<string>,
  ): Partial<MenuItem>[] {
    return scoreUpsellItems(items, activeContexts);
  }

  private async getActiveUpsellContexts(location: {
    timezone: string;
    city?: string | null;
    country?: string | null;
  }): Promise<Set<UpsellContext>> {
    const activeContexts = getTimeUpsellContexts(location.timezone);
    try {
      const weatherContexts = await this.weatherUpsellService.getContexts({
        city: location.city,
        country: location.country,
        timezone: location.timezone,
      });
      for (const context of weatherContexts) activeContexts.add(context);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.debug(`Weather upsell fallback: ${message}`);
    }
    return activeContexts;
  }

  private getActiveUpsellContextKey(contexts: ReadonlySet<string>): string {
    const sortedContexts = [...contexts].sort();
    return sortedContexts.length ? sortedContexts.join('+') : 'none';
  }

  /**
   * Lazily translate trending item names/options for `lang`. Wraps the items in
   * a throwaway category (pre-seeded so its own name is never sent to DeepL) and
   * reuses the shared menu translation pipeline, which also caches results to
   * the DB. No-op when multi-language is unavailable or `lang` is not enabled
   * as either the menu source or a configured target.
   */
  private async applyTrendingTranslations(
    items: Partial<MenuItem>[],
    restaurant: {
      tier?: string | null;
      forceTier?: string | null;
      targetLanguages?: string[] | null;
      menuSourceLanguage?: string | null;
      loyaltyRedeemRate?: number | null;
    },
    lang?: string,
  ): Promise<Partial<MenuItem>[]> {
    const requestedLang = this.resolveStoredTranslationLang(
      restaurant,
      restaurant.forceTier ?? restaurant.tier ?? 'FREE',
      lang,
    );
    if (requestedLang && items.length > 0) {
      this.menuTranslationRead.applyStoredTranslations(
        [
          {
            id: 'trending',
            name: ' ',
            translations: { [requestedLang]: { name: ' ' } },
            items,
          },
        ],
        requestedLang,
      );
    }
    return items.map((item) =>
      withEffectiveRewardPointsPrice(item, restaurant.loyaltyRedeemRate ?? 150),
    );
  }

  /**
   * L-TRANS-2: reject a suspended restaurant. The public menu/meta/items/
   * trending methods all already fetch the restaurant row, so this takes that
   * row and checks it in memory instead of issuing a second
   * `restaurant.findUnique` per request (which the controller used to do via a
   * separate pre-check). Lenient on a missing row вЂ” the caller's own not-found
   * handling decides that.
   */
  private assertRestaurantActive(
    restaurant:
      | { isActive?: boolean | null; deletedAt?: Date | string | null }
      | null
      | undefined,
  ): void {
    assertRestaurantActive(restaurant);
  }

  private async checkRestaurantOwnership(restaurantId: string, userId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
    });

    if (!restaurant) {
      throw new NotFoundException(
        `Restaurant with ID "${restaurantId}" not found`,
      );
    }
    this.assertRestaurantActive(restaurant);

    if (restaurant.ownerId !== userId) {
      // Assigned MANAGERs manage their own restaurant's menu. This mirrors the
      // access already granted on payments, dashboard analytics, and device
      // enrollment вЂ” without it managers were locked out of menu CRUD entirely
      // (#15). A MANAGER's userId never equals ownerId, so the owner check alone
      // blocked them; the assignment (user.restaurantId === id) is the boundary.
      const isManager = await this.isAssignedManager(userId, restaurantId);
      if (!isManager) {
        throw new ForbiddenException(
          'You do not have permission to access this resource',
        );
      }
    }

    return restaurant;
  }

  private async isAssignedManager(
    userId: string,
    restaurantId: string,
  ): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, restaurantId: true },
    });
    return user?.role === 'MANAGER' && user.restaurantId === restaurantId;
  }

  // в”Ђв”Ђ Category Methods в”Ђв”Ђ

  async verifyCategoryOwnership(categoryId: string, userId: string) {
    const category = await this.prisma.menuCategory.findUnique({
      where: { id: categoryId },
      select: { restaurantId: true },
    });

    if (!category) {
      throw new NotFoundException(`Category with ID "${categoryId}" not found`);
    }

    await this.checkRestaurantOwnership(category.restaurantId, userId);
  }

  async verifyItemOwnership(itemId: string, userId: string) {
    const item = await this.prisma.menuItem.findUnique({
      where: { id: itemId },
      select: { category: { select: { restaurantId: true } } },
    });

    if (!item) {
      throw new NotFoundException(`Menu item with ID "${itemId}" not found`);
    }

    await this.checkRestaurantOwnership(item.category.restaurantId, userId);
  }

  // Thin public wrapper so sibling services (e.g. bulk menu edit) can reuse
  // the same owner/manager check without duplicating it.
  async verifyRestaurantOwnership(restaurantId: string, userId: string) {
    await this.checkRestaurantOwnership(restaurantId, userId);
  }

  async createCategory(
    restaurantId: string,
    createCategoryDto: CreateCategoryDto,
    userId: string,
  ) {
    const restaurant = await this.checkRestaurantOwnership(
      restaurantId,
      userId,
    );

    const daypartingEnabled = this.isDaypartingEnabled(restaurant);
    const sanitizedDto = daypartingEnabled
      ? createCategoryDto
      : {
          ...createCategoryDto,
          availabilityType: AvailabilityType.ALWAYS,
          startTime: null,
          endTime: null,
          daysOfWeek: [],
        };

    const count = await this.prisma.menuCategory.count({
      where: { restaurantId },
    });

    if (sanitizedDto.printStationId) {
      if (
        !this.featureService.restaurantHasFeature(
          restaurant,
          FeatureFlag.PRINTERS_THERMAL,
        )
      ) {
        throw new ForbiddenException({
          code: 'FEATURE_LOCKED',
          requiredFeatures: [FeatureFlag.PRINTERS_THERMAL],
          message: 'Thermal printers are not available on this plan',
        });
      }
      const station = await this.prisma.printStation.findUnique({
        where: { id: sanitizedDto.printStationId },
        select: { restaurantId: true },
      });
      if (!station || station.restaurantId !== restaurantId) {
        throw new BadRequestException('Invalid print station ID');
      }
    }

    const data: Prisma.MenuCategoryUncheckedCreateInput = {
      ...sanitizedDto,
      restaurantId,
      order: count,
    };
    const category = await this.prisma.menuCategory.create({ data });

    const hasMultiLanguage = this.featureService.restaurantHasFeature(
      restaurant,
      FeatureFlag.LANGUAGES_MULTI,
    );
    if (hasMultiLanguage && restaurant.targetLanguages.length > 0) {
      void this.translationEnqueue
        .enqueueCategory(
          restaurantId,
          category,
          restaurant.targetLanguages,
          restaurant.menuSourceLanguage ?? 'bg',
        )
        .then(() => this.translationWorker.kick());
    }

    return category;
  }

  async findAllCategories(restaurantId: string, userId: string) {
    await this.checkRestaurantOwnership(restaurantId, userId);
    return this.prisma.menuCategory.findMany({
      where: { restaurantId },
      orderBy: { order: 'asc' },
      include: { items: { include: { options: true } } },
    });
  }

  async updateCategory(
    categoryId: string,
    updateCategoryDto: UpdateCategoryDto,
    userId: string,
  ) {
    const category = await this.prisma.menuCategory.findUnique({
      where: { id: categoryId },
      select: {
        restaurantId: true,
        translations: true,
        name: true,
        imageUrl: true,
        thumbnailUrl: true,
      },
    });

    if (!category) {
      throw new NotFoundException(`Category with ID "${categoryId}" not found`);
    }
    const restaurant = await this.checkRestaurantOwnership(
      category.restaurantId,
      userId,
    );

    const daypartingEnabled = this.isDaypartingEnabled(restaurant);
    const sanitizedDto = daypartingEnabled
      ? updateCategoryDto
      : {
          ...updateCategoryDto,
          availabilityType: AvailabilityType.ALWAYS,
          startTime: null,
          endTime: null,
          daysOfWeek: [],
        };

    if (sanitizedDto.printStationId) {
      if (
        !this.featureService.restaurantHasFeature(
          restaurant,
          FeatureFlag.PRINTERS_THERMAL,
        )
      ) {
        throw new ForbiddenException({
          code: 'FEATURE_LOCKED',
          requiredFeatures: [FeatureFlag.PRINTERS_THERMAL],
          message: 'Thermal printers are not available on this plan',
        });
      }
      const station = await this.prisma.printStation.findUnique({
        where: { id: sanitizedDto.printStationId },
        select: { restaurantId: true },
      });
      if (!station || station.restaurantId !== category.restaurantId) {
        throw new BadRequestException('Invalid print station ID');
      }
    }

    const updated = await this.prisma.menuCategory.update({
      where: { id: categoryId },
      data: sanitizedDto,
    });

    // Delete old R2 objects when the URL is explicitly removed (null) OR replaced
    // with a different URL. "undefined" means the field was not sent вЂ” leave as-is.
    // Previously only null was handled, orphaning objects on non-null replacements (M1.2).
    if (
      updateCategoryDto.imageUrl !== undefined &&
      updateCategoryDto.imageUrl !== category.imageUrl &&
      category.imageUrl
    ) {
      await this.deleteImageIfUnreferenced(category.imageUrl, {
        excludeCategoryIds: [categoryId],
      });
    }
    if (
      updateCategoryDto.thumbnailUrl !== undefined &&
      updateCategoryDto.thumbnailUrl !== category.thumbnailUrl &&
      category.thumbnailUrl
    ) {
      await this.deleteImageIfUnreferenced(category.thumbnailUrl, {
        excludeCategoryIds: [categoryId],
      });
    }

    const hasMultiLanguage = this.featureService.restaurantHasFeature(
      restaurant,
      FeatureFlag.LANGUAGES_MULTI,
    );
    if (
      hasMultiLanguage &&
      updateCategoryDto.name &&
      updateCategoryDto.name !== category.name &&
      restaurant.targetLanguages.length > 0
    ) {
      void this.translationEnqueue
        .enqueueCategory(
          category.restaurantId,
          updated,
          restaurant.targetLanguages,
          restaurant.menuSourceLanguage ?? 'bg',
        )
        .then(() => this.translationWorker.kick());
    }

    return updated;
  }

  async updateCategoryOrder(
    restaurantId: string,
    orderedIds: string[],
    userId: string,
  ) {
    await this.checkRestaurantOwnership(restaurantId, userId);
    if (!Array.isArray(orderedIds)) {
      throw new BadRequestException('orderedIds must be an array');
    }
    if (new Set(orderedIds).size !== orderedIds.length) {
      throw new BadRequestException('orderedIds must not contain duplicates');
    }
    const categories = await this.prisma.menuCategory.findMany({
      where: { restaurantId },
      select: { id: true },
    });
    const existingIds = new Set(categories.map((category) => category.id));
    if (
      orderedIds.length !== categories.length ||
      orderedIds.some((id) => !existingIds.has(id))
    ) {
      throw new BadRequestException(
        'orderedIds must include every category exactly once',
      );
    }
    await this.prisma.$transaction(
      orderedIds.map((id: string, index: number) =>
        this.prisma.menuCategory.updateMany({
          where: { id, restaurantId },
          data: { order: index },
        }),
      ),
    );
    return { success: true };
  }

  async removeCategory(categoryId: string, userId: string) {
    const category = await this.prisma.menuCategory.findUnique({
      where: { id: categoryId },
      select: {
        restaurantId: true,
        imageUrl: true,
        thumbnailUrl: true,
        items: { select: { id: true, imageUrl: true, thumbnailUrl: true } },
      },
    });

    if (!category) {
      throw new NotFoundException(`Category with ID "${categoryId}" not found`);
    }
    await this.checkRestaurantOwnership(category.restaurantId, userId);
    const deleted = await this.prisma.menuCategory.delete({
      where: { id: categoryId },
    });
    await this.deleteStoredImagePair(category.imageUrl, category.thumbnailUrl, {
      excludeCategoryIds: [categoryId],
    });
    await Promise.all(
      category.items.map((item) =>
        this.deleteStoredImagePair(item.imageUrl, item.thumbnailUrl, {
          excludeItemIds: [item.id],
        }),
      ),
    );
    return deleted;
  }

  async updateCategoryImage(
    categoryId: string,
    imageUrl: string,
    thumbnailUrl: string,
    userId: string,
  ) {
    const category = await this.prisma.menuCategory.findUnique({
      where: { id: categoryId },
      select: { restaurantId: true, imageUrl: true, thumbnailUrl: true },
    });

    if (!category) {
      throw new NotFoundException(`Category with ID "${categoryId}" not found`);
    }
    await this.checkRestaurantOwnership(category.restaurantId, userId);
    const updated = await this.prisma.menuCategory.update({
      where: { id: categoryId },
      data: { imageUrl, thumbnailUrl } as any,
    });
    if (category.imageUrl !== imageUrl) {
      await this.deleteStoredImagePair(
        category.imageUrl,
        category.thumbnailUrl,
        { excludeCategoryIds: [categoryId] },
      );
    }
    return updated;
  }

  // в”Ђв”Ђ Item Methods в”Ђв”Ђ

  async createItem(
    categoryId: string,
    createItemDto: CreateItemDto,
    userId: string,
  ) {
    const category = await this.prisma.menuCategory.findUnique({
      where: { id: categoryId },
      select: { restaurantId: true },
    });

    if (!category) {
      throw new NotFoundException(`Category with ID "${categoryId}" not found`);
    }
    const restaurant = await this.checkRestaurantOwnership(
      category.restaurantId,
      userId,
    );

    const count = await this.prisma.menuItem.count({ where: { categoryId } });
    const normalizedDto = this.normalizeRewardPricingInput(createItemDto);
    const data: Prisma.MenuItemUncheckedCreateInput = {
      ...normalizedDto,
      categoryId,
      order: count,
    } as Prisma.MenuItemUncheckedCreateInput;
    const item = await this.prisma.menuItem.create({ data });

    const hasMultiLanguage = this.featureService.restaurantHasFeature(
      restaurant,
      FeatureFlag.LANGUAGES_MULTI,
    );
    if (hasMultiLanguage && restaurant.targetLanguages.length > 0) {
      void this.translationEnqueue
        .enqueueItem(
          category.restaurantId,
          item,
          restaurant.targetLanguages,
          restaurant.menuSourceLanguage ?? 'bg',
        )
        .then(() => this.translationWorker.kick());
    }

    return item;
  }

  async findAllItemsInCategory(categoryId: string, userId: string) {
    const category = await this.prisma.menuCategory.findUnique({
      where: { id: categoryId },
      select: { restaurantId: true },
    });

    if (!category) {
      throw new NotFoundException(`Category with ID "${categoryId}" not found`);
    }
    await this.checkRestaurantOwnership(category.restaurantId, userId);
    return this.prisma.menuItem.findMany({
      where: { categoryId },
      orderBy: { order: 'asc' },
      include: { options: true },
    });
  }

  async updateItem(
    itemId: string,
    updateItemDto: UpdateItemDto,
    userId: string,
  ) {
    const item = await this.prisma.menuItem.findUnique({
      where: { id: itemId },
      select: {
        category: { select: { restaurantId: true } },
        name: true,
        description: true,
        translations: true,
        allergens: true,
        dietaryTags: true,
        imageUrl: true,
        thumbnailUrl: true,
        isOutOfStock: true,
        rewardPointsMode: true,
        rewardPointsPrice: true,
      },
    });

    if (!item) {
      throw new NotFoundException(`Menu item with ID "${itemId}" not found`);
    }
    const restaurant = await this.checkRestaurantOwnership(
      item.category.restaurantId,
      userId,
    );

    const normalizedDto = this.normalizeRewardPricingInput(
      updateItemDto,
      item as typeof item & {
        rewardPointsMode?: 'OFF' | 'AUTO' | 'CUSTOM' | null;
        rewardPointsPrice?: number | null;
      },
    );
    const updated = await this.prisma.menuItem.update({
      where: { id: itemId },
      data: normalizedDto as Prisma.MenuItemUpdateInput,
    });

    if (
      updateItemDto.isOutOfStock !== undefined &&
      updateItemDto.isOutOfStock !== item.isOutOfStock
    ) {
      this.events.emitPublicMenuItemAvailability(item.category.restaurantId, {
        itemId,
        categoryId: updated.categoryId,
        isOutOfStock: updateItemDto.isOutOfStock,
      });
    }

    // Same logic as updateCategory: delete on null OR non-null replacement (M1.2).
    if (
      updateItemDto.imageUrl !== undefined &&
      updateItemDto.imageUrl !== item.imageUrl &&
      item.imageUrl
    ) {
      await this.deleteImageIfUnreferenced(item.imageUrl, {
        excludeItemIds: [itemId],
      });
    }
    if (
      updateItemDto.thumbnailUrl !== undefined &&
      updateItemDto.thumbnailUrl !== item.thumbnailUrl &&
      item.thumbnailUrl
    ) {
      await this.deleteImageIfUnreferenced(item.thumbnailUrl, {
        excludeItemIds: [itemId],
      });
    }

    // Synchronously purge stale cached translations for fields that changed or
    // were cleared. Runs regardless of DeepL availability so stale data never
    // survives a failed/skipped pre-warm.
    const newAllergens = updateItemDto.allergens;
    const newTags = updateItemDto.dietaryTags;
    const allergensChanged =
      newAllergens !== undefined &&
      JSON.stringify([...(newAllergens ?? [])].sort()) !==
        JSON.stringify([...(item.allergens ?? [])].sort());
    const tagsChanged =
      newTags !== undefined &&
      JSON.stringify([...(newTags ?? [])].sort()) !==
        JSON.stringify([...(item.dietaryTags ?? [])].sort());
    const descCleared =
      updateItemDto.description !== undefined && !updateItemDto.description;

    if (
      (allergensChanged || tagsChanged || descCleared) &&
      item.translations &&
      typeof item.translations === 'object'
    ) {
      const manualDescriptionLocales = new Set<string>();
      if (descCleared) {
        const manualDescriptions =
          await this.prisma.menuTranslationState.findMany({
            where: {
              entityType: 'ITEM',
              entityId: itemId,
              field: 'DESCRIPTION',
              status: 'MANUAL',
            },
            select: { locale: true },
          });
        for (const state of manualDescriptions) {
          manualDescriptionLocales.add(state.locale.toLowerCase());
        }
      }

      const cached: any = { ...(item.translations as Record<string, any>) };
      let dirty = false;
      for (const langKey of Object.keys(cached)) {
        if (
          allergensChanged &&
          cached[langKey] &&
          'allergens' in cached[langKey]
        ) {
          delete cached[langKey].allergens;
          dirty = true;
        }
        if (
          tagsChanged &&
          cached[langKey] &&
          'dietaryTags' in cached[langKey]
        ) {
          delete cached[langKey].dietaryTags;
          dirty = true;
        }
        if (
          descCleared &&
          !manualDescriptionLocales.has(langKey.toLowerCase()) &&
          cached[langKey] &&
          'description' in cached[langKey]
        ) {
          delete cached[langKey].description;
          dirty = true;
        }
      }
      if (dirty) {
        await this.prisma.menuItem.update({
          where: { id: itemId },
          data: { translations: cached },
        });
      }
    }

    const nameChanged = updateItemDto.name && updateItemDto.name !== item.name;
    const descriptionChanged =
      updateItemDto.description !== undefined &&
      updateItemDto.description !== item.description;

    const hasMultiLanguage = this.featureService.restaurantHasFeature(
      restaurant,
      FeatureFlag.LANGUAGES_MULTI,
    );
    if (
      hasMultiLanguage &&
      (nameChanged || descriptionChanged) &&
      restaurant.targetLanguages.length > 0
    ) {
      void this.translationEnqueue
        .enqueueItem(
          restaurant.id,
          updated,
          restaurant.targetLanguages,
          restaurant.menuSourceLanguage ?? 'bg',
        )
        .then(() => this.translationWorker.kick());
    }

    return updated;
  }

  async updateItemImage(
    itemId: string,
    imageUrl: string,
    thumbnailUrl: string,
    userId: string,
  ) {
    const item = await this.prisma.menuItem.findUnique({
      where: { id: itemId },
      select: {
        imageUrl: true,
        thumbnailUrl: true,
        category: { select: { restaurantId: true } },
      },
    });

    if (!item) {
      throw new NotFoundException(`Menu item with ID "${itemId}" not found`);
    }
    await this.checkRestaurantOwnership(item.category.restaurantId, userId);
    const updated = await this.prisma.menuItem.update({
      where: { id: itemId },
      data: { imageUrl, thumbnailUrl },
    });
    if (item.imageUrl !== imageUrl) {
      await this.deleteStoredImagePair(item.imageUrl, item.thumbnailUrl, {
        excludeItemIds: [itemId],
      });
    }
    return updated;
  }

  async updateItemOrder(
    categoryId: string,
    orderedIds: string[],
    userId: string,
  ) {
    const category = await this.prisma.menuCategory.findUnique({
      where: { id: categoryId },
      select: { restaurantId: true },
    });
    if (!category) {
      throw new NotFoundException(`Category with ID "${categoryId}" not found`);
    }
    await this.checkRestaurantOwnership(category.restaurantId, userId);
    if (!Array.isArray(orderedIds)) {
      throw new BadRequestException('orderedIds must be an array');
    }
    if (new Set(orderedIds).size !== orderedIds.length) {
      throw new BadRequestException('orderedIds must not contain duplicates');
    }
    const items = await this.prisma.menuItem.findMany({
      where: { categoryId },
      select: { id: true },
    });
    const existingIds = new Set(items.map((item) => item.id));
    if (
      orderedIds.length !== items.length ||
      orderedIds.some((id) => !existingIds.has(id))
    ) {
      throw new BadRequestException(
        'orderedIds must include every item exactly once',
      );
    }
    await this.prisma.$transaction(
      orderedIds.map((id: string, index: number) =>
        this.prisma.menuItem.updateMany({
          where: { id, categoryId },
          data: { order: index },
        }),
      ),
    );
    return { success: true };
  }

  async removeItem(itemId: string, userId: string) {
    const item = await this.prisma.menuItem.findUnique({
      where: { id: itemId },
      select: {
        imageUrl: true,
        thumbnailUrl: true,
        category: { select: { restaurantId: true } },
      },
    });

    if (!item) {
      throw new NotFoundException(`Menu item with ID "${itemId}" not found`);
    }
    await this.checkRestaurantOwnership(item.category.restaurantId, userId);

    // Scope the scan to the same restaurant so we only read rows we own.
    // The global scan was functionally safe (cuid is unique) but forced a
    // full-table array-contains check across all restaurants (L1.5).
    const itemsHoldingOrphan = await this.prisma.menuItem.findMany({
      where: {
        category: { restaurantId: item.category.restaurantId },
        relatedItemIds: { has: itemId },
      },
      select: { id: true, relatedItemIds: true },
    });

    for (const orphanItem of itemsHoldingOrphan) {
      await this.prisma.menuItem.update({
        where: { id: orphanItem.id },
        data: {
          relatedItemIds: (
            (orphanItem as any).relatedItemIds as string[]
          ).filter((id) => id !== itemId),
        },
      });
    }

    const deleted = await this.prisma.menuItem.delete({
      where: { id: itemId },
    });
    await this.deleteStoredImagePair(item.imageUrl, item.thumbnailUrl, {
      excludeItemIds: [itemId],
    });
    return deleted;
  }

  // в”Ђв”Ђ Menu Option Methods в”Ђв”Ђ

  async createMenuOption(
    itemId: string,
    createMenuOptionDto: CreateMenuOptionDto,
    userId: string,
  ) {
    const item = await this.prisma.menuItem.findUnique({
      where: { id: itemId },
      select: { category: { select: { restaurantId: true } } },
    });

    if (!item) {
      throw new NotFoundException(`Menu item with ID "${itemId}" not found`);
    }
    const restaurant = await this.checkRestaurantOwnership(
      item.category.restaurantId,
      userId,
    );

    const choices = this.parseMenuOptionChoices(createMenuOptionDto.choices);
    const data: Prisma.MenuOptionUncheckedCreateInput = {
      ...createMenuOptionDto,
      choices,
      menuItemId: itemId,
    };
    const option = await this.prisma.menuOption.create({ data });

    const hasMultiLanguage = this.featureService.restaurantHasFeature(
      restaurant,
      FeatureFlag.LANGUAGES_MULTI,
    );
    if (hasMultiLanguage && restaurant.targetLanguages.length > 0) {
      void this.translationEnqueue
        .enqueueOption(
          item.category.restaurantId,
          { id: option.id, name: option.name, choices: choices as any },
          restaurant.targetLanguages,
          restaurant.menuSourceLanguage ?? 'bg',
        )
        .then(() => this.translationWorker.kick());
    }

    return option;
  }

  async updateMenuOption(
    optionId: string,
    updateMenuOptionDto: UpdateMenuOptionDto,
    userId: string,
  ) {
    const option = await this.prisma.menuOption.findUnique({
      where: { id: optionId },
      select: {
        translations: true,
        menuItem: { select: { category: { select: { restaurantId: true } } } },
      },
    });

    if (!option) {
      throw new NotFoundException(
        `Menu option with ID "${optionId}" not found`,
      );
    }
    const restaurant = await this.checkRestaurantOwnership(
      option.menuItem.category.restaurantId,
      userId,
    );

    let choices: any[] | undefined;
    if (updateMenuOptionDto.choices) {
      choices = this.parseMenuOptionChoices(updateMenuOptionDto.choices);
    }

    const data: Prisma.MenuOptionUncheckedUpdateInput = {
      ...updateMenuOptionDto,
      choices,
    };
    const updated = await this.prisma.menuOption.update({
      where: { id: optionId },
      data,
    });

    const hasMultiLanguage = this.featureService.restaurantHasFeature(
      restaurant,
      FeatureFlag.LANGUAGES_MULTI,
    );
    // Unlike the old pre-warm IIFE (which only checked whether the DTO
    // included name/choices fields, not whether their VALUES actually
    // changed), enqueueOption hashes the current content and is a near
    // no-op when nothing changed — so it's safe to call unconditionally
    // here rather than re-deriving a same/different comparison.
    if (hasMultiLanguage && restaurant.targetLanguages.length > 0) {
      void this.translationEnqueue
        .enqueueOption(
          option.menuItem.category.restaurantId,
          { id: optionId, name: updated.name, choices: updated.choices as any },
          restaurant.targetLanguages,
          restaurant.menuSourceLanguage ?? 'bg',
        )
        .then(() => this.translationWorker.kick());
    }

    return updated;
  }

  async removeMenuOption(optionId: string, userId: string) {
    const option = await this.prisma.menuOption.findUnique({
      where: { id: optionId },
      select: {
        menuItem: { select: { category: { select: { restaurantId: true } } } },
      },
    });

    if (!option) {
      throw new NotFoundException(
        `Menu option with ID "${optionId}" not found`,
      );
    }
    await this.checkRestaurantOwnership(
      option.menuItem.category.restaurantId,
      userId,
    );
    return this.prisma.menuOption.delete({ where: { id: optionId } });
  }
}
