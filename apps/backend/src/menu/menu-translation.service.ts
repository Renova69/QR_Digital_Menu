import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TranslationService } from '../translation/translation.service';
import { TranslateOptions } from '../translation/translation-provider.interface';
import { isPresetTagKey } from './menu-tags';

@Injectable()
export class MenuTranslationService {
  private readonly logger = new Logger(MenuTranslationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly translationService: TranslationService,
  ) {}

  private asTransObj(raw: unknown): Record<string, any> {
    return raw && typeof raw === 'object'
      ? { ...(raw as Record<string, any>) }
      : {};
  }

  async applyLazyTranslations(
    categories: any[],
    lang: string,
    sourceLang?: string,
    opts?: TranslateOptions,
  ): Promise<void> {
    interface Pending {
      type: 'category' | 'item' | 'option';
      entity: any;
      existing: Record<string, any>;
      textMap: Record<string, string>;
    }

    // Phase 1: collect entities that are missing a translation for this lang
    const pending: Pending[] = [];

    for (const category of categories) {
      const existing = this.asTransObj(category.translations);
      if (!existing[lang]?.name) {
        pending.push({
          type: 'category',
          entity: category,
          existing,
          textMap: { name: category.name },
        });
      }

      for (const item of category.items ?? []) {
        const existing = this.asTransObj(item.translations);
        const itemTextMap: Record<string, string> = {};
        if (!existing[lang]?.name) {
          itemTextMap.name = item.name;
        }
        if (item.description && !existing[lang]?.description)
          itemTextMap.description = item.description;
        // Diff allergens/dietaryTags: allergens stored as map { orig: translated };
        // old array format = cannot diff → re-translate all entries.
        // Preset keys (menu-tags.ts) are never sent to DeepL — their labels
        // come from the frontend's own i18n bundle, not the translation
        // pipeline, so glossary/provider characters would be spent for a
        // value nothing ever reads.
        (item.allergens || [])
          .filter((a: string) => !isPresetTagKey(a))
          .forEach((a: string) => {
            const cached = Array.isArray(existing[lang]?.allergens)
              ? undefined
              : existing[lang]?.allergens?.[a];
            if (!cached) itemTextMap[`allergen_${a}`] = a;
          });
        (item.dietaryTags || [])
          .filter((t: string) => !isPresetTagKey(t))
          .forEach((t: string) => {
            const cached = Array.isArray(existing[lang]?.dietaryTags)
              ? undefined
              : existing[lang]?.dietaryTags?.[t];
            if (!cached) itemTextMap[`tag_${t}`] = t;
          });
        if (Object.keys(itemTextMap).length > 0)
          pending.push({
            type: 'item',
            entity: item,
            existing,
            textMap: itemTextMap,
          });

        for (const option of item.options ?? []) {
          const existing = this.asTransObj(option.translations);
          const optTextMap: Record<string, string> = {};
          if (!existing[lang]?.name) optTextMap.name = option.name;
          // Diff choices: translate only choice names not yet in cached choices map
          ((option.choices as any[]) || []).forEach((c: any) => {
            if (c.name && !existing[lang]?.choices?.[c.name])
              optTextMap[`choice_${c.name}`] = c.name;
          });
          if (Object.keys(optTextMap).length > 0)
            pending.push({
              type: 'option',
              entity: option,
              existing,
              textMap: optTextMap,
            });
        }
      }
    }

    // Phase 2: single batched translation call (chunked at the active provider's maxBatchSize)
    if (pending.length > 0) {
      const allTexts: string[] = [];
      const offsets: number[] = [];
      const keyLists: string[][] = [];

      for (const p of pending) {
        const entries = Object.entries(p.textMap);
        offsets.push(allTexts.length);
        keyLists.push(entries.map(([k]) => k));
        allTexts.push(...entries.map(([, v]) => v));
      }

      const translated: string[] = [];
      const batchLimit = this.translationService.maxBatchSize;
      try {
        for (let i = 0; i < allTexts.length; i += batchLimit) {
          const chunk = allTexts.slice(i, i + batchLimit);
          const result = await this.translationService.translateTexts(
            chunk,
            lang,
            sourceLang,
            opts,
          );
          translated.push(...result);
        }
      } catch (err: unknown) {
        // Issue 17: translation failure must not overwrite cached valid translations.
        this.logger.error(
          `Translation batch failed for lang=${lang}: ${err instanceof Error ? err.message : String(err)} — skipping DB writes`,
        );
        throw err;
      }

      // Phase 3: distribute results, update entity.translations, write DB in parallel
      const dbWrites: Promise<unknown>[] = [];

      for (let i = 0; i < pending.length; i++) {
        const { type, entity, existing } = pending[i];
        const offset = offsets[i];
        const keys = keyLists[i];
        const langData: Record<string, string> = {};
        for (let j = 0; j < keys.length; j++) {
          langData[keys[j]] = translated[offset + j];
        }

        if (type === 'category') {
          const langEntry = { name: langData.name ?? entity.name };
          // F-TRANS-1/2: merge only this lang's fragment atomically at the DB
          // level (jsonb || operator) instead of writing back a full
          // read-modify-write snapshot, which a concurrent request for a
          // different lang could silently clobber.
          const merged = { ...existing, [lang]: langEntry };
          entity.translations = merged;
          dbWrites.push(
            this.prisma
              .$executeRaw`UPDATE "menu_category" SET translations = COALESCE(translations, '{}'::jsonb) || ${JSON.stringify({ [lang]: langEntry })}::jsonb WHERE id = ${entity.id}`.catch(
              (e: unknown) => {
                this.logger.warn(
                  `Category translation save failed: ${String(e)}`,
                );
                throw e;
              },
            ),
          );
        } else if (type === 'item') {
          // Allergens/tags stored as maps { original: translated } for diffing.
          const allergenFragment: Record<string, string> = {};
          const tagFragment: Record<string, string> = {};
          for (const [k, v] of Object.entries(langData)) {
            if (k.startsWith('allergen_'))
              allergenFragment[k.replace('allergen_', '')] = v;
            else if (k.startsWith('tag_'))
              tagFragment[k.replace('tag_', '')] = v;
          }
          const nameOrNull = langData.name ?? null;
          const descOrNull = langData.description ?? null;
          // In-memory object updated optimistically for phase 4 (this
          // request's own view); the DB write below is the source of truth
          // and merges fresh per-field at write time, not from this snapshot.
          const langEntry: Record<string, unknown> = {
            ...(existing[lang] ?? {}),
          };
          if (nameOrNull) langEntry.name = nameOrNull;
          if (descOrNull) langEntry.description = descOrNull;
          if (Object.keys(allergenFragment).length)
            langEntry.allergens = {
              ...(Array.isArray(langEntry.allergens)
                ? {}
                : (langEntry.allergens as any)),
              ...allergenFragment,
            };
          if (Object.keys(tagFragment).length)
            langEntry.dietaryTags = {
              ...(Array.isArray(langEntry.dietaryTags)
                ? {}
                : (langEntry.dietaryTags as any)),
              ...tagFragment,
            };
          entity.translations = { ...existing, [lang]: langEntry };

          // F-TRANS-1/2: per-field jsonb merge at write time — two concurrent
          // lazy-translation requests for the SAME (entity, lang) (e.g. two
          // customers both triggering a first-ever French translation) each
          // merge only the fields they fetched instead of one clobbering the
          // other's fragment via a full lang-object replace. `jsonb_typeof`
          // guards discard the legacy array format for allergens/dietaryTags
          // exactly like the old JS `Array.isArray` check did. The locking CTE
          // also serializes against an owner override saved while the provider
          // call was in flight; MANUAL name/description fields are read from
          // the current row instead of accepting the provider's stale result.
          dbWrites.push(
            this.prisma
              .$executeRaw`WITH "locked_translation_states" AS MATERIALIZED (
                SELECT "field", "status"
                FROM "menu_translation_state"
                WHERE "entityType" = 'ITEM'::"MenuTranslationEntity"
                  AND "entityId" = ${entity.id}
                  AND "locale" = ${lang}
                FOR UPDATE
              )
              UPDATE "menu_item" SET translations = jsonb_set(
                COALESCE(translations, '{}'::jsonb),
                ARRAY[${lang}]::text[],
                jsonb_build_object(
                  'name', CASE WHEN EXISTS (
                    SELECT 1 FROM "locked_translation_states"
                    WHERE "field" = 'NAME'::"MenuTranslationField"
                      AND "status" = 'MANUAL'::"MenuTranslationStatus"
                  ) THEN translations #> ARRAY[${lang}, 'name']::text[]
                  ELSE COALESCE(
                    to_jsonb(${nameOrNull}::text),
                    translations #> ARRAY[${lang}, 'name']::text[]
                  ) END,
                  'description', CASE WHEN EXISTS (
                    SELECT 1 FROM "locked_translation_states"
                    WHERE "field" = 'DESCRIPTION'::"MenuTranslationField"
                      AND "status" = 'MANUAL'::"MenuTranslationStatus"
                  ) THEN translations #> ARRAY[${lang}, 'description']::text[]
                  ELSE COALESCE(
                    to_jsonb(${descOrNull}::text),
                    translations #> ARRAY[${lang}, 'description']::text[]
                  ) END,
                  'allergens', (
                    CASE WHEN jsonb_typeof(translations #> ARRAY[${lang}, 'allergens']::text[]) = 'object'
                      THEN translations #> ARRAY[${lang}, 'allergens']::text[]
                      ELSE '{}'::jsonb
                    END
                  ) || ${JSON.stringify(allergenFragment)}::jsonb,
                  'dietaryTags', (
                    CASE WHEN jsonb_typeof(translations #> ARRAY[${lang}, 'dietaryTags']::text[]) = 'object'
                      THEN translations #> ARRAY[${lang}, 'dietaryTags']::text[]
                      ELSE '{}'::jsonb
                    END
                  ) || ${JSON.stringify(tagFragment)}::jsonb
                ),
                true
              ) WHERE id = ${entity.id}`.catch((e: unknown) => {
              this.logger.warn(`Item translation save failed: ${String(e)}`);
              throw e;
            }),
          );
        } else {
          const choicesFragment: Record<string, string> = {};
          for (const [k, v] of Object.entries(langData)) {
            if (k.startsWith('choice_'))
              choicesFragment[k.replace('choice_', '')] = v;
          }
          const nameOrNull = langData.name ?? null;
          const optLang: Record<string, any> = {
            ...(existing[lang] ?? {}),
            choices: { ...(existing[lang]?.choices ?? {}), ...choicesFragment },
          };
          if (nameOrNull) optLang.name = nameOrNull;
          entity.translations = { ...existing, [lang]: optLang };

          // F-TRANS-1/2: same per-field jsonb merge rationale as the item
          // branch above, applied to option name + choices map.
          dbWrites.push(
            this.prisma
              .$executeRaw`UPDATE "menu_option" SET translations = jsonb_set(
                COALESCE(translations, '{}'::jsonb),
                ARRAY[${lang}]::text[],
                jsonb_build_object(
                  'name', COALESCE(to_jsonb(${nameOrNull}::text), translations #> ARRAY[${lang}, 'name']::text[]),
                  'choices', COALESCE(translations #> ARRAY[${lang}, 'choices']::text[], '{}'::jsonb)
                    || ${JSON.stringify(choicesFragment)}::jsonb
                ),
                true
              ) WHERE id = ${entity.id}`.catch((e: unknown) => {
              this.logger.warn(`Option translation save failed: ${String(e)}`);
              throw e;
            }),
          );
        }
      }

      await Promise.all(dbWrites);
    }

    // No in-memory apply step here (deliberately) — this method is a pure
    // write path now. It has no HTTP response to shape; only
    // MenuTranslationWorkerService calls it, and the public read path
    // (menu-crud.service.ts) applies cached translations for display via
    // MenuTranslationReadService.applyStoredTranslations, which never
    // touches Prisma or TranslationService. That split is what keeps
    // anonymous public GETs from ever triggering a provider call or a DB
    // write — see menu-translation-read.service.ts for the invariants
    // (allergens/dietaryTags and choice.name are never overwritten there).
  }
}
