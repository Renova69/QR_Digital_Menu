import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Records DeepL character usage. This is the ONE place every translation
 * call path — pre-warm, translate-all, the future worker — funnels through,
 * because it is called from inside DeepLProvider.translateBatch itself
 * (the only code that actually issues the HTTP request), not from
 * TranslationService. That makes it structurally impossible for a future
 * caller to bypass usage tracking by calling the provider directly.
 *
 * Character counting matches DeepL's own billing: source characters only
 * (the `context` param is explicitly NOT billed), counted as Unicode code
 * points (`[...text].length`), not UTF-16 code units — plain `.length`
 * over-counts astral-plane characters (emoji do appear in menu item names).
 * Counted only on a successful response; a failed/retried request bills 0.
 */
@Injectable()
export class TranslationUsageService {
  private readonly logger = new Logger(TranslationUsageService.name);

  constructor(private readonly prisma: PrismaService) {}

  countCodePoints(texts: string[]): number {
    return texts.reduce((sum, t) => sum + [...t].length, 0);
  }

  private currentPeriodMonth(): string {
    return new Date().toISOString().slice(0, 7); // 'YYYY-MM'
  }

  /**
   * Increments the monthly ledger for (restaurantId, periodMonth, provider,
   * sourceLang, targetLang). A single atomic INSERT … ON CONFLICT DO UPDATE
   * — never a read-modify-write — so concurrent recordings from parallel
   * worker batches never lose an increment. `restaurantId` is required here
   * (not merely typed optional on the table) — Postgres treats NULL as
   * distinct from NULL for uniqueness purposes, so an ON CONFLICT upsert
   * against a NULL restaurantId would insert a new row every time instead
   * of aggregating. The column stays nullable only so a tenant deletion's
   * ON DELETE SET NULL doesn't destroy historical spend records.
   */
  async record(params: {
    restaurantId: string;
    provider: string;
    sourceLang: string;
    targetLang: string;
    charCount: number;
  }): Promise<void> {
    if (params.charCount <= 0) return;
    const periodMonth = this.currentPeriodMonth();
    try {
      await this.prisma.$executeRaw`
        INSERT INTO "translation_usage"
          ("id", "restaurantId", "periodMonth", "provider", "sourceLang", "targetLang", "charCount", "requestCount", "createdAt", "updatedAt")
        VALUES
          (${randomUUID()}, ${params.restaurantId}, ${periodMonth}, ${params.provider}, ${params.sourceLang}, ${params.targetLang}, ${params.charCount}, 1, now(), now())
        ON CONFLICT ("restaurantId", "periodMonth", "provider", "sourceLang", "targetLang")
        DO UPDATE SET
          "charCount" = "translation_usage"."charCount" + EXCLUDED."charCount",
          "requestCount" = "translation_usage"."requestCount" + EXCLUDED."requestCount",
          "updatedAt" = now()
      `;
    } catch (err) {
      // Usage recording must never fail the translation call it's attached
      // to — a lost usage row is a cost-accounting gap, not a user-facing
      // failure. Log loudly so drift against DeepL's own /v2/usage is
      // still noticeable.
      this.logger.error(
        `Failed to record translation usage (restaurant=${params.restaurantId}, chars=${params.charCount}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async getRestaurantUsage(
    restaurantId: string,
    periodMonth: string = this.currentPeriodMonth(),
  ): Promise<number> {
    const rows = await this.prisma.translationUsage.findMany({
      where: { restaurantId, periodMonth },
      select: { charCount: true },
    });
    return rows.reduce((sum, r) => sum + r.charCount, 0);
  }

  async getPlatformUsage(
    periodMonth: string = this.currentPeriodMonth(),
  ): Promise<number> {
    const result = await this.prisma.translationUsage.aggregate({
      where: { periodMonth },
      _sum: { charCount: true },
    });
    return result._sum.charCount ?? 0;
  }
}
