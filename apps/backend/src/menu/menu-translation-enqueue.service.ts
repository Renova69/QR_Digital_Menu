import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isGarbageTranslation } from '../translation/translation-validator';
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
  translations?: unknown;
}

interface OptionLike {
  id: string;
  name: string;
  choices?: Array<{ name: string }> | null;
  translations?: unknown;
}

interface UpsertSpec {
  restaurantId: string;
  runId?: string;
  entityType: EntityType;
  entityId: string;
  field: Field;
  locale: string;
  sourceLang: string;
  sourceHash: string;
  force?: boolean;
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

  private normalizeLocales(locales: string[], sourceLang: string): string[] {
    const source = sourceLang.trim().toLowerCase();
    return [
      ...new Set(
        locales
          .map((locale) => locale.trim().toLowerCase())
          .filter((locale) => locale && locale !== source),
      ),
    ];
  }

  private translationEntry(raw: unknown, locale: string): Record<string, any> {
    if (!raw || typeof raw !== 'object') return {};
    const entry = (raw as Record<string, unknown>)[locale];
    return entry && typeof entry === 'object'
      ? (entry as Record<string, any>)
      : {};
  }

  private needsRefresh(
    source: string,
    translated: unknown,
    locale: string,
  ): boolean {
    return (
      typeof translated !== 'string' ||
      isGarbageTranslation(source, translated, locale)
    );
  }

  private async upsertMany(specs: UpsertSpec[], force: boolean): Promise<void> {
    if (specs.length === 0) return;
    const isExplicitRun = specs.some((spec) => spec.runId != null);
    const values = Prisma.join(
      specs.map(
        (params) => Prisma.sql`(
          ${randomUUID()}, ${params.restaurantId}, ${params.entityType}::"MenuTranslationEntity",
          ${params.entityId}, ${params.field}::"MenuTranslationField", ${params.locale},
          ${params.sourceLang}, ${params.sourceHash}, ${force ? 'STALE' : 'CURRENT'}::"MenuTranslationStatus",
          ${params.runId ?? null}, now(), now()
        )`,
      ),
    );
    const preserveNeedsReview = force
      ? Prisma.sql`(
          "menu_translation_state"."sourceHash" = EXCLUDED."sourceHash"
          AND "menu_translation_state"."sourceLang" = EXCLUDED."sourceLang"
          AND "menu_translation_state"."status" = 'NEEDS_REVIEW'
        )`
      : Prisma.sql`FALSE`;
    // An owner-authored translation outranks everything the pipeline believes.
    // This applies on BOTH the force and non-force paths and survives a source
    // edit, because silently discarding words a human typed is the one
    // behaviour guaranteed to make owners distrust the feature.
    const preserveManual = Prisma.sql`("menu_translation_state"."status" = 'MANUAL')`;
    const nextStatus = force
      ? Prisma.sql`(CASE
          WHEN ${preserveManual} THEN 'MANUAL'
          WHEN ${preserveNeedsReview} THEN 'NEEDS_REVIEW'
          ELSE 'STALE'
        END)::"MenuTranslationStatus"`
      : Prisma.sql`(CASE
          WHEN ${preserveManual} THEN 'MANUAL'
          WHEN "menu_translation_state"."sourceHash" <> EXCLUDED."sourceHash" THEN 'STALE'
          WHEN "menu_translation_state"."sourceLang" <> EXCLUDED."sourceLang" THEN 'STALE'
          ELSE 'CURRENT'
        END)::"MenuTranslationStatus"`;

    try {
      await this.prisma.$executeRaw(
        Prisma.sql`
          INSERT INTO "menu_translation_state" (
            "id", "restaurantId", "entityType", "entityId", "field", "locale",
            "sourceLang", "sourceHash", "status", "runId", "createdAt", "updatedAt"
          )
          VALUES ${values}
          ON CONFLICT ("entityType", "entityId", "field", "locale") DO UPDATE SET
            "sourceHash" = CASE WHEN ${preserveManual}
              THEN "menu_translation_state"."sourceHash" ELSE EXCLUDED."sourceHash" END,
            "sourceLang" = EXCLUDED."sourceLang",
            "status" = ${nextStatus},
            "runId" = CASE WHEN ${nextStatus} = 'STALE'
              THEN EXCLUDED."runId" ELSE NULL END,
            "nextAttemptAt" = CASE WHEN ${preserveNeedsReview}
              THEN "menu_translation_state"."nextAttemptAt" ELSE NULL END,
            "failureCount" = CASE WHEN ${preserveNeedsReview}
              THEN "menu_translation_state"."failureCount" ELSE 0 END,
            "lastError" = CASE WHEN ${preserveNeedsReview}
              THEN "menu_translation_state"."lastError" ELSE NULL END,
            "updatedAt" = CASE WHEN ${preserveNeedsReview}
              THEN "menu_translation_state"."updatedAt" ELSE now() END
        `,
      );
    } catch (err) {
      this.logger.warn(
        `Failed to enqueue ${specs.length} translation unit(s): ${err instanceof Error ? err.message : String(err)}`,
      );
      if (isExplicitRun) throw err;
    }
  }

