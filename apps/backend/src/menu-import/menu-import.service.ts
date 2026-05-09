import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ImportMenuDto } from './dto/import-menu.dto';
import { randomBytes } from 'crypto';
import { AvailabilityType, Currency, OptionType } from '@prisma/client';

const VALID_AVAILABILITY = new Set(Object.values(AvailabilityType));

@Injectable()
export class MenuImportService {
  constructor(private readonly prisma: PrismaService) {}

  async checkOwnership(restaurantId: string, userId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true, ownerId: true },
    });
    if (!restaurant) throw new NotFoundException('Restaurant not found');
    if (restaurant.ownerId !== userId) throw new ForbiddenException('Access denied');
    return restaurant;
  }

  async upsertMenu(restaurantId: string, dto: ImportMenuDto) {
    const stats = { created: 0, updated: 0, categories: 0 };

    await this.prisma.$transaction(async (tx) => {
      if (!dto.categories?.length) throw new Error('No categories in payload');

      const maxCatOrder = await tx.menuCategory.aggregate({
        where: { restaurantId },
        _max: { order: true },
      });
      let nextCatOrder = (maxCatOrder._max.order ?? -1) + 1;

      for (const cat of dto.categories) {
        const catName = cat.name.trim();

        let category = await tx.menuCategory.findFirst({
          where: {
            restaurantId,
            name: { equals: catName, mode: 'insensitive' },
          },
        });

        const availabilityType = VALID_AVAILABILITY.has(cat.availabilityType as AvailabilityType)
          ? (cat.availabilityType as AvailabilityType)
          : AvailabilityType.ALWAYS;

        if (!category) {
          category = await tx.menuCategory.create({
            data: {
              restaurantId,
              name: catName,
              order: cat.order ?? nextCatOrder++,
              availabilityType,
              daysOfWeek: [],
            },
          });
          stats.categories++;
        } else {
          await tx.menuCategory.update({
            where: { id: category.id },
            data: { availabilityType },
          });
        }

        const maxItemOrder = await tx.menuItem.aggregate({
          where: { categoryId: category.id },
          _max: { order: true },
        });
        let nextItemOrder = (maxItemOrder._max.order ?? -1) + 1;

        for (const item of cat.items) {
          const itemName = item.name.trim();
          const currency: Currency = item.currency === 'BGN' ? Currency.BGN : Currency.EUR;

          const itemData = {
            name: itemName,
            description: item.description || null,
            price: item.price ?? 0,
            weight: item.weight || null,
            currency,
            allergens: item.allergens ?? [],
            dietaryTags: item.dietaryTags ?? [],
          };

          const existing = await tx.menuItem.findFirst({
            where: {
              categoryId: category.id,
              name: { equals: itemName, mode: 'insensitive' },
            },
          });

          let menuItemId: string;
          if (existing) {
            await tx.menuItem.update({ where: { id: existing.id }, data: itemData });
            menuItemId = existing.id;
            stats.updated++;
          } else {
            const created = await tx.menuItem.create({
              data: { ...itemData, categoryId: category.id, order: item.order ?? nextItemOrder++ },
            });
            menuItemId = created.id;
            stats.created++;
          }

          // Wipe and rebuild options — cleaner than diffing
          await tx.menuOption.deleteMany({ where: { menuItemId } });

          for (const opt of item.options ?? []) {
            if (!opt.choices?.length) continue;
            const choices = opt.choices.map((c) => ({
              name: c.name,
              priceModifier: c.price ?? 0,
              ...(c.weight ? { weight: c.weight } : {}),
            }));
            const optType =
              opt.type === 'ADDON' ? OptionType.ADDON : OptionType.VARIATION;
            await tx.menuOption.create({
              data: {
                menuItemId,
                name: opt.name || 'Size / Variant',
                type: optType,
                choices,
              },
            });
          }
        }
      }
    });

    return { success: true, ...stats };
  }

  async getOrCreateApiKey(restaurantId: string, userId: string) {
    await this.checkOwnership(restaurantId, userId);
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { importApiKey: true },
    });
    if (restaurant?.importApiKey) {
      return { apiKey: this.maskKey(restaurant.importApiKey) };
    }
    const key = this.generateKey();
    await this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: { importApiKey: key },
    });
    return { apiKey: this.maskKey(key), generated: true };
  }

  async revealApiKey(restaurantId: string, userId: string) {
    await this.checkOwnership(restaurantId, userId);
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { importApiKey: true },
    });
    if (!restaurant?.importApiKey) {
      const key = this.generateKey();
      await this.prisma.restaurant.update({
        where: { id: restaurantId },
        data: { importApiKey: key },
      });
      return { apiKey: key };
    }
    return { apiKey: restaurant.importApiKey };
  }

  async regenerateApiKey(restaurantId: string, userId: string) {
    await this.checkOwnership(restaurantId, userId);
    const key = this.generateKey();
    await this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: { importApiKey: key },
    });
    return { apiKey: key };
  }

  private generateKey(): string {
    return 'ocrk_' + randomBytes(24).toString('hex');
  }

  private maskKey(key: string): string {
    if (key.length <= 8) return '••••••••';
    return key.slice(0, 8) + '••••••••••••' + key.slice(-4);
  }
}
