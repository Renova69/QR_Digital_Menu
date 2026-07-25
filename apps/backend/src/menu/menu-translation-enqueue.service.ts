import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { isPresetTagKey } from './menu-tags';
import {
  computeSourceHash,
  computeSetHash,
} from './menu-translation-hash.util';

type EntityType = 'CATEGORY' | 'ITEM' | 'OPTION';
type Field = 'NAME' | 'DESCRIPTION' | 'ALLERGENS' | 'DIETARY_TAGS' | 'CHOICES';

interface ItemLike {
  id: string;
  name: string;
  description?: string | null;
  allergens?: string[] | null;
  dietaryTags?: string[] | null;
}

interface OptionLike {
  id: string;
  name: string;
  choices?: Array<{ name: string }> | null;
}

interface UpsertSpec {
  restaurantId: string;
  entityType: EntityType;
  entityId: string;
  field: Field;
  locale: string;
  sourceLang: string;
  sourceHash: string;
}

/**
 * Writes work-queue entries into MenuTranslationState. This is the ONLY
 * thing owner-facing mutation paths (menu-crud.service.ts's create/update
 * handlers, restaurants.service.ts's translate-all and targetLanguages
 * diff) are allowed to touch — enqueuing is a cheap, synchronous DB upsert,
 * never a provider call. MenuTranslationWorkerService is the only consumer
 * of STALE rows.
 *
 * Idempotent by design: enqueuing the same (entity, field, locale) with
 * unchanged content is a near no-op (refreshes sourceHash, leaves a CURRENT
 * row CURRENT). Enqueuing with CHANGED content always resets to STALE,
 * which is what makes an edit-while-translating race safe — the worker's
 * translate step re-reads live content immediately before writing (see
 * MenuTranslationService.applyLazyTranslations' own Phase-1 diff), so a
 * completion write for stale content simply finds nothing left to do
 * rather than clobbering the newer edit.
 */
