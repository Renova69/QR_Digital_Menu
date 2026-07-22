import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { FeatureService } from '../subscription/feature.service';
import { FeatureFlag } from '../subscription/feature-flag.enum';
import { ImportMenuDto } from './dto/import-menu.dto';
import { randomBytes, createHash } from 'crypto';
import {
  AvailabilityType,
  Currency,
  OptionType,
  Prisma,
  RewardPointsMode,
} from '@prisma/client';
import { withKeyLock } from '../common/key-mutex';

const VALID_AVAILABILITY = new Set(Object.values(AvailabilityType));
const MAX_IMPORT_TOTAL_ITEMS = 1_000;
const MAX_IMPORT_TOTAL_OPTIONS = 2_000;
const MAX_IMPORT_TOTAL_CHOICES = 5_000;
// BNB fixed rate; Bulgaria adopted the euro 2026-01-01. EUR is the only
// transactional currency (F-FE-1/F-FE-3) — an imported BGN price is
// normalized to EUR here rather than stored as authoritative BGN.
const BGN_TO_EUR_RATE = 1.95583;
const VALID_IMPORT_CURRENCIES = new Set(['EUR', 'BGN']);

type ImageRefExclusions = {
  excludeItemIds?: string[];
  excludeCategoryIds?: string[];
};
type ImageCleanupTask = () => Promise<void>;

