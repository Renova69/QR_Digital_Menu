import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { computeSourceHash } from './menu-translation-hash.util';
import { restaurantManagementWhere } from '../auth/restaurant-management-scope';

export interface OverrideValue {
  value: string | null;
  status: string;
  /** The item's source text changed after this override was written. */
  sourceChanged: boolean;
}

export type OverrideField = 'NAME' | 'DESCRIPTION';

export interface LocaleOverride {
  locale: string;
  name: OverrideValue;
  description: OverrideValue;
}

export interface ItemTranslations {
  itemId: string;
  sourceLang: string;
  source: {
    name: string;
    description: string;
  };
  locales: LocaleOverride[];
}

/**
 * Owner-facing read/write for a single menu item's name and description
 * translations.
 *
 * Kept out of menu-crud.service.ts because this is a self-contained concern:
 * it reads the same MenuItem.translations JSON the public menu renders, and
 * writes the MANUAL status that protects owner-authored wording.
 */
@Injectable()
export class MenuTranslationOverrideService {
  constructor(private readonly prisma: PrismaService) {}

  private async loadItem(itemId: string, userId: string) {
    const item = await this.prisma.menuItem.findFirst({
      where: {
        id: itemId,
        category: {
          restaurant: {
            ...restaurantManagementWhere(userId),
            isActive: true,
            deletedAt: null,
          },
        },
      },
      select: {
        id: true,
        name: true,
        description: true,
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
        field: { in: ['NAME', 'DESCRIPTION'] },
        locale: { in: locales },
      },
      select: { field: true, locale: true, status: true, sourceHash: true },
    });
    const byFieldAndLocale = new Map(
      states.map((state) => [`${state.field}:${state.locale}`, state]),
    );
    const source = {
      name: item.name,
      description: item.description ?? '',
    };
    const currentHashes = {
      NAME: computeSourceHash(source.name),
      DESCRIPTION: computeSourceHash(source.description),
    };
    const translations = (item.translations ?? {}) as Record<
      string,
      { name?: string; description?: string } | undefined
    >;

    const valueFor = (
      field: 'NAME' | 'DESCRIPTION',
      locale: string,
    ): OverrideValue => {
      const state = byFieldAndLocale.get(`${field}:${locale}`);
      const key = field === 'NAME' ? 'name' : 'description';
      const value = translations[locale]?.[key] ?? null;

      return {
        value: typeof value === 'string' ? value : null,
        status: state?.status ?? 'CURRENT',
        sourceChanged:
          state?.status === 'MANUAL' &&
          state.sourceHash !== currentHashes[field],
      };
    };

    return {
      itemId: item.id,
      sourceLang,
      source,
      locales: locales.map((locale) => ({
        locale,
        name: valueFor('NAME', locale),
        description: valueFor('DESCRIPTION', locale),
      })),
    };
  }

  /**
   * Write or clear one owner-authored locale value. The JSON mutation and the
   * queue-state transition commit together so a partial failure cannot leave
   * an unprotected manual value or a MANUAL row without its value.
   */
  async setOverride(
    itemId: string,
    field: OverrideField,
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
    const jsonKey = field === 'NAME' ? 'name' : 'description';
    const sourceText = field === 'NAME' ? item.name : (item.description ?? '');
    const hash = computeSourceHash(sourceText);
    const status = trimmed ? 'MANUAL' : 'STALE';

    await this.prisma.$transaction(async (tx) => {
      // Lock/update the queue state before the menu item. The worker takes
      // the same state-first lock order before writing provider output, so
      // whichever transaction wins leaves the owner's MANUAL value last.
      await tx.$executeRaw`
        INSERT INTO "menu_translation_state" (
          "id", "restaurantId", "entityType", "entityId", "field", "locale",
          "sourceLang", "sourceHash", "status", "reviewedAt", "createdAt", "updatedAt"
        )
        VALUES (
          ${randomUUID()}, ${item.category.restaurantId}, 'ITEM'::"MenuTranslationEntity",
          ${itemId}, ${field}::"MenuTranslationField", ${normalized},
          ${sourceLang}, ${hash}, ${status}::"MenuTranslationStatus", now(), now(), now()
        )
        ON CONFLICT ("entityType", "entityId", "field", "locale") DO UPDATE SET
          "status" = ${status}::"MenuTranslationStatus",
          "sourceHash" = ${hash},
          "sourceLang" = ${sourceLang},
          "runId" = NULL,
          "claimedAt" = NULL,
          "failureCount" = 0,
          "nextAttemptAt" = NULL,
          "lastError" = NULL,
          "reviewedAt" = now(),
          "updatedAt" = now()`;

      const updated = trimmed
        ? await tx.$executeRaw`
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
            ) || jsonb_build_object(${jsonKey}::text, ${trimmed}::text),
            true
          )
          WHERE id = ${itemId}
            AND EXISTS (
              SELECT 1
              FROM "menu_category" AS category
              WHERE category.id = "menu_item"."categoryId"
                AND category."restaurantId" = ${item.category.restaurantId}
            )`
        : await tx.$executeRaw`
          UPDATE "menu_item"
          SET translations = COALESCE(translations, '{}'::jsonb)
            #- ARRAY[${normalized}, ${jsonKey}]
          WHERE id = ${itemId}
            AND EXISTS (
              SELECT 1
              FROM "menu_category" AS category
              WHERE category.id = "menu_item"."categoryId"
                AND category."restaurantId" = ${item.category.restaurantId}
            )`;
      if (updated !== 1) {
        throw new NotFoundException(`Menu item with ID "${itemId}" not found`);
      }
    });

    return this.getForItem(itemId, userId);
  }
}
