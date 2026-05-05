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
    const restaurant = await this.checkRestaurantOwnership(restaurantId, userId);

    const count = await this.prisma.menuCategory.count({ where: { restaurantId } });
    const data: Prisma.MenuCategoryUncheckedCreateInput = {
      ...createCategoryDto,
      restaurantId,
      order: count,
    };
    const category = await this.prisma.menuCategory.create({ data });

    if (process.env.DEEPL_API_KEY && restaurant.targetLanguages.length > 0) {
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
          this.logger.error(`Pre-warm failed for category ${category.id}: ${e.message}`);
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
      select: { restaurantId: true, translations: true, name: true },
    });

    if (!category) {
      throw new NotFoundException(`Category with ID "${categoryId}" not found`);
    }
    const restaurant = await this.checkRestaurantOwnership(category.restaurantId, userId);

    const updated = await this.prisma.menuCategory.update({
      where: { id: categoryId },
      data: updateCategoryDto,
    });

    if (
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
          this.logger.error(`Pre-warm failed for category ${categoryId}: ${e.message}`);
        }
      })();
    }

    return updated;
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
    const restaurant = await this.checkRestaurantOwnership(category.restaurantId, userId);

    const count = await this.prisma.menuItem.count({ where: { categoryId } });
    const data: Prisma.MenuItemUncheckedCreateInput = {
      ...createItemDto,
      categoryId,
      order: count,
    };
    const item = await this.prisma.menuItem.create({ data });

    if (process.env.DEEPL_API_KEY && restaurant.targetLanguages.length > 0) {
      void (async () => {
        try {
          const textToTranslate: Record<string, string> = { name: createItemDto.name };
          if (createItemDto.description) textToTranslate.description = createItemDto.description;
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
              if (key.startsWith('allergen_')) { translatedAllergens.push(langData[key]); delete langData[key]; }
              else if (key.startsWith('tag_')) { translatedTags.push(langData[key]); delete langData[key]; }
            }
            if (translatedAllergens.length) (langData as any).allergens = translatedAllergens;
            if (translatedTags.length) (langData as any).dietaryTags = translatedTags;
          }

          if (Object.keys(newTranslations).length > 0) {
            await this.prisma.menuItem.update({
              where: { id: item.id },
              data: { translations: newTranslations },
            });
          }
        } catch (e: any) {
          this.logger.error(`Pre-warm failed for item ${item.id}: ${e.message}`);
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
      },
    });

    if (!item) {
      throw new NotFoundException(`Menu item with ID "${itemId}" not found`);
    }
    const restaurant = await this.checkRestaurantOwnership(item.category.restaurantId, userId);

    const updated = await this.prisma.menuItem.update({
      where: { id: itemId },
      data: updateItemDto,
    });

    const nameChanged = updateItemDto.name && updateItemDto.name !== item.name;
    const descriptionChanged =
      updateItemDto.description !== undefined && updateItemDto.description !== item.description;

    if (
      (nameChanged || descriptionChanged) &&
      process.env.DEEPL_API_KEY &&
      restaurant.targetLanguages.length > 0
    ) {
      void (async () => {
        try {
          const existing: any =
            item.translations && typeof item.translations === 'object' ? item.translations : {};

          const textToTranslate: Record<string, string> = {
            name: updateItemDto.name || item.name,
          };
          const desc = updateItemDto.description !== undefined ? updateItemDto.description : item.description;
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
    const restaurant = await this.checkRestaurantOwnership(item.category.restaurantId, userId);

    const choices = JSON.parse(createMenuOptionDto.choices);
    const data: Prisma.MenuOptionUncheckedCreateInput = {
      ...createMenuOptionDto,
      choices,
      menuItemId: itemId,
    };
    const option = await this.prisma.menuOption.create({ data });

    if (process.env.DEEPL_API_KEY && restaurant.targetLanguages.length > 0) {
      void (async () => {
        try {
          const textToTranslate: Record<string, string> = { name: createMenuOptionDto.name };
          choices.forEach((c: any) => {
            if (c.name) textToTranslate[`choice_${c.name}`] = c.name;
          });

          const newTranslations = await this.translationService.translateObject(
            textToTranslate,
            restaurant.targetLanguages,
          );

          const parsedTranslations: any = {};
          for (const lang of Object.keys(newTranslations)) {
            parsedTranslations[lang] = { name: newTranslations[lang].name, choices: {} };
            for (const key of Object.keys(newTranslations[lang])) {
              if (key.startsWith('choice_')) {
                parsedTranslations[lang].choices[key.replace('choice_', '')] = newTranslations[lang][key];
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
          this.logger.error(`Pre-warm failed for option ${option.id}: ${e.message}`);
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

    const choices = updateMenuOptionDto.choices
      ? JSON.parse(updateMenuOptionDto.choices)
      : undefined;

    const data: Prisma.MenuOptionUncheckedUpdateInput = {
      ...updateMenuOptionDto,
      choices,
    };
    const updated = await this.prisma.menuOption.update({ where: { id: optionId }, data });

    if (process.env.DEEPL_API_KEY && restaurant.targetLanguages.length > 0) {
      void (async () => {
        try {
          const existingTrans: any =
            option.translations && typeof option.translations === 'object'
              ? option.translations
              : {};
          const textToTranslate: Record<string, string> = {};
          if (updateMenuOptionDto.name) textToTranslate.name = updateMenuOptionDto.name;
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
            if (newTranslations[lang].name) existingTrans[lang].name = newTranslations[lang].name;
            for (const key of Object.keys(newTranslations[lang])) {
              if (key.startsWith('choice_')) {
                existingTrans[lang].choices[key.replace('choice_', '')] = newTranslations[lang][key];
              }
            }
          }

          await this.prisma.menuOption.update({
            where: { id: optionId },
            data: { translations: existingTrans } as any,
          });
        } catch (e: any) {
          this.logger.error(`Pre-warm failed for option ${optionId}: ${e.message}`);
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