@Injectable()
export class MenuImportService {
  private readonly logger = new Logger(MenuImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly featureService: FeatureService,
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

  async upsertMenu(
    restaurantId: string,
    dto: ImportMenuDto,
    txClient?: Prisma.TransactionClient,
    postCommitCleanup?: ImageCleanupTask[],
  ) {
    const stats = { created: 0, updated: 0, categories: 0 };
    const db = txClient ?? this.prisma;
    const pendingImageDeletes: Array<{
      url: string;
      exclude: ImageRefExclusions;
    }> = [];

    if (!dto.categories?.length)
      throw new BadRequestException('No categories in payload');
    this.assertImportSize(dto);

    // L3.1 — Detect duplicate names in the payload early. Case-insensitive
    // matching mirrors the upsert logic; two same-name cats/items in one payload
    // would silently drop one (last-wins). Fail fast with a clear message instead.
    const catKeys = dto.categories.map((c) => c.name.toLowerCase().trim());
    const dupCat = catKeys.find((k, i) => catKeys.indexOf(k) !== i);
    if (dupCat) {
      throw new BadRequestException(
        `Duplicate category name in payload: "${dupCat}"`,
      );
    }
    for (const cat of dto.categories) {
      const itemKeys = cat.items.map((item) => item.name.toLowerCase().trim());
      const dupItem = itemKeys.find((k, i) => itemKeys.indexOf(k) !== i);
      if (dupItem) {
        throw new BadRequestException(
          `Duplicate item name "${dupItem}" in category "${cat.name}"`,
        );
      }
    }
    // --- Preload all existing data BEFORE the transaction to avoid N+1 ---
    const existingCategories = await db.menuCategory.findMany({
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
            options: { select: { name: true, translations: true } },
          },
        },
      },
    });

    const catMap = new Map<string, (typeof existingCategories)[0]>();
    for (const ec of existingCategories) {
      catMap.set(ec.name.toLowerCase(), ec);
    }

    const maxCatOrder =
      existingCategories.length > 0
        ? Math.max(...existingCategories.map((c) => c.order))
        : -1;
    let nextCatOrder = maxCatOrder + 1;

    const restaurant = await db.restaurant.findUnique({
      where: { id: restaurantId },
      select: { tier: true, forceTier: true },
    });
    const daypartingEnabled = this.featureService.restaurantHasFeature(
      restaurant,
      FeatureFlag.DAYPARTING,
    );

    const writeMenu = async (tx: Prisma.TransactionClient) => {
      for (const cat of dto.categories) {
        const catName = cat.name.trim();

        const existingCat = catMap.get(catName.toLowerCase());

        const rawAvailability = VALID_AVAILABILITY.has(
          cat.availabilityType as AvailabilityType,
        )
          ? (cat.availabilityType as AvailabilityType)
          : AvailabilityType.ALWAYS;
        // Strip SCHEDULED if the tier doesn't support DAYPARTING (mirrors CRUD behavior)
        const availabilityType =
          !daypartingEnabled && rawAvailability === AvailabilityType.SCHEDULED
            ? AvailabilityType.ALWAYS
            : rawAvailability;

        let categoryId: string;

        // ── Shared category data (new + existing) ────────────────
        const catData = {
          availabilityType,
          ...(cat.translations ? { translations: cat.translations } : {}),
          ...(cat.imageUrl !== undefined ? { imageUrl: cat.imageUrl } : {}),
          ...(cat.thumbnailUrl !== undefined
            ? { thumbnailUrl: cat.thumbnailUrl }
            : {}),
          ...(cat.startTime !== undefined ? { startTime: cat.startTime } : {}),
          ...(cat.endTime !== undefined ? { endTime: cat.endTime } : {}),
          ...(cat.daysOfWeek !== undefined
            ? { daysOfWeek: cat.daysOfWeek }
            : {}),
          ...(cat.isDrinkCategory !== undefined
            ? { isDrinkCategory: cat.isDrinkCategory }
            : {}),
        };

        if (!existingCat) {
          const created = await tx.menuCategory.create({
            data: {
              restaurantId,
              name: catName,
              order: cat.order ?? nextCatOrder++,
              daysOfWeek: [],
              ...catData,
            },
          });
          categoryId = created.id;
          stats.categories++;
        } else {
          if (
            existingCat.imageUrl &&
            cat.imageUrl !== undefined &&
            existingCat.imageUrl !== cat.imageUrl
          ) {
            pendingImageDeletes.push({
              url: existingCat.imageUrl,
              exclude: { excludeCategoryIds: [existingCat.id] },
            });
          }
          if (
            existingCat.thumbnailUrl &&
            cat.thumbnailUrl !== undefined &&
            existingCat.thumbnailUrl !== cat.thumbnailUrl
          ) {
            pendingImageDeletes.push({
              url: existingCat.thumbnailUrl,
              exclude: { excludeCategoryIds: [existingCat.id] },
            });
          }

          await tx.menuCategory.update({
            where: { id: existingCat.id },
            data: catData,
          });
          categoryId = existingCat.id;
        }

        // Build item lookup map from preloaded data
        const itemMap = new Map<
          string,
          {
            id: string;
            imageUrl: string | null;
            thumbnailUrl: string | null;
            options: Array<{ name: string; translations: unknown }>;
          }
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
          // Reject unrecognized currencies instead of silently treating them
          // as EUR — an import with e.g. "USD" must not be misread as EUR.
          const normalizedCurrency = item.currency?.toUpperCase();
          if (
            normalizedCurrency !== undefined &&
            !VALID_IMPORT_CURRENCIES.has(normalizedCurrency)
          ) {
            throw new BadRequestException(
              `Unsupported currency "${item.currency}" for item "${itemName}" — only EUR and BGN are accepted.`,
            );
          }
          // F-FE-1/F-FE-3: normalize a BGN-tagged import to EUR at write
          // time — cart/order totals downstream treat every stored price as
          // EUR, so an authoritative BGN row would silently under/over-charge.
          const isImportedBgn = normalizedCurrency === 'BGN';
          const price = isImportedBgn
            ? Math.round(((item.price ?? 0) / BGN_TO_EUR_RATE) * 100) / 100
            : (item.price ?? 0);
          const costPrice = isImportedBgn
            ? Math.round(((item.costPrice ?? 0) / BGN_TO_EUR_RATE) * 100) / 100
            : (item.costPrice ?? 0);
          const rewardPointsMode =
            item.rewardPointsMode ??
            (item.rewardPointsPrice !== undefined
              ? RewardPointsMode.CUSTOM
              : undefined);
          if (
            rewardPointsMode === RewardPointsMode.CUSTOM &&
            (!Number.isInteger(item.rewardPointsPrice) ||
              (item.rewardPointsPrice ?? 0) < 1)
          ) {
            throw new BadRequestException(
              `Custom loyalty reward "${itemName}" requires a positive points price.`,
            );
          }

          const itemData = {
            name: itemName,
            description: item.description || null,
            price,
            costPrice,
            weight: item.weight || null,
            currency: Currency.EUR,
            allergens: item.allergens ?? [],
            dietaryTags: item.dietaryTags ?? [],
            tags: item.tags ?? [],
            upsellContexts: item.upsellContexts ?? [],
            ...(item.translations ? { translations: item.translations } : {}),
            ...(item.imageUrl !== undefined ? { imageUrl: item.imageUrl } : {}),
            ...(item.thumbnailUrl !== undefined
              ? { thumbnailUrl: item.thumbnailUrl }
              : {}),
            ...(item.isOutOfStock !== undefined
              ? { isOutOfStock: item.isOutOfStock }
              : {}),
            ...(item.isFeatured !== undefined
              ? { isFeatured: item.isFeatured }
              : {}),
            ...(item.rewardPointsPrice !== undefined
              ? { rewardPointsPrice: item.rewardPointsPrice }
              : {}),
            ...(rewardPointsMode !== undefined ? { rewardPointsMode } : {}),
          };

          const existing = itemMap.get(itemName.toLowerCase());

          let menuItemId: string;
          if (existing) {
            if (
              existing.imageUrl &&
              item.imageUrl !== undefined &&
              existing.imageUrl !== item.imageUrl
            ) {
              pendingImageDeletes.push({
                url: existing.imageUrl,
                exclude: { excludeItemIds: [existing.id] },
              });
            }
            if (
              existing.thumbnailUrl &&
              item.thumbnailUrl !== undefined &&
              existing.thumbnailUrl !== item.thumbnailUrl
            ) {
              pendingImageDeletes.push({
                url: existing.thumbnailUrl,
                exclude: { excludeItemIds: [existing.id] },
              });
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

          // Rebuild options; preserve existing translations when payload has none.
          const existingOptMap = new Map<string, { translations: unknown }>();
          for (const eo of existing?.options ?? []) {
            existingOptMap.set(eo.name.toLowerCase(), eo);
          }

          await tx.menuOption.deleteMany({ where: { menuItemId } });

          for (const opt of item.options ?? []) {
            if (!opt.choices?.length) continue;
            // F-FE-1/F-FE-3: choice price deltas are stored on the option,
            // not the item — the parent item's isImportedBgn conversion
            // above doesn't touch these, so they need the same normalization
            // or a BGN "+2" upcharge gets reinterpreted as "+2 EUR" downstream.
            const choices = opt.choices.map((c: any) => ({
              name: c.name,
              priceModifier: isImportedBgn
                ? Math.round(
                    ((c.priceModifier ?? c.price ?? 0) / BGN_TO_EUR_RATE) * 100,
                  ) / 100
                : (c.priceModifier ?? c.price ?? 0),
              ...(c.weight ? { weight: c.weight } : {}),
            }));
            const optType =
              opt.type === 'ADDON' ? OptionType.ADDON : OptionType.VARIATION;
            const optName = opt.name || 'Size / Variant';
            const existingOpt = existingOptMap.get(optName.toLowerCase());
            const translations = existingOpt?.translations ?? undefined;
            await tx.menuOption.create({
              data: {
                menuItemId,
                name: optName,
                type: optType,
                choices,
                ...(translations ? { translations } : {}),
              },
            });
          }
        }
      }
    };

    try {
      if (txClient) {
        await writeMenu(txClient);
      } else {
        await this.prisma.$transaction((tx) => writeMenu(tx), {
          timeout: 60000,
        });
      }
    } catch (err) {
      this.logger.error(
        'upsertMenu failed',
        err instanceof Error ? err.stack : String(err),
      );
      throw err;
    }

    const cleanupImages = async () => {
      await Promise.all(
        pendingImageDeletes.map(({ url, exclude }) =>
          this.deleteImageIfUnreferenced(url, exclude),
        ),
      );
    };

    if (postCommitCleanup) {
      postCommitCleanup.push(cleanupImages);
    } else {
      await cleanupImages();
    }

    return { success: true, ...stats };
  }

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

  /** Runs under a per-URL lock (shared process-wide, see key-mutex.ts) so a
   *  concurrent delete of the same URL from menu-crud.service.ts or another
   *  import can't race this reference-check against a stale count. */
  private async deleteImageIfUnreferenced(
    url: string,
    exclude: ImageRefExclusions = {},
  ): Promise<void> {
    await withKeyLock(url, async () => {
      try {
        if (await this.isImageReferencedElsewhere(url, exclude)) {
          this.logger.log(`Kept shared image (still referenced): ${url}`);
          return;
        }
        await this.storageService.deleteExact(url);
      } catch (error) {
        this.logger.warn(`Skipped image cleanup for ${url}: ${error}`);
      }
    });
  }

  private assertImportSize(dto: ImportMenuDto) {
    let totalItems = 0;
    let totalOptions = 0;
    let totalChoices = 0;

    for (const category of dto.categories ?? []) {
      totalItems += category.items?.length ?? 0;
      for (const item of category.items ?? []) {
        totalOptions += item.options?.length ?? 0;
        for (const option of item.options ?? []) {
          totalChoices += option.choices?.length ?? 0;
        }
      }
    }

    if (totalItems > MAX_IMPORT_TOTAL_ITEMS) {
      throw new BadRequestException(
        `Menu import is too large: ${totalItems} items exceeds the ${MAX_IMPORT_TOTAL_ITEMS} item limit`,
      );
    }
    if (totalOptions > MAX_IMPORT_TOTAL_OPTIONS) {
      throw new BadRequestException(
        `Menu import is too large: ${totalOptions} options exceeds the ${MAX_IMPORT_TOTAL_OPTIONS} option limit`,
      );
    }
    if (totalChoices > MAX_IMPORT_TOTAL_CHOICES) {
      throw new BadRequestException(
        `Menu import is too large: ${totalChoices} choices exceeds the ${MAX_IMPORT_TOTAL_CHOICES} choice limit`,
      );
    }
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
        ...(cat.startTime ? { startTime: cat.startTime } : {}),
        ...(cat.endTime ? { endTime: cat.endTime } : {}),
        ...(cat.daysOfWeek?.length ? { daysOfWeek: cat.daysOfWeek } : {}),
        ...(cat.isDrinkCategory ? { isDrinkCategory: true } : {}),
        items: cat.items.map((item) => ({
          name: item.name,
          ...(item.description ? { description: item.description } : {}),
          price: item.price,
          ...(item.costPrice ? { costPrice: item.costPrice } : {}),
          currency: item.currency,
          ...(item.weight ? { weight: item.weight } : {}),
          ...(item.allergens?.length ? { allergens: item.allergens } : {}),
          ...(item.dietaryTags?.length
            ? { dietaryTags: item.dietaryTags }
            : {}),
          ...(item.tags?.length ? { tags: item.tags } : {}),
          ...(item.upsellContexts?.length
            ? { upsellContexts: item.upsellContexts }
            : {}),
          order: item.order,
          ...(item.imageUrl ? { imageUrl: item.imageUrl } : {}),
          ...(item.thumbnailUrl ? { thumbnailUrl: item.thumbnailUrl } : {}),
          ...(item.translations ? { translations: item.translations } : {}),
          ...(item.isOutOfStock ? { isOutOfStock: true } : {}),
          ...(item.isFeatured ? { isFeatured: true } : {}),
          ...(item.rewardPointsMode
            ? { rewardPointsMode: item.rewardPointsMode }
            : {}),
          ...(item.rewardPointsPrice
            ? { rewardPointsPrice: item.rewardPointsPrice }
            : {}),
          ...(item.options?.length
            ? {
                options: item.options.map((opt) => ({
                  name: opt.name,
                  type: opt.type,
                  choices: ((opt.choices as any[]) ?? []).map((c: any) => ({
                    name: c.name,
                    priceModifier: c.priceModifier ?? 0,
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
