import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ImportMenuDto } from './dto/import-menu.dto';
import { randomBytes, createHash } from 'crypto';
import { AvailabilityType, Currency, OptionType } from '@prisma/client';

const VALID_AVAILABILITY = new Set(Object.values(AvailabilityType));

@Injectable()
export class MenuImportService {
  private readonly logger = new Logger(MenuImportService.name);

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

    try {
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
              ...(cat.translations ? { translations: cat.translations } : {}),
              ...(cat.imageUrl !== undefined ? { imageUrl: cat.imageUrl } : {}),
              ...(cat.thumbnailUrl !== undefined ? { thumbnailUrl: cat.thumbnailUrl } : {}),
            },
          });
          stats.categories++;
        } else {
          await tx.menuCategory.update({
            where: { id: category.id },
            data: {
              availabilityType,
              ...(cat.translations ? { translations: cat.translations } : {}),
              ...(cat.imageUrl !== undefined ? { imageUrl: cat.imageUrl } : {}),
              ...(cat.thumbnailUrl !== undefined ? { thumbnailUrl: cat.thumbnailUrl } : {}),
            },
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
            ...(item.translations ? { translations: item.translations } : {}),
            ...(item.imageUrl !== undefined ? { imageUrl: item.imageUrl } : {}),
            ...(item.thumbnailUrl !== undefined ? { thumbnailUrl: item.thumbnailUrl } : {}),
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
    }, { timeout: 60000 });
    } catch (err) {
      this.logger.error('upsertMenu failed', err instanceof Error ? err.stack : String(err));
      throw err;
    }

    return { success: true, ...stats };
  }

  async exportMenu(restaurantId: string, userId: string) {
    await this.checkOwnership(restaurantId, userId);

    const categories = await this.prisma.menuCategory.findMany({
      where: { restaurantId },
      orderBy: { order: 'asc' },
      include: {
        items: {
          orderBy: { order: 'asc' },
          include: { options: true },
        },
      },
    });

    return {
      restaurantId,
      categories: categories.map((cat) => ({
        name: cat.name,
        order: cat.order,
        availabilityType: cat.availabilityType,
        ...(cat.imageUrl ? { imageUrl: cat.imageUrl } : {}),
        ...(cat.thumbnailUrl ? { thumbnailUrl: cat.thumbnailUrl } : {}),
        ...(cat.translations ? { translations: cat.translations } : {}),
        items: cat.items.map((item) => ({
          name: item.name,
          ...(item.description ? { description: item.description } : {}),
          price: item.price,
          currency: item.currency,
          ...(item.weight ? { weight: item.weight } : {}),
          ...(item.allergens?.length ? { allergens: item.allergens } : {}),
          ...(item.dietaryTags?.length ? { dietaryTags: item.dietaryTags } : {}),
          order: item.order,
          ...(item.imageUrl ? { imageUrl: item.imageUrl } : {}),
          ...(item.thumbnailUrl ? { thumbnailUrl: item.thumbnailUrl } : {}),
          ...(item.translations ? { translations: item.translations } : {}),
          ...(item.options?.length
            ? {
                options: item.options.map((opt) => ({
                  name: opt.name,
                  type: opt.type,
                  choices: ((opt.choices as any[]) ?? []).map((c: any) => ({
                    name: c.name,
                    price: c.priceModifier ?? 0,
                    ...(c.weight ? { weight: c.weight } : {}),
                  })),
                })),
              }
            : {}),
        })),
      })),
    };
  }

  /**
   * Report whether an import key is configured. The plaintext key is only ever
   * shown once at create/regenerate (#10) — only its hash is stored, so an
   * existing key can never be re-displayed. If none exists yet, one is created
   * and returned in full this single time.
   */
  async getOrCreateApiKey(restaurantId: string, userId: string) {
    await this.checkOwnership(restaurantId, userId);
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { importApiKeyHash: true },
    });
    if (restaurant?.importApiKeyHash) {
      return { configured: true };
    }
    const key = this.generateKey();
    await this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: { importApiKeyHash: this.hashKey(key) },
    });
    return { apiKey: key, generated: true };
  }

  async regenerateApiKey(restaurantId: string, userId: string) {
    await this.checkOwnership(restaurantId, userId);
    const key = this.generateKey();
    await this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: { importApiKeyHash: this.hashKey(key) },
    });
    return { apiKey: key };
  }

  private generateKey(): string {
    return 'ocrk_' + randomBytes(24).toString('hex');
  }

  /** SHA-256 of the key. The key is 24 random bytes, so a fast hash is
   *  sufficient (no need for bcrypt) and lookups stay index-friendly. */
  hashKey(key: string): string {
    return createHash('sha256').update(key).digest('hex');
  }
}