  // Collapse all fields/locales for one entity into at most two statements:
  // one for already-good cached values and one for missing/invalid values.
  // Run those two sequentially so enqueueBatch's concurrency of eight means
  // at most eight PgBouncer connections, not sixteen.
  private async upsertAll(specs: UpsertSpec[]): Promise<void> {
    const unique = new Map<string, UpsertSpec>();
    for (const spec of specs) {
      unique.set(
        `${spec.entityType}:${spec.entityId}:${spec.field}:${spec.locale}`,
        spec,
      );
    }
    const normalized = [...unique.values()];
    await this.upsertMany(
      normalized.filter((spec) => !spec.force),
      false,
    );
    await this.upsertMany(
      normalized.filter((spec) => spec.force),
      true,
    );
  }

  async enqueueCategory(
    restaurantId: string,
    category: { id: string; name: string; translations?: unknown },
    locales: string[],
    sourceLang: string,
    runId?: string,
  ): Promise<void> {
    const normalizedLocales = this.normalizeLocales(locales, sourceLang);
    const hash = computeSourceHash(category.name);
    await this.upsertAll(
      normalizedLocales.map((locale) => ({
        force: this.needsRefresh(
          category.name,
          this.translationEntry(category.translations, locale).name,
          locale,
        ),
        restaurantId,
        runId,
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
    runId?: string,
  ): Promise<void> {
    const normalizedLocales = this.normalizeLocales(locales, sourceLang);
    const nameHash = computeSourceHash(item.name);
    const specs: UpsertSpec[] = normalizedLocales.map((locale) => ({
      force: this.needsRefresh(
        item.name,
        this.translationEntry(item.translations, locale).name,
        locale,
      ),
      restaurantId,
      runId,
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
        ...normalizedLocales.map((locale) => ({
          force: this.needsRefresh(
            item.description!,
            this.translationEntry(item.translations, locale).description,
            locale,
          ),
          restaurantId,
          runId,
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
        ...normalizedLocales.map((locale) => ({
          force: customAllergens.some((allergen) =>
            this.needsRefresh(
              allergen,
              this.translationEntry(item.translations, locale).allergens?.[
                allergen
              ],
              locale,
            ),
          ),
          restaurantId,
          runId,
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
        ...normalizedLocales.map((locale) => ({
          force: customTags.some((tag) =>
            this.needsRefresh(
              tag,
              this.translationEntry(item.translations, locale).dietaryTags?.[
                tag
              ],
              locale,
            ),
          ),
          restaurantId,
          runId,
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
    runId?: string,
  ): Promise<void> {
    const normalizedLocales = this.normalizeLocales(locales, sourceLang);
    const nameHash = computeSourceHash(option.name);
    const specs: UpsertSpec[] = normalizedLocales.map((locale) => ({
      force: this.needsRefresh(
        option.name,
        this.translationEntry(option.translations, locale).name,
        locale,
      ),
      restaurantId,
      runId,
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
        ...normalizedLocales.map((locale) => ({
          force: choiceNames.some((choice) =>
            this.needsRefresh(
              choice,
              this.translationEntry(option.translations, locale).choices?.[
                choice
              ],
              locale,
            ),
          ),
          restaurantId,
          runId,
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
