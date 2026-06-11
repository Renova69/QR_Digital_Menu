import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TranslationService } from '../translation/translation.service';

// DeepL accepts up to 50 text strings per request
const DEEPL_BATCH_LIMIT = 50;

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

  async applyLazyTranslations(categories: any[], lang: string): Promise<void> {
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
          if (item.description) itemTextMap.description = item.description;
        }
        // Diff allergens/dietaryTags: allergens stored as map { orig: translated };
        // old array format = cannot diff → re-translate all entries
        (item.allergens || []).forEach((a: string) => {
          const cached = Array.isArray(existing[lang]?.allergens)
            ? undefined
            : existing[lang]?.allergens?.[a];
          if (!cached) itemTextMap[`allergen_${a}`] = a;
        });
        (item.dietaryTags || []).forEach((t: string) => {
          const cached = Array.isArray(existing[lang]?.dietaryTags)
            ? undefined
            : existing[lang]?.dietaryTags?.[t];
          if (!cached) itemTextMap[`tag_${t}`] = t;
        });
        if (Object.keys(itemTextMap).length > 0)
          pending.push({ type: 'item', entity: item, existing, textMap: itemTextMap });

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
            pending.push({ type: 'option', entity: option, existing, textMap: optTextMap });
        }
      }
    }

    // Phase 2: single batched DeepL call (chunked at DEEPL_BATCH_LIMIT)
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
      try {
        for (let i = 0; i < allTexts.length; i += DEEPL_BATCH_LIMIT) {
          const chunk = allTexts.slice(i, i + DEEPL_BATCH_LIMIT);
          const result = await this.translationService.translateTexts(
            chunk,
            lang,
          );
          translated.push(...result);
        }
      } catch (err: unknown) {
        // Issue 17: DeepL failure must not overwrite cached valid translations.
        this.logger.error(
          `DeepL batch failed for lang=${lang}: ${err instanceof Error ? err.message : String(err)} — skipping DB writes`,
        );
        return;
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
          const merged = { ...existing, [lang]: langEntry };
          entity.translations = merged;
          dbWrites.push(
            this.prisma.menuCategory
              .update({
                where: { id: entity.id },
                data: { translations: merged },
              })
              .catch((e: unknown) =>
                this.logger.warn(
                  `Category translation save failed: ${String(e)}`,
                ),
              ),
          );
        } else if (type === 'item') {
          // Start from existing lang entry so partial updates preserve cached fields
          const langEntry: Record<string, unknown> = { ...(existing[lang] ?? {}) };
          if (langData.name) langEntry.name = langData.name;
          if (langData.description) langEntry.description = langData.description;
          // Allergens/tags stored as maps { original: translated } for diffing
          // Old array format is discarded on first update (apply phase handles both)
          const prevAllergens: Record<string, string> = Array.isArray(langEntry.allergens)
            ? {}
            : ((langEntry.allergens as Record<string, string> | undefined) ?? {});
          const prevTags: Record<string, string> = Array.isArray(langEntry.dietaryTags)
            ? {}
            : ((langEntry.dietaryTags as Record<string, string> | undefined) ?? {});
          const allergenMap = { ...prevAllergens };
          const tagMap = { ...prevTags };
          for (const [k, v] of Object.entries(langData)) {
            if (k.startsWith('allergen_')) allergenMap[k.replace('allergen_', '')] = v;
            else if (k.startsWith('tag_')) tagMap[k.replace('tag_', '')] = v;
          }
          if (Object.keys(allergenMap).length) langEntry.allergens = allergenMap;
          if (Object.keys(tagMap).length) langEntry.dietaryTags = tagMap;
          const merged = { ...existing, [lang]: langEntry };
          entity.translations = merged;
          dbWrites.push(
            this.prisma.menuItem
              .update({
                where: { id: entity.id },
                data: { translations: merged },
              })
              .catch((e: unknown) =>
                this.logger.warn(`Item translation save failed: ${String(e)}`),
              ),
          );
        } else {
          const optLang: Record<string, any> = {
            ...(existing[lang] ?? {}),
            choices: { ...(existing[lang]?.choices ?? {}) },
          };
          if (langData.name) optLang.name = langData.name;
          for (const [k, v] of Object.entries(langData)) {
            if (k.startsWith('choice_'))
              optLang.choices[k.replace('choice_', '')] = v;
          }
          const merged = { ...existing, [lang]: optLang };
          entity.translations = merged;
          dbWrites.push(
            this.prisma.menuOption
              .update({
                where: { id: entity.id },
                data: { translations: merged } as any,
              })
              .catch((e: unknown) =>
                this.logger.warn(
                  `Option translation save failed: ${String(e)}`,
                ),
              ),
          );
        }
      }

      await Promise.all(dbWrites);
    }

    // Phase 4: apply all translations (cached + newly fetched) to in-memory objects
    for (const category of categories) {
      const t = category.translations as Record<string, any> | null;
      if (t?.[lang]?.name) category.name = t[lang].name;

      for (const item of category.items ?? []) {
        const t = item.translations as Record<string, any> | null;
        if (t?.[lang]?.name) item.name = t[lang].name;
        if (t?.[lang]?.description) item.description = t[lang].description;
        if (t?.[lang]?.allergens) {
          item.allergens = Array.isArray(t[lang].allergens)
            ? t[lang].allergens
            : Object.values(t[lang].allergens);
        }
        if (t?.[lang]?.dietaryTags) {
          item.dietaryTags = Array.isArray(t[lang].dietaryTags)
            ? t[lang].dietaryTags
            : Object.values(t[lang].dietaryTags);
        }

        for (const option of item.options ?? []) {
          const t = option.translations as Record<string, any> | null;
          if (t?.[lang]?.name) option.name = t[lang].name;
          if (t?.[lang]?.choices) {
            option.choices = (option.choices as any[]).map((c: any) => ({
              ...c,
              name: t[lang].choices[c.name] ?? c.name,
            }));
          }
        }
      }
    }
  }
}
