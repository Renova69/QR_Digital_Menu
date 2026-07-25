import { Injectable } from '@nestjs/common';

/**
 * Pure, I/O-free application of already-stored translations onto in-memory
 * menu objects. This is deliberately the ONLY thing the public menu read
 * path (public-menu.controller.ts via menu-crud.service.ts) is allowed to
 * touch — it cannot inject TranslationService or PrismaService, so a public,
 * unauthenticated GET can never trigger a provider call or a DB write.
 *
 * Writing (diffing against stored translations, calling the provider,
 * persisting results) lives in MenuTranslationService and is driven only by
 * MenuTranslationWorkerService.
 */
@Injectable()
export class MenuTranslationReadService {
  /**
   * Swaps name/description onto categories/items/options from their cached
   * `translations[lang]` entry, in place. Mirrors Phase 4 of the old
   * combined applyLazyTranslations — the two invariants below are load
   * bearing, do not change them:
   *
   * - item.allergens / item.dietaryTags are NEVER swapped to translated
   *   text. The menu-tags preset system (menu-tags.ts /
   *   apps/frontend/src/lib/menuTags.ts) resolves an icon from the RAW
   *   stored value; swapping it would break icon lookup unpredictably per
   *   language. The frontend reads the translated label separately via
   *   item.translations[lang].allergens/dietaryTags (getTranslatedArray) as
   *   a display-only fallback.
   * - choice.name is never overwritten. It is the stable DB key
   *   orders.service.ts uses to validate a selected choice server-side.
   *   Translated labels are read via option.translations[lang].choices
   *   directly (getChoiceLabel on the frontend).
   */
  applyStoredTranslations(categories: any[], lang: string): void {
    for (const category of categories) {
      const t = category.translations as Record<string, any> | null;
      if (t?.[lang]?.name) {
        category.originalName ??= category.name;
        category.name = t[lang].name;
      }

      for (const item of category.items ?? []) {
        const it = item.translations as Record<string, any> | null;
        if (it?.[lang]?.name) {
          item.originalName ??= item.name;
          item.name = it[lang].name;
        }
        if (it?.[lang]?.description) {
          item.originalDescription ??= item.description;
          item.description = it[lang].description;
        }

        for (const option of item.options ?? []) {
          const ot = option.translations as Record<string, any> | null;
          if (ot?.[lang]?.name) {
            option.originalName ??= option.name;
            option.name = ot[lang].name;
          }
        }
      }
    }
  }
}
