import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TranslationService } from '../translation/translation.service';

const DEEPL_RATE_LIMIT_MS = 300;

@Injectable()
export class MenuTranslationService {
  private readonly logger = new Logger(MenuTranslationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly translationService: TranslationService,
  ) {}

  async applyLazyTranslations(categories: any[], lang: string): Promise<void> {
    for (const category of categories) {
      const catTrans: any =
        category.translations && typeof category.translations === 'object'
          ? { ...(category.translations as any) }
          : {};

      if (!catTrans[lang]?.name) {
        try {
          const translated = await this.translationService.translateObject(
            { name: category.name },
            [lang],
          );
          if (translated[lang]) {
            const merged = { ...catTrans, ...translated };
            await this.prisma.menuCategory.update({
              where: { id: category.id },
              data: { translations: merged },
            });
            catTrans[lang] = translated[lang];
          }
        } catch { /* keep original */ }
        await new Promise((r) => setTimeout(r, DEEPL_RATE_LIMIT_MS));
      }

      if (catTrans[lang]?.name) {
        category.name = catTrans[lang].name;
      }

      for (const item of category.items ?? []) {
        const itemTrans: any =
          item.translations && typeof item.translations === 'object'
            ? { ...(item.translations as any) }
            : {};

        if (!itemTrans[lang]?.name) {
          try {
            const textToTranslate: Record<string, string> = { name: item.name };
            if (item.description) textToTranslate.description = item.description;
            (item.allergens || []).forEach((a: string) => {
              textToTranslate[`allergen_${a}`] = a;
            });
            (item.dietaryTags || []).forEach((t: string) => {
              textToTranslate[`tag_${t}`] = t;
            });

            const translated = await this.translationService.translateObject(
              textToTranslate,
              [lang],
            );

            if (translated[lang]) {
              const langData = { ...translated[lang] };
              const translatedAllergens: string[] = [];
              const translatedTags: string[] = [];
              for (const key of Object.keys(langData)) {
                if (key.startsWith('allergen_')) {
                  translatedAllergens.push(langData[key]);
                  delete langData[key];
                } else if (key.startsWith('tag_')) {
                  translatedTags.push(langData[key]);
                  delete langData[key];
                }
              }
              if (translatedAllergens.length) (langData as any).allergens = translatedAllergens;
              if (translatedTags.length) (langData as any).dietaryTags = translatedTags;

              const merged = { ...itemTrans, [lang]: langData };
              await this.prisma.menuItem.update({
                where: { id: item.id },
                data: { translations: merged },
              });
              itemTrans[lang] = langData;
            }
          } catch { /* keep original */ }
          await new Promise((r) => setTimeout(r, DEEPL_RATE_LIMIT_MS));
        }

        if (itemTrans[lang]?.name) item.name = itemTrans[lang].name;
        if (itemTrans[lang]?.description) item.description = itemTrans[lang].description;
        if (itemTrans[lang]?.allergens) item.allergens = itemTrans[lang].allergens;
        if (itemTrans[lang]?.dietaryTags) item.dietaryTags = itemTrans[lang].dietaryTags;

        for (const option of item.options ?? []) {
          const optTrans: any =
            option.translations && typeof option.translations === 'object'
              ? { ...(option.translations as any) }
              : {};

          if (!optTrans[lang]?.name) {
            try {
              const textToTranslate: Record<string, string> = { name: option.name };
              const choices = (option.choices as any[]) || [];
              choices.forEach((c: any) => {
                if (c.name) textToTranslate[`choice_${c.name}`] = c.name;
              });

              const translated = await this.translationService.translateObject(
                textToTranslate,
                [lang],
              );

              if (translated[lang]) {
                if (!optTrans[lang]) optTrans[lang] = { choices: {} };
                if (!optTrans[lang].choices) optTrans[lang].choices = {};

                const langData = translated[lang];
                if (langData.name) optTrans[lang].name = langData.name;
                for (const key of Object.keys(langData)) {
                  if (key.startsWith('choice_')) {
                    optTrans[lang].choices[key.replace('choice_', '')] = langData[key];
                  }
                }

                await this.prisma.menuOption.update({
                  where: { id: option.id },
                  data: { translations: optTrans } as any,
                });
              }
            } catch { /* keep original */ }
            await new Promise((r) => setTimeout(r, DEEPL_RATE_LIMIT_MS));
          }

          if (optTrans[lang]?.name) option.name = optTrans[lang].name;
          if (optTrans[lang]?.choices) {
            const choices = (option.choices as any[]) || [];
            option.choices = choices.map((c: any) => ({
              ...c,
              name: optTrans[lang].choices[c.name] || c.name,
            }));
          }
        }
      }
    }
  }
}
