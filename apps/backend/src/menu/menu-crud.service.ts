import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TranslationService } from '../translation/translation.service';
import { MenuTranslationService } from './menu-translation.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { CreateMenuOptionDto } from './dto/create-menu-option.dto';
import { UpdateMenuOptionDto } from './dto/update-menu-option.dto';
import { Prisma, AvailabilityType } from '@prisma/client';
import { DateTime } from 'luxon';
import { FeatureService } from '../subscription/feature.service';
import { FeatureFlag } from '../subscription/feature-flag.enum';
import { stripBrandingFields } from '../restaurants/branding-fields';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class MenuCrudService {
  private readonly logger = new Logger(MenuCrudService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly translationService: TranslationService,
    private readonly menuTranslationService: MenuTranslationService,
    private readonly featureService: FeatureService,
    private readonly storageService: StorageService,
  ) {}

  private async deleteStoredImagePair(
    imageUrl?: string | null,
    thumbnailUrl?: string | null,
  ) {
    // Delete each URL independently. Using `imageUrl ?? thumbnailUrl` previously
    // caused `_thumb_thumb.webp` if only thumbnailUrl was non-null (L1.3).
    const deletes: Promise<void>[] = [];
    if (imageUrl) deletes.push(this.storageService.delete(imageUrl));
    if (thumbnailUrl) deletes.push(this.storageService.delete(thumbnailUrl));
    await Promise.all(deletes);
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

    return choices.map((choice: any) => {
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
  }

  /** Dayparting requires the DAYPARTING feature on the restaurant's EFFECTIVE
   *  tier (honors super-admin forceTier) — not a hardcoded tier list (#11). */
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
   *  EFFECTIVE tier lacks BRANDING_CUSTOM. Non-destructive — the DB keeps
   *  the values so re-upgrade restores them instantly. Prevents stale
   *  branding (logo/colors/fonts) from a downgraded restaurant continuing
   *  to render on the public menu. Expects `restaurant.tier` to already be
   *  the effective tier (forceTier resolved). Social URLs are not branding —
   *  see branding-fields.ts — so the footer is unaffected. */
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
        contactInfo: true,
      } as any,
    });

    if (!restaurant) {
      throw new NotFoundException(
        `Restaurant with ID "${restaurantId}" not found`,
      );
    }

    const restaurantClone = { ...restaurant } as any;
    restaurantClone.tier = restaurantClone.forceTier ?? restaurantClone.tier;
    delete restaurantClone.forceTier;

    const allCategories = await this.prisma.menuCategory.findMany({
      where: { restaurantId },
      include: {
        items: {
          where: { isOutOfStock: false },
          orderBy: { order: 'asc' },
          include: { options: true },
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

    const targetLangs = (restaurantClone.targetLanguages as string[]) || [];
    if (
      hasMultiLanguage &&
      lang &&
      process.env.DEEPL_API_KEY &&
      targetLangs.includes(lang)
    ) {
      await this.menuTranslationService.applyLazyTranslations(
        filteredCategories,
        lang,
      );
    }

    restaurantClone.features = this.featureService.getFeatures(
      restaurantClone.tier ?? 'FREE',
    );

    return {
      restaurant: this.applyBrandingEntitlement(restaurantClone),
      categories: filteredCategories,
    };
  }

  /** Returns restaurant branding + category metadata (no items).
   *  Frontend uses this for the initial fast paint, then lazy-loads items per category. */
  async getPublicMenuMeta(restaurantId: string) {
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
        contactInfo: true,
      } as any,
    });

    if (!restaurant) {
      throw new NotFoundException(
        `Restaurant with ID "${restaurantId}" not found`,
      );
    }

    const restaurantClone = { ...restaurant } as any;
    restaurantClone.tier = restaurantClone.forceTier ?? restaurantClone.tier;
    delete restaurantClone.forceTier;

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
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        timezone: true,
        tier: true,
        forceTier: true,
        targetLanguages: true,
      },
    });

    if (!restaurant) {
      throw new NotFoundException(
        `Restaurant with ID "${restaurantId}" not found`,
      );
    }

    const tier = restaurant.forceTier ?? restaurant.tier ?? 'FREE';
    const timezone = restaurant.timezone || 'Europe/Sofia';

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
      include: { options: true },
    });

    const hasMultiLanguage = this.featureService.hasFeature(
      tier,
      FeatureFlag.LANGUAGES_MULTI,
    );
    if (
      hasMultiLanguage &&
      lang &&
      process.env.DEEPL_API_KEY &&
      restaurant.targetLanguages.includes(lang)
    ) {
      const fakeCategory = { ...category, items };
      await this.menuTranslationService.applyLazyTranslations(
        [fakeCategory as any],
        lang,
      );
      return fakeCategory.items;
    }

    return items;
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

  async getTrendingItems(restaurantId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { trendingMode: true, id: true, tier: true, forceTier: true },
    });

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

    if (restaurant.trendingMode === 'MANUAL') {
      return this.prisma.menuItem.findMany({
        where: {
          category: { restaurantId },
          isFeatured: true,
          isOutOfStock: false,
        },
        take: 4,
        orderBy: { order: 'asc' },
        include: {
          options: true,
          category: { select: { isDrinkCategory: true, name: true } },
        },
      });
    }

    const mostOrdered = await this.prisma.orderItem.groupBy({
      by: ['menuItemId'],
      where: {
        order: { restaurantId },
        menuItemId: { not: null },
      },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 4,
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

    return itemIds
      .map((id: string) =>
        trendingItems.find((item: { id: string }) => item.id === id),
      )
      .filter(Boolean);
  }

  async checkRestaurantActive(restaurantId: string): Promise<void> {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { isActive: true },
    });
    if (restaurant && !restaurant.isActive) {
      throw new ForbiddenException({
        code: 'RESTAURANT_SUSPENDED',
        message: 'This restaurant has been suspended',
      });
    }
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

    if (restaurant.ownerId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to access this resource',
      );
    }

    return restaurant;
  }

  // ── Category Methods ──

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
    if (
      hasMultiLanguage &&
      process.env.DEEPL_API_KEY &&
      restaurant.targetLanguages.length > 0
    ) {
      void (async () => {
        try {
          const newTranslations = await this.translationService.translateObject(
            { name: createCategoryDto.name },
            restaurant.targetLanguages,
          );
          if (Object.keys(newTranslations).length > 0) {
            await this.prisma.menuCategory.update({
              where: { id: category.id },
              data: { translations: newTranslations },
            });
          }
        } catch (e: any) {
          this.logger.error(
            `Pre-warm failed for category ${category.id}: ${e.message}`,
          );
        }
      })();
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

    const updated = await this.prisma.menuCategory.update({
      where: { id: categoryId },
      data: sanitizedDto,
    });

    if (
      updateCategoryDto.imageUrl === null ||
      updateCategoryDto.thumbnailUrl === null
    ) {
      await this.deleteStoredImagePair(
        category.imageUrl,
        category.thumbnailUrl,
      );
    }

    const hasMultiLanguage = this.featureService.restaurantHasFeature(
      restaurant,
      FeatureFlag.LANGUAGES_MULTI,
    );
    if (
      hasMultiLanguage &&
      updateCategoryDto.name &&
      updateCategoryDto.name !== category.name &&
      process.env.DEEPL_API_KEY &&
      restaurant.targetLanguages.length > 0
    ) {
      void (async () => {
        try {
          const existing: any =
            category.translations && typeof category.translations === 'object'
              ? category.translations
              : {};
          const newTranslations = await this.translationService.translateObject(
            { name: updateCategoryDto.name! },
            restaurant.targetLanguages,
          );
          await this.prisma.menuCategory.update({
            where: { id: categoryId },
            data: { translations: { ...existing, ...newTranslations } },
          });
        } catch (e: any) {
          this.logger.error(
            `Pre-warm failed for category ${categoryId}: ${e.message}`,
          );
        }
      })();
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
        items: { select: { imageUrl: true, thumbnailUrl: true } },
      },
    });

    if (!category) {
      throw new NotFoundException(`Category with ID "${categoryId}" not found`);
    }
    await this.checkRestaurantOwnership(category.restaurantId, userId);
    const deleted = await this.prisma.menuCategory.delete({
      where: { id: categoryId },
    });
    await this.deleteStoredImagePair(category.imageUrl, category.thumbnailUrl);
    for (const item of category.items) {
      await this.deleteStoredImagePair(item.imageUrl, item.thumbnailUrl);
    }
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
      );
    }
    return updated;
  }

  // ── Item Methods ──

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
    const data: Prisma.MenuItemUncheckedCreateInput = {
      ...createItemDto,
      categoryId,
      order: count,
    };
    const item = await this.prisma.menuItem.create({ data });

    const hasMultiLanguage = this.featureService.restaurantHasFeature(
      restaurant,
      FeatureFlag.LANGUAGES_MULTI,
    );
    if (
      hasMultiLanguage &&
      process.env.DEEPL_API_KEY &&
      restaurant.targetLanguages.length > 0
    ) {
      void (async () => {
        try {
          const textToTranslate: Record<string, string> = {
            name: createItemDto.name,
          };
          if (createItemDto.description)
            textToTranslate.description = createItemDto.description;
          (createItemDto.allergens || []).forEach((a: string) => {
            textToTranslate[`allergen_${a}`] = a;
          });
          (createItemDto.dietaryTags || []).forEach((t: string) => {
            textToTranslate[`tag_${t}`] = t;
          });

          const newTranslations = await this.translationService.translateObject(
            textToTranslate,
            restaurant.targetLanguages,
          );

          for (const lang of Object.keys(newTranslations)) {
            const langData = newTranslations[lang];
            const translatedAllergens: string[] = [];
            const translatedTags: string[] = [];
            for (const key of Object.keys(langData)) {
              if (key.startsWith('allergen_')) {
                translatedAllergens.push(langData[key]);
                delete langData[key];
              } else if (key.startsWith('tag_')) {
                translatedTags.push(langData[key]);
                delete langData[key];
              }
            }
            if (translatedAllergens.length)
              (langData as any).allergens = translatedAllergens;
            if (translatedTags.length)
              (langData as any).dietaryTags = translatedTags;
          }

          if (Object.keys(newTranslations).length > 0) {
            await this.prisma.menuItem.update({
              where: { id: item.id },
              data: { translations: newTranslations },
            });
          }
        } catch (e: any) {
          this.logger.error(
            `Pre-warm failed for item ${item.id}: ${e.message}`,
          );
        }
      })();
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
      },
    });

    if (!item) {
      throw new NotFoundException(`Menu item with ID "${itemId}" not found`);
    }
    const restaurant = await this.checkRestaurantOwnership(
      item.category.restaurantId,
      userId,
    );

    const updated = await this.prisma.menuItem.update({
      where: { id: itemId },
      data: updateItemDto,
    });

    if (
      updateItemDto.imageUrl === null ||
      updateItemDto.thumbnailUrl === null
    ) {
      await this.deleteStoredImagePair(item.imageUrl, item.thumbnailUrl);
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
      process.env.DEEPL_API_KEY &&
      restaurant.targetLanguages.length > 0
    ) {
      void (async () => {
        try {
          const existing: any =
            item.translations && typeof item.translations === 'object'
              ? item.translations
              : {};

          const textToTranslate: Record<string, string> = {
            name: updateItemDto.name || item.name,
          };
          const desc =
            updateItemDto.description !== undefined
              ? updateItemDto.description
              : item.description;
          if (desc) textToTranslate.description = desc;

          const newTranslations = await this.translationService.translateObject(
            textToTranslate,
            restaurant.targetLanguages,
          );
          await this.prisma.menuItem.update({
            where: { id: itemId },
            data: { translations: { ...existing, ...newTranslations } },
          });
        } catch (e: any) {
          this.logger.error(`Pre-warm failed for item ${itemId}: ${e.message}`);
        }
      })();
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
      await this.deleteStoredImagePair(item.imageUrl, item.thumbnailUrl);
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

    const itemsHoldingOrphan = await this.prisma.menuItem.findMany({
      where: {
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
    await this.deleteStoredImagePair(item.imageUrl, item.thumbnailUrl);
    return deleted;
  }

  // ── Menu Option Methods ──

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
    if (
      hasMultiLanguage &&
      process.env.DEEPL_API_KEY &&
      restaurant.targetLanguages.length > 0
    ) {
      void (async () => {
        try {
          const textToTranslate: Record<string, string> = {
            name: createMenuOptionDto.name,
          };
          choices.forEach((c: any) => {
            if (c.name) textToTranslate[`choice_${c.name}`] = c.name;
          });

          const newTranslations = await this.translationService.translateObject(
            textToTranslate,
            restaurant.targetLanguages,
          );

          const parsedTranslations: any = {};
          for (const lang of Object.keys(newTranslations)) {
            parsedTranslations[lang] = {
              name: newTranslations[lang].name,
              choices: {},
            };
            for (const key of Object.keys(newTranslations[lang])) {
              if (key.startsWith('choice_')) {
                parsedTranslations[lang].choices[key.replace('choice_', '')] =
                  newTranslations[lang][key];
              }
            }
          }

          if (Object.keys(parsedTranslations).length > 0) {
            await this.prisma.menuOption.update({
              where: { id: option.id },
              data: { translations: parsedTranslations } as any,
            });
          }
        } catch (e: any) {
          this.logger.error(
            `Pre-warm failed for option ${option.id}: ${e.message}`,
          );
        }
      })();
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
    if (
      hasMultiLanguage &&
      process.env.DEEPL_API_KEY &&
      restaurant.targetLanguages.length > 0
    ) {
      void (async () => {
        try {
          const existingTrans: any =
            option.translations && typeof option.translations === 'object'
              ? option.translations
              : {};
          const textToTranslate: Record<string, string> = {};
          if (updateMenuOptionDto.name)
            textToTranslate.name = updateMenuOptionDto.name;
          if (choices) {
            choices.forEach((c: any) => {
              if (c.name) textToTranslate[`choice_${c.name}`] = c.name;
            });
          }
          if (Object.keys(textToTranslate).length === 0) return;

          const newTranslations = await this.translationService.translateObject(
            textToTranslate,
            restaurant.targetLanguages,
          );

          for (const lang of Object.keys(newTranslations)) {
            if (!existingTrans[lang]) existingTrans[lang] = { choices: {} };
            if (!existingTrans[lang].choices) existingTrans[lang].choices = {};
            if (newTranslations[lang].name)
              existingTrans[lang].name = newTranslations[lang].name;
            for (const key of Object.keys(newTranslations[lang])) {
              if (key.startsWith('choice_')) {
                existingTrans[lang].choices[key.replace('choice_', '')] =
                  newTranslations[lang][key];
              }
            }
          }

          await this.prisma.menuOption.update({
            where: { id: optionId },
            data: { translations: existingTrans } as any,
          });
        } catch (e: any) {
          this.logger.error(
            `Pre-warm failed for option ${optionId}: ${e.message}`,
          );
        }
      })();
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
