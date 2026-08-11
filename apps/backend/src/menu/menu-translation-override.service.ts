import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MenuCrudService } from './menu-crud.service';
import { computeSourceHash } from './menu-translation-hash.util';

export interface LocaleOverride {
  locale: string;
  value: string | null;
  status: string;
  /** The item's source text changed after this override was written. */
  sourceChanged: boolean;
}

export interface ItemTranslations {
  itemId: string;
  sourceLang: string;
  sourceText: string;
  locales: LocaleOverride[];
}

/**
 * Owner-facing read/write for a single menu item's name translations.
 *
 * Kept out of menu-crud.service.ts because this is a self-contained concern:
 * it reads the same MenuItem.translations JSON the public menu renders, and
 * writes the MANUAL status that protects owner-authored wording.
 */
@Injectable()
export class MenuTranslationOverrideService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crud: MenuCrudService,
  ) {}

  private async loadItem(itemId: string, userId: string) {
    const item = await this.prisma.menuItem.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        name: true,
        translations: true,
        category: {
          select: {
            restaurantId: true,
            restaurant: {
              select: { menuSourceLanguage: true, targetLanguages: true },
            },
          },
        },
      },
    });

    if (!item) {
      throw new NotFoundException(`Menu item with ID "${itemId}" not found`);
    }

    await this.crud.verifyRestaurantOwnership(
      item.category.restaurantId,
      userId,
    );
    return item;
  }

  /**
   * Target locales, normalized with the source language removed. This mirrors
   * the enqueue path's locale rules.
   */
  private editableLocales(item: {
    category: {
      restaurant: {
        menuSourceLanguage: string | null;
        targetLanguages: string[];
      };
    };
  }): { sourceLang: string; locales: string[] } {
    const sourceLang = (item.category.restaurant.menuSourceLanguage ?? 'bg')
      .trim()
      .toLowerCase();
    const locales = [
      ...new Set(
        (item.category.restaurant.targetLanguages ?? [])
          .map((locale) => locale.trim().toLowerCase())
          .filter((locale) => locale && locale !== sourceLang),
      ),
    ];

    return { sourceLang, locales };
  }

  async getForItem(itemId: string, userId: string): Promise<ItemTranslations> {
    const item = await this.loadItem(itemId, userId);
    const { sourceLang, locales } = this.editableLocales(item);

    const states = await this.prisma.menuTranslationState.findMany({
      where: {
        entityType: 'ITEM',
        entityId: itemId,
        field: 'NAME',
        locale: { in: locales },
      },
      select: { locale: true, status: true, sourceHash: true },
    });
    const byLocale = new Map(states.map((state) => [state.locale, state]));
    const currentHash = computeSourceHash(item.name);
    const translations = (item.translations ?? {}) as Record<
      string,
      { name?: string } | undefined
    >;

    return {
      itemId: item.id,
      sourceLang,
      sourceText: item.name,
      locales: locales.map((locale) => {
        const state = byLocale.get(locale);
        const value = translations[locale]?.name ?? null;

        return {
          locale,
          value: typeof value === 'string' ? value : null,
          status: state?.status ?? 'CURRENT',
          sourceChanged:
            state?.status === 'MANUAL' && state.sourceHash !== currentHash,
        };
      }),
    };
  }

  /**
   * Write or clear one owner-authored locale value. The JSON mutation and the
   * queue-state transition commit together so a partial failure cannot leave
   * an unprotected manual value or a MANUAL row without its value.
   */
  async setOverride(
    itemId: string,
    locale: string,
    value: string | null,
    userId: string,
  ): Promise<ItemTranslations> {
    const item = await this.loadItem(itemId, userId);
    const { sourceLang, locales } = this.editableLocales(item);
    const normalized = locale.trim().toLowerCase();

    if (!locales.includes(normalized)) {
      throw new BadRequestException(
        `"${locale}" is not a configured target language for this restaurant.`,
      );
    }

    const trimmed = value?.trim() || null;
    const hash = computeSourceHash(item.name);
    const status = trimmed ? 'MANUAL' : 'STALE';

    await this.prisma.$transaction(async (tx) => {
      if (trimmed) {
        await tx.$executeRaw`
          UPDATE "menu_item"
          SET translations = jsonb_set(
            COALESCE(translations, '{}'::jsonb),
            ARRAY[${normalized}],
            COALESCE(
              CASE
                WHEN jsonb_typeof(translations -> ${normalized}) = 'object'
                  THEN translations -> ${normalized}
              END,
              '{}'::jsonb
            ) || jsonb_build_object('name', ${trimmed}::text),
            true
          )
          WHERE id = ${itemId}`;
      } else {
        await tx.$executeRaw`
          UPDATE "menu_item"
          SET translations = COALESCE(translations, '{}'::jsonb)
            #- ARRAY[${normalized}, 'name']
          WHERE id = ${itemId}`;
      }

      await tx.$executeRaw`
        INSERT INTO "menu_translation_state" (
          "id", "restaurantId", "entityType", "entityId", "field", "locale",
          "sourceLang", "sourceHash", "status", "reviewedAt", "createdAt", "updatedAt"
        )
        VALUES (
          ${randomUUID()}, ${item.category.restaurantId}, 'ITEM'::"MenuTranslationEntity",
          ${itemId}, 'NAME'::"MenuTranslationField", ${normalized},
          ${sourceLang}, ${hash}, ${status}::"MenuTranslationStatus", now(), now(), now()
        )
        ON CONFLICT ("entityType", "entityId", "field", "locale") DO UPDATE SET
          "status" = ${status}::"MenuTranslationStatus",
          "sourceHash" = ${hash},
          "sourceLang" = ${sourceLang},
          "runId" = NULL,
          "failureCount" = 0,
          "nextAttemptAt" = NULL,
          "lastError" = NULL,
          "reviewedAt" = now(),
          "updatedAt" = now()`;
    });

    return this.getForItem(itemId, userId);
  }
}
