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
  loyaltyExpiryReminderDays: true,
  loyaltyGoldMultiplier: true,
  loyaltyGoldThreshold: true,
  loyaltyPointExpiryDays: true,
  loyaltySilverMultiplier: true,
  loyaltySilverThreshold: true,
  defaultTheme: true,
  stripeOnboarded: true,
  paymentsEnabled: true,
  notifyAllStaffOnPayment: true,
  tipsEnabled: true,
  tipOptions: true,
  platformFeePercent: true,
  tier: true,
  forceTier: true,
  tierUpdatedAt: true,
  isActive: true,
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
  ) {}

  async create(createRestaurantDto: CreateRestaurantDto, userId: string) {
    const existing = await this.prisma.restaurant.count({
      where: { ownerId: userId },
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
        country: 'Bulgaria',
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
    const dto = { ...this.applyEffectiveTier(restaurant) } as T &
      Record<string, unknown>;
    for (const field of RESTAURANT_PRIVATE_FIELDS) {
      delete dto[field];
    }
    return dto;
  }

  async findAll(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { restaurantId: true },
    });

    const rows = user?.restaurantId
      ? await this.prisma.restaurant.findMany({
          where: { id: user.restaurantId },
          select: RESTAURANT_READ_SELECT,
        })
      : await this.prisma.restaurant.findMany({
          where: { ownerId: userId },
          select: RESTAURANT_READ_SELECT,
        });

    return rows.map((r) => this.toRestaurantReadDto(r));
  }

  async findOne(id: string, userId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id },
      select: RESTAURANT_READ_SELECT,
    });

    if (!restaurant) {
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
    if (!restaurant) {
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

    if (!restaurant) {
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

    if (!restaurant) {
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
    const data = this.featureService.hasFeature(
      tier,
      FeatureFlag.BRANDING_CUSTOM,
    )
      ? { ...updateRestaurantDto }
      : stripBrandingFields({ ...updateRestaurantDto });

    // Multi-language gating: strip targetLanguages if tier lacks multi-language feature
    if (!this.featureService.hasFeature(tier, FeatureFlag.LANGUAGES_MULTI)) {
      delete data.targetLanguages;
    }

    return this.prisma.restaurant.update({
      where: { id },
      data,
    });
  }

  async remove(id: string, userId: string) {
    // First, ensure the restaurant exists and the user has permission
    await this.findOne(id, userId);

    return this.prisma.restaurant.delete({
      where: { id },
    });
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

  async translateAll(id: string, userId: string) {
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

    if (!process.env.DEEPL_API_KEY) {
      return {
        success: false,
        message: 'Translation service not configured on this server.',
      };
    }

    if (
      !restaurant.targetLanguages ||
      restaurant.targetLanguages.length === 0
    ) {
      return {
        success: false,
        message: 'No target languages configured.',
      };
    }

    // Process Categories
    const categories = await this.prisma.menuCategory.findMany({
      where: { restaurantId: id },
    });

    for (const cat of categories) {
      const parsedTranslations: any =
        cat.translations && typeof cat.translations === 'object'
          ? cat.translations
          : {};
      const newTranslations = await this.translationService.translateObject(
        { name: cat.name },
        restaurant.targetLanguages,
      );
      await this.prisma.menuCategory.update({
        where: { id: cat.id },
        data: { translations: { ...parsedTranslations, ...newTranslations } },
      });
      await new Promise<void>((resolve) => setTimeout(resolve, 300)); // Prevent DeepL rate-limiting
    }

    // Process Items
    const items = await this.prisma.menuItem.findMany({
      where: { category: { restaurantId: id } },
    });

    for (const item of items) {
      const parsedTranslations: any =
        item.translations && typeof item.translations === 'object'
          ? item.translations
          : {};

      // Build translation map: name, description, + each allergen and tag
      const textToTranslate: Record<string, string> = { name: item.name };
      if (item.description) textToTranslate.description = item.description;

      const allergens = item.allergens || [];
      allergens.forEach((a: string) => {
        textToTranslate[`allergen_${a}`] = a;
      });

      const dietaryTags = item.dietaryTags || [];
      dietaryTags.forEach((t: string) => {
        textToTranslate[`tag_${t}`] = t;
      });

      const newTranslations = await this.translationService.translateObject(
        textToTranslate,
        restaurant.targetLanguages,
      );

      // Restructure: pull allergen_ and tag_ keys into arrays per language
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

        if (translatedAllergens.length > 0)
          langData.allergens = translatedAllergens as any;
        if (translatedTags.length > 0)
          langData.dietaryTags = translatedTags as any;
      }

      await this.prisma.menuItem.update({
        where: { id: item.id },
        data: { translations: { ...parsedTranslations, ...newTranslations } },
      });
      await new Promise<void>((resolve) => setTimeout(resolve, 300)); // Prevent DeepL rate-limiting
    }

    // Process Options
    const options = await this.prisma.menuOption.findMany({
      where: { menuItem: { category: { restaurantId: id } } },
    });

    for (const option of options) {
      const parsedTranslations: any =
        (option as any).translations &&
        typeof (option as any).translations === 'object'
          ? (option as any).translations
          : {};

      const textToTranslate: Record<string, string> = { name: option.name };
      const choices = (option.choices as any[]) || [];
      choices.forEach((c: any) => {
        if (c.name) textToTranslate[`choice_${c.name}`] = c.name;
      });

      const newTranslations = await this.translationService.translateObject(
        textToTranslate,
        restaurant.targetLanguages,
      );

      for (const lang of Object.keys(newTranslations)) {
        if (!parsedTranslations[lang])
          parsedTranslations[lang] = { choices: {} };
        if (!parsedTranslations[lang].choices)
          parsedTranslations[lang].choices = {};

        if (newTranslations[lang].name) {
          parsedTranslations[lang].name = newTranslations[lang].name;
        }

        for (const key of Object.keys(newTranslations[lang])) {
          if (key.startsWith('choice_')) {
            const originalChoiceName = key.replace('choice_', '');
            parsedTranslations[lang].choices[originalChoiceName] =
              newTranslations[lang][key];
          }
        }
      }

      await this.prisma.menuOption.update({
        where: { id: option.id },
        data: {
          translations:
            Object.keys(parsedTranslations).length > 0
              ? parsedTranslations
              : undefined,
        } as any,
      });
      await new Promise<void>((resolve) => setTimeout(resolve, 300)); // Prevent DeepL rate-limiting
    }

    return {
      success: true,
      message: `Translated ${categories.length} categories, ${items.length} items, and ${options.length} options.`,
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

    const chargesEnabled = await this.stripeProvider.retrieveAccount(
      restaurant.stripeAccountId,
    );

    if (chargesEnabled && !restaurant.stripeOnboarded) {
      await this.prisma.restaurant.update({
        where: { id: restaurantId },
        data: { stripeOnboarded: true, paymentsEnabled: true },
      });
    }

    return { stripeOnboarded: chargesEnabled };
  }

  async disconnectStripe(restaurantId: string, userId: string) {
    await this.findOneForBilling(restaurantId, userId);

    return this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: { stripeAccountId: null, stripeOnboarded: false },
    });
  }
}
