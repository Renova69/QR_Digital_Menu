import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { CreateRestaurantDto } from './dto/create-restaurant.dto';
import { UpdateRestaurantDto } from './dto/update-restaurant.dto';
import { PrismaService } from '../prisma/prisma.service';
import { TranslationService } from '../translation/translation.service';
import { StripeProvider } from '../payment/stripe.provider';

@Injectable()
export class RestaurantsService {
  private readonly logger = new Logger(RestaurantsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly translationService: TranslationService,
    private readonly stripeProvider: StripeProvider,
  ) {}

  async create(createRestaurantDto: CreateRestaurantDto, userId: string) {
    const restaurant = await this.prisma.restaurant.create({
      data: {
        ...createRestaurantDto,
        ownerId: userId,
      },
    });
    return restaurant;
  }

  async findAll(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { restaurantId: true },
    });

    if (user?.restaurantId) {
      return this.prisma.restaurant.findMany({
        where: { id: user.restaurantId },
      });
    }

    return this.prisma.restaurant.findMany({
      where: { ownerId: userId },
    });
  }

  async findOne(id: string, userId: string) {
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
      this.prisma.restaurant.findUnique({ where: { id } }),
      this.prisma.user.findUnique({ where: { id: userId }, select: { restaurantId: true } }),
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

    return restaurant;
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
    await this.findOneForManagement(id, userId);

    return this.prisma.restaurant.update({
      where: { id },
      data: updateRestaurantDto,
    });
  }

  async remove(id: string, userId: string) {
    // First, ensure the restaurant exists and the user has permission
    await this.findOne(id, userId);

    return this.prisma.restaurant.delete({
      where: { id },
    });
  }

  async updateLogo(id: string, logoUrl: string, logoThumbnailUrl: string, userId: string) {
    // First, ensure the restaurant exists and the user has permission
    await this.findOneForManagement(id, userId);

    return this.prisma.restaurant.update({
      where: { id },
      data: { logoUrl, logoThumbnailUrl },
    });
  }

  async translateAll(id: string, userId: string) {
    const restaurant = await this.findOneForManagement(id, userId);

    if (!process.env.DEEPL_API_KEY) {
      return {
        success: false,
        message: 'Translation service not configured on this server.',
      };
    }

    if (!restaurant.targetLanguages || restaurant.targetLanguages.length === 0) {
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
      await new Promise((resolve) => setTimeout(resolve, 300)); // Prevent DeepL rate-limiting
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
      allergens.forEach((a) => {
        textToTranslate[`allergen_${a}`] = a;
      });

      const dietaryTags = item.dietaryTags || [];
      dietaryTags.forEach((t) => {
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
      await new Promise((resolve) => setTimeout(resolve, 300)); // Prevent DeepL rate-limiting
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
      await new Promise((resolve) => setTimeout(resolve, 300)); // Prevent DeepL rate-limiting
    }

    return {
      success: true,
      message: `Translated ${categories.length} categories, ${items.length} items, and ${options.length} options.`,
    };
  }

  async generateConnectLink(restaurantId: string, userId: string) {
    const restaurant = await this.findOne(restaurantId, userId);

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
      `${baseUrl}/dashboard?stripe=refresh&tab=settings`,
      `${baseUrl}/dashboard?stripe=success&tab=settings`,
    );

    return { url };
  }

  async getStripeStatus(restaurantId: string, userId: string) {
    const restaurant = await this.findOne(restaurantId, userId);

    if (!restaurant.stripeAccountId) {
      return { stripeOnboarded: false };
    }

    const chargesEnabled = await this.stripeProvider.retrieveAccount(
      restaurant.stripeAccountId,
    );

    if (chargesEnabled && !restaurant.stripeOnboarded) {
      await this.prisma.restaurant.update({
        where: { id: restaurantId },
        data: { stripeOnboarded: true },
      });
    }

    return { stripeOnboarded: chargesEnabled };
  }

  async disconnectStripe(restaurantId: string, userId: string) {
    await this.findOne(restaurantId, userId);

    return this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: { stripeAccountId: null, stripeOnboarded: false },
    });
  }
}
