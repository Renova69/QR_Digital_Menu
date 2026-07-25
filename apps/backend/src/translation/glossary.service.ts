import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Terminology-constrained translation lookup. Sits above the translation
 * provider — known short menu terms (item/category names) resolved here
 * bypass the provider entirely: free, instant, and correct regardless of
 * whether the underlying model is good at short/rare-word input (NMT models
 * generally are not — see translation.service.ts for the provider that
 * calls into this).
 */
@Injectable()
export class GlossaryService {
  constructor(private readonly prisma: PrismaService) {}

  private normalize(text: string): string {
    return text.trim().toLowerCase();
  }

  /**
   * Looks up a batch of texts against the glossary for one source/target
   * language pair. Returns a map keyed by the *normalized* source text so
   * callers can check membership with the same normalization they'd apply
   * to their own input.
   */
  async lookupBatch(
    sourceLang: string,
    texts: string[],
    targetLang: string,
  ): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    if (!texts || texts.length === 0) return result;

    const normalizedTexts = [...new Set(texts.map((t) => this.normalize(t)))];

    const rows = await this.prisma.glossaryTerm.findMany({
      where: {
        sourceLang,
        targetLang,
        sourceText: { in: normalizedTexts },
      },
      select: { sourceText: true, translatedText: true },
    });

    for (const row of rows) {
      result.set(row.sourceText, row.translatedText);
    }
    return result;
  }
}
