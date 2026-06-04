import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ImportMenuDto } from './dto/import-menu.dto';
import { randomBytes, createHash } from 'crypto';
import { AvailabilityType, Currency, OptionType } from '@prisma/client';

const VALID_AVAILABILITY = new Set(Object.values(AvailabilityType));

@Injectable()
export class MenuImportService {
  private readonly logger = new Logger(MenuImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

  async checkOwnership(restaurantId: string, userId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true, ownerId: true },
    });
    if (!restaurant) throw new NotFoundException('Restaurant not found');
    if (restaurant.ownerId !== userId)
      throw new ForbiddenException('Access denied');
    return restaurant;
  }

  async upsertMenu(restaurantId: string, dto: ImportMenuDto) {
    const stats = { created: 0, updated: 0, categories: 0 };

    if (!dto.categories?.length)
      throw new BadRequestException('No categories in payload');

    // --- Preload all existing data BEFORE the transaction to avoid N+1 ---
    const existingCategories = await this.prisma.menuCategory.findMany({
      where: { restaurantId },
      select: {
        id: true,
        name: true,
        order: true,
        imageUrl: true,
        thumbnailUrl: true,
        items: {
          select: {
            id: true,
            name: true,
            order: true,
            imageUrl: true,
            thumbnailUrl: true,
          },
        },
      },
    });

    const catMap = new Map<
      string,
      (typeof existingCategories)[0]
    >();
    for (const ec of existingCategories) {
      catMap.set(ec.name.toLowerCase(), ec);
    }

    const maxCatOrder =
      existingCategories.length > 0
        ? Math.max(...existingCategories.map((c) => c.order))
        : -1;
    let nextCatOrder = maxCatOrder + 1;

    try {
      await this.prisma.$transaction(
        async (tx) => {
          for (const cat of dto.categories) {
            const catName = cat.name.trim();

            const existingCat = catMap.get(catName.toLowerCase());

            const availabilityType = VALID_AVAILABILITY.has(
              cat.availabilityType as AvailabilityType,
            )
              ? (cat.availabilityType as AvailabilityType)
              : AvailabilityType.ALWAYS;

            let categoryId: string;

            if (!existingCat) {
              const created = await tx.menuCategory.create({
                data: {
                  restaurantId,
                  name: catName,
                  order: cat.order ?? nextCatOrder++,
                  availabilityType,
                  daysOfWeek: [],
                  ...(cat.translations
                    ? { translations: cat.translations }
                    : {}),
                  ...(cat.imageUrl !== undefined
                    ? { imageUrl: cat.imageUrl }
                    : {}),
                  ...(cat.thumbnailUrl !== undefined
                    ? { thumbnailUrl: cat.thumbnailUrl }
                    : {}),
                },
              });
              categoryId = created.id;
              stats.categories++;
            } else {
              // Delete old R2 objects if images are being replaced
              if (
                existingCat.imageUrl &&
                cat.imageUrl !== undefined &&
                existingCat.imageUrl !== cat.imageUrl
              ) {
                await this.storageService
                  .delete(existingCat.imageUrl)
                  .catch(() => {});
              }
              if (
                existingCat.thumbnailUrl &&
                cat.thumbnailUrl !== undefined &&
                existingCat.thumbnailUrl !== cat.thumbnailUrl
              ) {
                await this.storageService
                  .delete(existingCat.thumbnailUrl)
                  .catch(() => {});
              }

              await tx.menuCategory.update({
                where: { id: existingCat.id },
                data: {
                  availabilityType,
                  ...(cat.translations
                    ? { translations: cat.translations }
                    : {}),
                  ...(cat.imageUrl !== undefined
                    ? { imageUrl: cat.imageUrl }
                    : {}),
                  ...(cat.thumbnailUrl !== undefined
                    ? { thumbnailUrl: cat.thumbnailUrl }
                    : {}),
                },
              });
              categoryId = existingCat.id;
            }

            // Build item lookup map from preloaded data
            const itemMap = new Map<
              string,
              { id: string; imageUrl: string | null; thumbnailUrl: string | null }
            >();
            if (existingCat) {
              for (const ei of existingCat.items) {
                itemMap.set(ei.name.toLowerCase(), ei);
              }
            }

            const nextItemOrderBase = existingCat
              ? Math.max(-1, ...existingCat.items.map((i) => i.order)) + 1
              : 0;
            let nextItemOrder = nextItemOrderBase;

            for (const item of cat.items) {
              const itemName = item.name.trim();
              const currency: Currency =
                item.currency === 'BGN' ? Currency.BGN : Currency.EUR;

              const itemData = {
                name: itemName,
                description: item.description || null,
                price: item.price ?? 0,
                weight: item.weight || null,
                currency,
                allergens: item.allergens ?? [],
                dietaryTags: item.dietaryTags ?? [],
                ...(item.translations
                  ? { translations: item.translations }
                  : {}),
                ...(item.imageUrl !== undefined
                  ? { imageUrl: item.imageUrl }
                  : {}),
                ...(item.thumbnailUrl !== undefined
                  ? { thumbnailUrl: item.thumbnailUrl }
                  : {}),
              };

              const existing = itemMap.get(itemName.toLowerCase());

              let menuItemId: string;
              if (existing) {
                // Delete old R2 objects if images are being replaced
                if (
                  existing.imageUrl &&
                  item.imageUrl !== undefined &&
                  existing.imageUrl !== item.imageUrl
                ) {
                  await this.storageService
                    .delete(existing.imageUrl)
                    .catch(() => {});
                }
                if (
                  existing.thumbnailUrl &&
                  item.thumbnailUrl !== undefined &&
                  existing.thumbnailUrl !== item.thumbnailUrl
                ) {
                  await this.storageService
                    .delete(existing.thumbnailUrl)
                    .catch(() => {});
                }

                await tx.menuItem.update({
                  where: { id: existing.id },
                  data: itemData,
                });
                menuItemId = existing.id;
                stats.updated++;
              } else {
                const created = await tx.menuItem.create({
                  data: {
                    ...itemData,
                    categoryId,
                    order: item.order ?? nextItemOrder++,
                  },
                });
                menuItemId = created.id;
                stats.created++;
              }

              // Wipe and rebuild options — cleaner than diffing
              await tx.menuOption.deleteMany({ where: { menuItemId } });

              for (const opt of item.options ?? []) {
                if (!opt.choices?.length) continue;
                const choices = opt.choices.map((c: any) => ({
                  name: c.name,
                  priceModifier: c.price ?? 0,
                  ...(c.weight ? { weight: c.weight } : {}),
                }));
                const optType =
                  opt.type === 'ADDON'
                    ? OptionType.ADDON
                    : OptionType.VARIATION;
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
        },
        { timeout: 60000 },
      );
    } catch (err) {
      this.logger.error(
        'upsertMenu failed',
        err instanceof Error ? err.stack : String(err),
      );
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
          ...(item.dietaryTags?.length
            ? { dietaryTags: item.dietaryTags }
            : {}),
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
