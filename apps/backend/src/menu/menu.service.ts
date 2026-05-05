import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TranslationService } from '../translation/translation.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { CreateMenuOptionDto } from './dto/create-menu-option.dto';
import { UpdateMenuOptionDto } from './dto/update-menu-option.dto';
import { Prisma } from '@prisma/client';
import { DateTime } from 'luxon';

@Injectable()
export class MenuService {
  private readonly logger = new Logger(MenuService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly translationService: TranslationService,
  ) {}

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

  // Category Methods
  async createCategory(
    restaurantId: string,
    createCategoryDto: CreateCategoryDto,
    userId: string,
  ) {
    const restaurant = await this.checkRestaurantOwnership(
      restaurantId,
      userId,
    );

    let translations = {};
    if (
      restaurant.googleTranslateApiKey &&
      restaurant.targetLanguages.length > 0
    ) {
      translations = await this.translationService.translateObject(
        { name: createCategoryDto.name },
        restaurant.targetLanguages,
        restaurant.googleTranslateApiKey,
      );
    }

    const count = await this.prisma.menuCategory.count({
      where: { restaurantId },
    });
    const data: Prisma.MenuCategoryUncheckedCreateInput = {
      ...createCategoryDto,
      restaurantId,
      order: count,
      translations:
        Object.keys(translations).length > 0 ? translations : undefined,
    };
    return this.prisma.menuCategory.create({ data });
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
      select: { restaurantId: true, translations: true, name: true },
    });

    if (!category) {
      throw new NotFoundException(`Category with ID "${categoryId}" not found`);
    }
    const restaurant = await this.checkRestaurantOwnership(
      category.restaurantId,
      userId,
    );

    let parsedTranslations: any =
      category.translations && typeof category.translations === 'object'
        ? category.translations
        : {};

    if (updateCategoryDto.name && updateCategoryDto.name !== category.name) {
      if (
        restaurant.googleTranslateApiKey &&
        restaurant.targetLanguages.length > 0
      ) {
        const newTranslations = await this.translationService.translateObject(
          { name: updateCategoryDto.name },
          restaurant.targetLanguages,
          restaurant.googleTranslateApiKey,
        );
        parsedTranslations = { ...parsedTranslations, ...newTranslations };
      }
    }

    return this.prisma.menuCategory.update({
      where: { id: categoryId },
      data: {
        ...updateCategoryDto,
        translations:
          Object.keys(parsedTranslations).length > 0
            ? parsedTranslations
            : undefined,
      },
    });
  }

  async removeCategory(categoryId: string, userId: string) {
    const category = await this.prisma.menuCategory.findUnique({
      where: { id: categoryId },
      select: { restaurantId: true },
    });

    if (!category) {
      throw new NotFoundException(`Category with ID "${categoryId}" not found`);
    }
    await this.checkRestaurantOwnership(category.restaurantId, userId);
    return this.prisma.menuCategory.delete({ where: { id: categoryId } });
  }

  async updateCategoryImage(
    categoryId: string,
    imageUrl: string,
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
    return this.prisma.menuCategory.update({
      where: { id: categoryId },
      data: { imageUrl } as any,
    });
  }

  // Item Methods
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

    let translations = {};
    if (
      restaurant.googleTranslateApiKey &&
      restaurant.targetLanguages.length > 0
    ) {
      translations = await this.translationService.translateObject(
        {
          name: createItemDto.name,
          description: createItemDto.description,
        },
        restaurant.targetLanguages,
        restaurant.googleTranslateApiKey,
      );
    }

    const count = await this.prisma.menuItem.count({ where: { categoryId } });
    const data: Prisma.MenuItemUncheckedCreateInput = {
      ...createItemDto,
      categoryId,
      order: count,
      translations:
        Object.keys(translations).length > 0 ? translations : undefined,
    };
    return this.prisma.menuItem.create({ data });
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
      },
    });

    if (!item) {
      throw new NotFoundException(`Menu item with ID "${itemId}" not found`);
    }
    const restaurant = await this.checkRestaurantOwnership(
      item.category.restaurantId,
      userId,
    );

    let parsedTranslations: any =
      item.translations && typeof item.translations === 'object'
        ? item.translations
        : {};

    const nameChanged = updateItemDto.name && updateItemDto.name !== item.name;
    const descriptionChanged =
      updateItemDto.description !== undefined &&
      updateItemDto.description !== item.description;

    if (nameChanged || descriptionChanged) {
      if (
        restaurant.googleTranslateApiKey &&
        restaurant.targetLanguages.length > 0
      ) {
        const textToTranslate = {
          name: updateItemDto.name || item.name,
          description:
            updateItemDto.description !== undefined
              ? updateItemDto.description
              : item.description,
        };
        const newTranslations = await this.translationService.translateObject(
          textToTranslate,
          restaurant.targetLanguages,
          restaurant.googleTranslateApiKey,
        );
        parsedTranslations = { ...parsedTranslations, ...newTranslations };
      }
    }

    return this.prisma.menuItem.update({
      where: { id: itemId },
      data: {
        ...updateItemDto,
        translations:
          Object.keys(parsedTranslations).length > 0
            ? parsedTranslations
            : undefined,
      },
    });
  }

  async updateItemImage(itemId: string, imageUrl: string, userId: string) {
    const item = await this.prisma.menuItem.findUnique({
      where: { id: itemId },
      select: { category: { select: { restaurantId: true } } },
    });

    if (!item) {
      throw new NotFoundException(`Menu item with ID "${itemId}" not found`);
    }
    await this.checkRestaurantOwnership(item.category.restaurantId, userId);
    return this.prisma.menuItem.update({
      where: { id: itemId },
      data: { imageUrl },
    });
  }

  async removeItem(itemId: string, userId: string) {
    const item = await this.prisma.menuItem.findUnique({
      where: { id: itemId },
      select: { category: { select: { restaurantId: true } } },
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

    return this.prisma.menuItem.delete({ where: { id: itemId } });
  }

  // Menu Option Methods
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

    const choices = JSON.parse(createMenuOptionDto.choices);
    const parsedTranslations: any = {};

    if (restaurant.deeplApiKey && restaurant.targetLanguages.length > 0) {
      const textToTranslate: Record<string, string> = {
        name: createMenuOptionDto.name,
      };
      choices.forEach((c: any) => {
        if (c.name) textToTranslate[`choice_${c.name}`] = c.name;
      });

      const newTranslations = await this.translationService.translateObject(
        textToTranslate,
        restaurant.targetLanguages,
        restaurant.deeplApiKey,
      );

      // Restructure translations for choices
      for (const lang of Object.keys(newTranslations)) {
        parsedTranslations[lang] = {
          name: newTranslations[lang].name,
          choices: {},
        };
        for (const key of Object.keys(newTranslations[lang])) {
          if (key.startsWith('choice_')) {
            const originalChoiceName = key.replace('choice_', '');
            parsedTranslations[lang].choices[originalChoiceName] =
              newTranslations[lang][key];
          }
        }
      }
    }

    const data: Prisma.MenuOptionUncheckedCreateInput = {
      ...createMenuOptionDto,
      choices,
      menuItemId: itemId,
      translations:
        Object.keys(parsedTranslations).length > 0
          ? parsedTranslations
          : undefined,
    };
    return this.prisma.menuOption.create({ data });
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

    const parsedTranslations: any =
      (option as any).translations &&
      typeof (option as any).translations === 'object'
        ? (option as any).translations
        : {};
    const choices = updateMenuOptionDto.choices
      ? JSON.parse(updateMenuOptionDto.choices)
      : undefined;

    if (restaurant.deeplApiKey && restaurant.targetLanguages.length > 0) {
      const textToTranslate: Record<string, string> = {};
      if (updateMenuOptionDto.name)
        textToTranslate.name = updateMenuOptionDto.name;

      if (choices) {
        choices.forEach((c: any) => {
          if (c.name) textToTranslate[`choice_${c.name}`] = c.name;
        });
      }

      if (Object.keys(textToTranslate).length > 0) {
        const newTranslations = await this.translationService.translateObject(
          textToTranslate,
          restaurant.targetLanguages,
          restaurant.deeplApiKey,
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
      }
    }

    const data: Prisma.MenuOptionUncheckedUpdateInput = {
      ...updateMenuOptionDto,
      choices,
      translations:
        Object.keys(parsedTranslations).length > 0
          ? parsedTranslations
          : undefined,
    };
    return this.prisma.menuOption.update({
      where: { id: optionId },
      data,
    });
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

  // Public Menu
  async getPublicMenu(restaurantId: string) {
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
        targetLanguages: true,
        timezone: true,
      } as any,
    });

    if (!restaurant) {
      throw new NotFoundException(
        `Restaurant with ID "${restaurantId}" not found`,
      );
    }

    const allCategories = await this.prisma.menuCategory.findMany({
      where: { restaurantId },
      include: {
        items: {
          where: { isOutOfStock: false },
          orderBy: {
            order: 'asc',
          },
          include: {
            options: true,
          },
        },
      },
      orderBy: {
        order: 'asc',
      },
    });

    const restaurantTz = (restaurant as any).timezone || 'UTC';
    const now = DateTime.now().setZone(restaurantTz as string);
    const currentTimeStr = now.toFormat('HH:mm');
    const currentDay = now.weekday === 7 ? 0 : now.weekday;

    const filteredCategories = allCategories.filter((category) => {
      if (category.availabilityType === 'HIDDEN') return false;
      if (category.availabilityType === 'ALWAYS') return true;
      if (category.availabilityType === 'SCHEDULED') {
        if (
          category.daysOfWeek &&
          Array.isArray(category.daysOfWeek) &&
          category.daysOfWeek.length > 0 &&
          !category.daysOfWeek.includes(currentDay)
        ) {
          return false;
        }
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

    return { restaurant, categories: filteredCategories };
  }

  async getTrendingItems(restaurantId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { trendingMode: true, id: true },
    });

    if (!restaurant || restaurant.trendingMode === 'OFF') {
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

    if (mostOrdered.length === 0) {
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

    const itemIds = mostOrdered
      .map((mo) => mo.menuItemId)
      .filter((id) => id !== null);
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
      .map((id) => trendingItems.find((item) => item.id === id))
      .filter(Boolean);
  }
  async auditMenu(restaurantId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      include: {
        menuCategories: {
          include: {
            items: true,
          },
        },
      },
    });

    if (!restaurant) {
      throw new Error('Restaurant not found');
    }

    const issues: any[] = [];
    const targetLanguages = restaurant.targetLanguages || [];

    restaurant.menuCategories.forEach((category) => {
      // Rule: Empty category
      if (category.items.length === 0) {
        issues.push({
          type: 'error',
          message: 'Category is empty and will not display any items.',
          categoryId: category.id,
          field: 'items',
        });
      }

      // Rule: Category has no image
      if (!(category as any).imageUrl) {
        issues.push({
          type: 'info',
          message:
            'Category has no banner image. Adding one improves visual appeal.',
          categoryId: category.id,
          field: 'imageUrl',
        });
      }

      // Rule: Missing translations for category
      if (targetLanguages.length > 0) {
        const translations = (category as any).translations || {};
        targetLanguages.forEach((lang) => {
          if (!translations[lang] || !translations[lang].name) {
            issues.push({
              type: 'warning',
              message: `Category is missing translation for ${lang.toUpperCase()}.`,
              categoryId: category.id,
              field: 'translations',
            });
          }
        });
      }

      // Check items
      category.items.forEach((item) => {
        // Rule: Item price is 0
        if (item.price === 0) {
          issues.push({
            type: 'error',
            message: `Item price is set to 0.`,
            categoryId: category.id,
            itemId: item.id,
            field: 'price',
          });
        }

        // Rule: Item has no description
        if (!item.description || item.description.trim() === '') {
          issues.push({
            type: 'warning',
            message: `Item has no description. Descriptions help customers make choices.`,
            categoryId: category.id,
            itemId: item.id,
            field: 'description',
          });
        }

        // Rule: Item has no image
        if (!item.imageUrl) {
          issues.push({
            type: 'info',
            message: `Item has no image. Images increase sales by up to 30%.`,
            categoryId: category.id,
            itemId: item.id,
            field: 'imageUrl',
          });
        }

        // Rule: Missing translations for item
        if (targetLanguages.length > 0) {
          const translations = (item.translations as any) || {};
          targetLanguages.forEach((lang) => {
            if (!translations[lang] || !translations[lang].name) {
              issues.push({
                type: 'warning',
                message: `Item is missing translation for ${lang.toUpperCase()}.`,
                categoryId: category.id,
                itemId: item.id,
                field: 'translations',
              });
            }
          });
        }
      });
    });

    return issues;
  }
}