@Injectable()
export class MenuTranslationEnqueueService {
  private readonly logger = new Logger(MenuTranslationEnqueueService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async upsert(params: UpsertSpec): Promise<void> {
    try {
      await this.prisma.$executeRaw`
        INSERT INTO "menu_translation_state" (
          "id", "restaurantId", "entityType", "entityId", "field", "locale",
          "sourceLang", "sourceHash", "status", "createdAt", "updatedAt"
        )
        VALUES (
          ${randomUUID()}, ${params.restaurantId}, ${params.entityType}::"MenuTranslationEntity",
          ${params.entityId}, ${params.field}::"MenuTranslationField", ${params.locale},
          ${params.sourceLang}, ${params.sourceHash}, 'STALE'::"MenuTranslationStatus", now(), now()
        )
        ON CONFLICT ("entityType", "entityId", "field", "locale") DO UPDATE SET
          "sourceHash" = EXCLUDED."sourceHash",
          "sourceLang" = EXCLUDED."sourceLang",
          "status" = (CASE
            WHEN "menu_translation_state"."sourceHash" <> EXCLUDED."sourceHash" THEN 'STALE'
            WHEN "menu_translation_state"."status" = 'CURRENT' THEN 'CURRENT'
            ELSE 'STALE'
          END)::"MenuTranslationStatus",
          "nextAttemptAt" = NULL,
          "failureCount" = 0,
          "updatedAt" = now()
      `;
    } catch (err) {
      // Enqueue failures must never block the owner's save — the entity
      // write already succeeded by the time enqueue runs. Worst case, this
      // field is picked up on a later enqueue (e.g. the next edit) instead.
      this.logger.warn(
        `Failed to enqueue ${params.entityType}/${params.entityId}/${params.field}/${params.locale}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Sequential, not Promise.all — a single entity has at most a handful of
  // (field, locale) upserts, but enqueueTranslateAll fans this out across
  // every category/item/option in the restaurant concurrently. Unbounded
  // parallelism per-entity multiplies into thousands of simultaneous raw SQL
  // calls against PgBouncer's connection pool (17 by default) for any
  // realistically-sized multi-language menu, and most of them just time out
  // waiting for a connection (2026-07-25 production finding — a 157-item/
  // 12-language restaurant's enqueue silently dropped ~80% of its rows).
  // Each upsert is a cheap indexed UPSERT; doing them one at a time per
  // entity is fast enough, and it's enqueueTranslateAll's job (not this
  // service's) to bound cross-entity concurrency.
  private async upsertAll(specs: UpsertSpec[]): Promise<void> {
    for (const spec of specs) {
      await this.upsert(spec);
    }
  }

  async enqueueCategory(
    restaurantId: string,
    category: { id: string; name: string },
    locales: string[],
    sourceLang: string,
  ): Promise<void> {
    const hash = computeSourceHash(category.name);
    await this.upsertAll(
      locales.map((locale) => ({
        restaurantId,
        entityType: 'CATEGORY' as const,
        entityId: category.id,
        field: 'NAME' as const,
        locale,
        sourceLang,
        sourceHash: hash,
      })),
    );
  }

  async enqueueItem(
    restaurantId: string,
    item: ItemLike,
    locales: string[],
    sourceLang: string,
  ): Promise<void> {
    const nameHash = computeSourceHash(item.name);
    const specs: UpsertSpec[] = locales.map((locale) => ({
      restaurantId,
      entityType: 'ITEM' as const,
      entityId: item.id,
      field: 'NAME' as const,
      locale,
      sourceLang,
      sourceHash: nameHash,
    }));

    if (item.description && item.description.trim()) {
      const descHash = computeSourceHash(item.description);
      specs.push(
        ...locales.map((locale) => ({
          restaurantId,
          entityType: 'ITEM' as const,
          entityId: item.id,
          field: 'DESCRIPTION' as const,
          locale,
          sourceLang,
          sourceHash: descHash,
        })),
      );
    }

    // Preset allergen/dietary keys never translate (see menu-tags.ts) — only
    // enqueue when there's genuinely custom free-text content.
    const customAllergens = (item.allergens ?? []).filter(
      (a) => !isPresetTagKey(a),
    );
    if (customAllergens.length > 0) {
      const hash = computeSetHash(customAllergens);
      specs.push(
        ...locales.map((locale) => ({
          restaurantId,
          entityType: 'ITEM' as const,
          entityId: item.id,
          field: 'ALLERGENS' as const,
          locale,
          sourceLang,
          sourceHash: hash,
        })),
      );
    }

    const customTags = (item.dietaryTags ?? []).filter(
      (t) => !isPresetTagKey(t),
    );
    if (customTags.length > 0) {
      const hash = computeSetHash(customTags);
      specs.push(
        ...locales.map((locale) => ({
          restaurantId,
          entityType: 'ITEM' as const,
          entityId: item.id,
          field: 'DIETARY_TAGS' as const,
          locale,
          sourceLang,
          sourceHash: hash,
        })),
      );
    }

    await this.upsertAll(specs);
  }

  /**
   * Runs entity-level enqueue thunks (one per category/item/option) with
   * bounded concurrency instead of a single unbounded Promise.all. Callers
   * like RestaurantsService.enqueueTranslateAll fan this out across every
   * entity in a restaurant — for a large multi-language menu that's
   * hundreds of entities, each already issuing its own upsert(s), so an
   * unbounded Promise.all here reproduces the same PgBouncer pool exhaustion
   * this class's per-entity sequential upserts were fixed to avoid.
   */
  async enqueueBatch(
    thunks: Array<() => Promise<void>>,
    concurrency = 8,
  ): Promise<void> {
    let cursor = 0;
    const workers = Array.from(
      { length: Math.min(concurrency, thunks.length) },
      async () => {
        while (cursor < thunks.length) {
          const next = thunks[cursor++];
          await next();
        }
      },
    );
    await Promise.all(workers);
  }

  async enqueueOption(
    restaurantId: string,
    option: OptionLike,
    locales: string[],
    sourceLang: string,
  ): Promise<void> {
    const nameHash = computeSourceHash(option.name);
    const specs: UpsertSpec[] = locales.map((locale) => ({
      restaurantId,
      entityType: 'OPTION' as const,
      entityId: option.id,
      field: 'NAME' as const,
      locale,
      sourceLang,
      sourceHash: nameHash,
    }));

    const choiceNames = (option.choices ?? [])
      .map((c) => c.name)
      .filter(Boolean);
    if (choiceNames.length > 0) {
      const hash = computeSetHash(choiceNames);
      specs.push(
        ...locales.map((locale) => ({
          restaurantId,
          entityType: 'OPTION' as const,
          entityId: option.id,
          field: 'CHOICES' as const,
          locale,
          sourceLang,
          sourceHash: hash,
        })),
      );
    }

    await this.upsertAll(specs);
  }
}
