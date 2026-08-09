import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  CRON_EVERY_10_MINUTES,
  CRON_EVERY_MINUTE,
} from '../common/cron-schedules';
import { PrismaService } from '../prisma/prisma.service';
import { MenuTranslationService } from './menu-translation.service';
import { TranslationService } from '../translation/translation.service';
import { TranslationQuotaService } from '../translation/translation-quota.service';
import { DeepLGlossaryService } from '../translation/deepl-glossary.service';
import { EventsGateway } from '../events/events.gateway';

interface ClaimedRow {
  id: string;
  restaurantId: string;
  entityType: 'CATEGORY' | 'ITEM' | 'OPTION';
  entityId: string;
  field: string;
  locale: string;
  sourceLang: string;
  failureCount: number;
}

export interface RestaurantTranslationProgress {
  done: number;
  total: number;
  pending: number;
  failed: number;
  current: number;
  active: boolean;
  status: string | null;
  runId: string | null;
}

// Fixed placeholder id for the synthetic category/item wrappers used to
// isolate a single claimed ITEM or OPTION from its real siblings when
// handed to MenuTranslationService.applyLazyTranslations (which expects a
// category tree). Never a real DB row — the atomic UPDATE...WHERE id=$X
// inside applyLazyTranslations simply affects 0 rows for these and is
// swallowed by its own per-write .catch(warn), same as the existing
// "trending" fake-category trick in menu-crud.service.ts.
const SYNTHETIC_ID = '__worker_synthetic__';

/**
 * Claims STALE/FAILED-and-eligible MenuTranslationState rows and drives
 * them through the existing MenuTranslationService.applyLazyTranslations
 * write path — this worker does NOT reimplement per-field translate/write
 * logic. The state table is the queue (which (entity,field,locale) needs
 * attention); the actual diff-against-stored-JSON, batched translate, and
 * atomic jsonb write already exist and are heavily tested there. Reusing
 * it means every field type (name, description, allergens, dietaryTags,
 * choices) is handled correctly without re-deriving that logic here.
 *
 * Claiming uses a single autocommit `UPDATE … FOR UPDATE SKIP LOCKED`
 * statement — never wrapped in an interactive $transaction. Holding a
 * transaction open across a DeepL HTTP call (8s timeout × 5 retries) would
 * pin a pooled connection under PgBouncer transaction-mode pooling long
 * enough to exhaust the pool.
 */
@Injectable()
export class MenuTranslationWorkerService {
  private readonly logger = new Logger(MenuTranslationWorkerService.name);

  // In-process mutex — the cron tick and any "kick after enqueue" caller
  // share this so an immediate kick never races the next minute's tick.
  private running = false;

  private static readonly BATCH_LIMIT = 100;
  private static readonly MAX_FAILURE_COUNT = 5;
  private static readonly STUCK_PENDING_MINUTES = 10;
  // 200 * BATCH_LIMIT(100) = 20,000 units per drain call — generous
  // headroom over any realistic single-restaurant Translate-All.
  private static readonly MAX_DRAIN_ITERATIONS = 200;

  constructor(
    private readonly prisma: PrismaService,
    private readonly menuTranslationService: MenuTranslationService,
    private readonly translationService: TranslationService,
    private readonly quota: TranslationQuotaService,
    private readonly deeplGlossary: DeepLGlossaryService,
    private readonly events: EventsGateway,
  ) {}

  private isEnabled(): boolean {
    return process.env.TRANSLATION_ENABLED === 'true';
  }

  @Cron(CRON_EVERY_MINUTE.MENU_TRANSLATION_WORKER, {
    name: 'menuTranslationWorker',
    waitForCompletion: true,
  })
  async tick(): Promise<void> {
    if (!this.isEnabled()) return;
    await this.drain();
  }

  /** Non-blocking "kick" — enqueue sites call this (fire-and-forget) so a
   * fresh STALE row is picked up within moments instead of waiting for the
   * next minute tick, and the whole backlog drains continuously rather than
   * one batch per cron minute. Safe to call concurrently with the cron tick
   * or other kicks — runOnce's mutex simply skips an iteration if a run is
   * already in progress. */
  kick(): void {
    if (!this.isEnabled()) return;
    void this.drain().catch((err) =>
      this.logger.error(
        `Worker kick failed: ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
  }

  /** Returns whether it actually claimed and processed a batch — the drain
   * loop below uses this to know when to stop. */
  async runOnce(): Promise<boolean> {
    if (this.running) return false;
    // Mirrors the old translateAll's upfront check — if DeepL isn't
    // configured, don't touch anything at all. Claiming and then falling
    // back to source text would cache the source text as if it were a
    // real translation and mark the row CURRENT, silently poisoning it the
    // same way the old glossary-only gate did. Leave rows STALE untouched;
    // they're picked up the moment a key is configured.
    if (!this.translationService.isEnabled()) return false;
    this.running = true;
    try {
      const claimed = await this.claimBatch(
        MenuTranslationWorkerService.BATCH_LIMIT,
      );
      if (claimed.length === 0) return false;

      const groups = new Map<string, ClaimedRow[]>();
      for (const row of claimed) {
        const key = `${row.restaurantId}::${row.locale}`;
        const list = groups.get(key) ?? [];
        list.push(row);
        groups.set(key, list);
      }

      for (const rows of groups.values()) {
        await this.processGroup(rows).catch((err) =>
          this.logger.error(
            `processGroup failed for restaurant=${rows[0]?.restaurantId} locale=${rows[0]?.locale}: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
      }
      return true;
    } finally {
      this.running = false;
    }
  }

  /** Repeatedly claims+processes batches until the queue is empty, instead
   * of relying on the 1-minute cron to pick up each successive batch. A
   * fresh Translate-All can enqueue far more than BATCH_LIMIT rows; without
   * draining, the dashboard progress bar would advance in minute-spaced
   * jumps and look stalled between them (2026-07-25 live-data finding).
   * Bounded so a pathological backlog still yields to the next cron tick
   * rather than pinning this process indefinitely. */
  private async drain(): Promise<void> {
    for (
      let i = 0;
      i < MenuTranslationWorkerService.MAX_DRAIN_ITERATIONS;
      i++
    ) {
      const didWork = await this.runOnce();
      if (!didWork) return;
    }
    this.logger.warn(
      'Translation drain hit MAX_DRAIN_ITERATIONS — remaining work continues on the next scheduled tick.',
    );
  }

  private async claimBatch(limit: number): Promise<ClaimedRow[]> {
    return this.prisma.$queryRawUnsafe<ClaimedRow[]>(
      `UPDATE "menu_translation_state"
       SET "status" = 'PENDING', "claimedAt" = now(), "updatedAt" = now()
       WHERE "id" IN (
         SELECT "id" FROM "menu_translation_state"
         WHERE "status" IN ('STALE', 'FAILED')
           AND "failureCount" < $1
           AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= now())
         ORDER BY "updatedAt" ASC
         LIMIT $2
         FOR UPDATE SKIP LOCKED
       )
       RETURNING "id", "restaurantId", "entityType", "entityId", "field", "locale", "sourceLang", "failureCount"`,
      MenuTranslationWorkerService.MAX_FAILURE_COUNT,
      limit,
    );
  }

  private wrapItemsAsCategory(items: any[], locale: string) {
    return [
      {
        id: SYNTHETIC_ID,
        name: ' ',
        translations: { [locale]: { name: ' ' } },
        items,
      },
    ];
  }

  private wrapOptionsAsCategory(options: any[], locale: string) {
    return [
      {
        id: SYNTHETIC_ID,
        name: ' ',
        translations: { [locale]: { name: ' ' } },
        items: [
          {
            id: SYNTHETIC_ID,
            name: ' ',
            translations: { [locale]: { name: ' ' } },
            options,
          },
        ],
      },
    ];
  }

  private clearClaimedFields(
    entities: any[],
    rows: ClaimedRow[],
    locale: string,
  ): void {
    const fieldKeys: Record<string, string> = {
      NAME: 'name',
      DESCRIPTION: 'description',
      ALLERGENS: 'allergens',
      DIETARY_TAGS: 'dietaryTags',
      CHOICES: 'choices',
    };
    const byId = new Map(entities.map((entity) => [entity.id, entity]));

    for (const row of rows) {
      const entity = byId.get(row.entityId);
      const fieldKey = fieldKeys[row.field];
      if (!entity || !fieldKey) continue;
      const translations =
        entity.translations && typeof entity.translations === 'object'
          ? { ...entity.translations }
          : {};
      const localeEntry =
        translations[locale] && typeof translations[locale] === 'object'
          ? { ...translations[locale] }
          : {};
      delete localeEntry[fieldKey];
      translations[locale] = localeEntry;
      entity.translations = translations;
    }
  }

  private async estimateChars(rows: ClaimedRow[]): Promise<number> {
    // Rough pre-flight estimate for the quota check — sums canonical text
    // lengths for the claimed entities. Deliberately approximate (doesn't
    // account for glossary hits reducing the real spend to near zero); the
    // actual billed amount is what TranslationUsageService records from
    // DeepLProvider, this is only a pre-flight gate.
    const categoryIds = rows
      .filter((r) => r.entityType === 'CATEGORY')
      .map((r) => r.entityId);
    const itemIds = rows
      .filter((r) => r.entityType === 'ITEM')
      .map((r) => r.entityId);
    const optionIds = rows
      .filter((r) => r.entityType === 'OPTION')
      .map((r) => r.entityId);

    const [cats, items, opts] = await Promise.all([
      categoryIds.length
        ? this.prisma.menuCategory.findMany({
            where: { id: { in: categoryIds } },
            select: { name: true },
          })
        : Promise.resolve([]),
      itemIds.length
        ? this.prisma.menuItem.findMany({
            where: { id: { in: itemIds } },
            select: { name: true, description: true },
          })
        : Promise.resolve([]),
      optionIds.length
        ? this.prisma.menuOption.findMany({
            where: { id: { in: optionIds } },
            select: { name: true },
          })
        : Promise.resolve([]),
    ]);

    let total = 0;
    for (const c of cats) total += c.name.length;
    for (const i of items)
      total += i.name.length + (i.description?.length ?? 0);
    for (const o of opts) total += o.name.length;
    return total;
  }

  /**
   * done/total against ALL outstanding work for the restaurant, not just the
   * batch just processed. The old (NLLB-era) translateAll ran everything for
   * a restaurant in one synchronous request, so a batch's own size was the
   * run's whole total. The worker claims at most BATCH_LIMIT rows per tick
   * across the whole table, so a restaurant with more queued work than that
   * gets multiple ticks — reporting the batch size as "total" made the bar
   * look complete (e.g. "50/50") while most of the run was still queued
   * (2026-07-25 live-data finding, via manual dashboard testing).
   */
  async getRestaurantProgress(
    restaurantId: string,
  ): Promise<RestaurantTranslationProgress> {
    const latestRun = await this.prisma.translationRun.findFirst({
      where: { restaurantId },
      orderBy: { createdAt: 'desc' },
    });
    const runLocales = latestRun?.locales ?? [];
    const stateWhere =
      runLocales.length > 0
        ? { restaurantId, locale: { in: runLocales } }
        : { restaurantId };
    const counts = await this.prisma.menuTranslationState.groupBy({
      by: ['status'],
      where: stateWhere,
      _count: { _all: true },
    });

    let outstanding = 0;
    let pending = 0;
    let failed = 0;
    let current = 0;
    for (const row of counts) {
      if (row.status === 'CURRENT') {
        current += row._count._all;
      } else if (row.status === 'FAILED' || row.status === 'NEEDS_REVIEW') {
        failed += row._count._all;
        outstanding += row._count._all;
      } else if (
        row.status === 'STALE' ||
        row.status === 'PENDING' ||
        row.status === 'SKIPPED'
      ) {
        pending += row._count._all;
        outstanding += row._count._all;
      }
    }

    // Base the progress bar on the latest user-triggered TranslationRun so
    // historical CURRENT rows don't inflate the denominator. Freeze `total`
    // at the run's snapshot — if new STALE rows appear mid-run (e.g. owner
    // edits a menu item while translation is active), they are NOT part of
    // this run and should not make the bar jump backward. When no run exists
    // (e.g. translations triggered by edit→save auto-enqueue), fall back to
    // the live counts so the bar has a meaningful denominator.

    if (latestRun) {
      const total =
        typeof latestRun.totalUnits === 'number'
          ? latestRun.totalUnits
          : current + outstanding;
      const done = Math.max(0, total - outstanding);
      const status: 'RUNNING' | 'PARTIAL' | 'COMPLETED' =
        pending > 0 ? 'RUNNING' : failed > 0 ? 'PARTIAL' : 'COMPLETED';
      const activeRun = ['QUEUED', 'RUNNING'].includes(latestRun.status);
      if (activeRun) {
        await this.prisma.translationRun.update({
          where: { id: latestRun.id },
          data: {
            status,
            doneUnits: done,
            failedUnits: Math.min(failed, Math.max(0, total - done)),
            ...(status === 'RUNNING' ? {} : { finishedAt: new Date() }),
          },
        });
      }
      return {
        done,
        total,
        pending,
        failed,
        current,
        active: pending > 0,
        status,
        runId: latestRun.id,
      };
    }

    // No run record — use live CURRENT + outstanding as the denominator.
    const total = current + outstanding;
    return {
      done: current,
      total,
      pending,
      failed,
      current,
      active: pending > 0,
      status:
        pending > 0
          ? 'RUNNING'
          : failed > 0
            ? 'PARTIAL'
            : total > 0
              ? 'COMPLETED'
              : null,
      runId: null,
    };
  }

  private async markCurrent(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.prisma.menuTranslationState.updateMany({
      where: { id: { in: ids } },
      data: {
        status: 'CURRENT',
        translatedAt: new Date(),
        provider: 'deepl',
        claimedAt: null,
        lastError: null,
      },
    });
  }

  private async markFailed(rows: ClaimedRow[], error: unknown): Promise<void> {
    if (rows.length === 0) return;
    const message = error instanceof Error ? error.message : String(error);
    // Sequential, not Promise.all: each row needs a different backoffMinutes
    // (derived from its own failureCount), so this can't collapse into a
    // single updateMany. Up to BATCH_LIMIT (100) rows can land here in one
    // call; firing them concurrently bursts the PgBouncer transaction-mode
    // pool for no benefit — this is a background cron worker, so the extra
    // latency of awaiting one at a time is free.
    for (const row of rows) {
      const newFailureCount = row.failureCount + 1;
      const backoffMinutes = Math.pow(
        3,
        Math.min(
          newFailureCount,
          MenuTranslationWorkerService.MAX_FAILURE_COUNT,
        ),
      );
      await this.prisma.menuTranslationState.update({
        where: { id: row.id },
        data: {
          status: 'FAILED',
          failureCount: newFailureCount,
          nextAttemptAt: new Date(Date.now() + backoffMinutes * 60_000),
          lastError: message.slice(0, 500),
          claimedAt: null,
        },
      });
    }
  }

  private async releaseToStale(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.prisma.menuTranslationState.updateMany({
      where: { id: { in: ids } },
      data: { status: 'STALE', claimedAt: null },
    });
  }

  private async processGroup(rows: ClaimedRow[]): Promise<void> {
    const { restaurantId, locale, sourceLang } = rows[0];
    const allIds = rows.map((r) => r.id);

    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        id: true,
        tier: true,
        forceTier: true,
        translationCharCapOverride: true,
      },
    });
    if (!restaurant) {
      // Restaurant deleted since enqueue — nothing left to translate for.
      await this.markCurrent(allIds);
      return;
    }

    const estimate = await this.estimateChars(rows);
    const quotaCheck = await this.quota.assertCanSpend(restaurant, estimate);
    if (!quotaCheck.allowed) {
      this.logger.warn(
        `Quota blocked for restaurant=${restaurantId}: ${quotaCheck.reason} (remaining=${quotaCheck.remaining})`,
      );
      await this.releaseToStale(allIds);
      await this.emitProgress(restaurantId, 'quota_blocked', 'QUOTA_BLOCKED');
      return;
    }

    const glossaryId = await this.deeplGlossary
      .ensureGlossary(sourceLang, locale)
      .catch(() => undefined);
    const opts = { restaurantId, glossaryId };

    const byType: Record<'CATEGORY' | 'ITEM' | 'OPTION', ClaimedRow[]> = {
      CATEGORY: rows.filter((r) => r.entityType === 'CATEGORY'),
      ITEM: rows.filter((r) => r.entityType === 'ITEM'),
      OPTION: rows.filter((r) => r.entityType === 'OPTION'),
    };

    let hadFailure = false;

    if (byType.CATEGORY.length > 0) {
      const ids = [...new Set(byType.CATEGORY.map((r) => r.entityId))];
      const categories = await this.prisma.menuCategory.findMany({
        where: { id: { in: ids } },
      });
      this.clearClaimedFields(categories, byType.CATEGORY, locale);
      try {
        await this.menuTranslationService.applyLazyTranslations(
          categories,
          locale,
          sourceLang,
          opts,
        );
        await this.markCurrent(byType.CATEGORY.map((r) => r.id));
      } catch (err) {
        hadFailure = true;
        await this.markFailed(byType.CATEGORY, err);
      }
      await this.emitProgress(restaurantId, 'in_progress', 'RUNNING');
    }

    if (byType.ITEM.length > 0) {
      const ids = [...new Set(byType.ITEM.map((r) => r.entityId))];
      const items = await this.prisma.menuItem.findMany({
        where: { id: { in: ids } },
      });
      this.clearClaimedFields(items, byType.ITEM, locale);
      try {
        await this.menuTranslationService.applyLazyTranslations(
          this.wrapItemsAsCategory(items, locale),
          locale,
          sourceLang,
          opts,
        );
        await this.markCurrent(byType.ITEM.map((r) => r.id));
      } catch (err) {
        hadFailure = true;
        await this.markFailed(byType.ITEM, err);
      }
      await this.emitProgress(restaurantId, 'in_progress', 'RUNNING');
    }

    if (byType.OPTION.length > 0) {
      const ids = [...new Set(byType.OPTION.map((r) => r.entityId))];
      const options = await this.prisma.menuOption.findMany({
        where: { id: { in: ids } },
      });
      this.clearClaimedFields(options, byType.OPTION, locale);
      try {
        await this.menuTranslationService.applyLazyTranslations(
          this.wrapOptionsAsCategory(options, locale),
          locale,
          sourceLang,
          opts,
        );
        await this.markCurrent(byType.OPTION.map((r) => r.id));
      } catch (err) {
        hadFailure = true;
        await this.markFailed(byType.OPTION, err);
      }
      await this.emitProgress(restaurantId, 'in_progress', 'RUNNING');
    }

    await this.emitProgress(
      restaurantId,
      hadFailure ? 'partial' : 'completed',
      hadFailure ? 'PARTIAL' : 'COMPLETED',
    );
  }

  /** Emits done/total against ALL outstanding work for the restaurant (see
   * getProgressSnapshot) — called after each entity-type sub-batch within a
   * claimed group, not just once per group, so a large Translate-All run
   * updates every few seconds instead of jumping once per batch. */
  private async emitProgress(
    restaurantId: string,
    phase: string,
    statusOverride: string,
  ): Promise<void> {
    const snapshot = await this.getRestaurantProgress(restaurantId);
    const status =
      statusOverride === 'QUOTA_BLOCKED' || statusOverride === 'PARTIAL'
        ? statusOverride
        : (snapshot.status ?? statusOverride);
    this.events.emitToRestaurant(restaurantId, 'translate:progress', {
      phase,
      done: snapshot.done,
      total: snapshot.total,
      status,
      runId: snapshot.runId,
    });
  }

  /** PENDING rows whose claim never completed (process crash/restart mid-
   * batch) go back to STALE so they aren't stuck forever. Mirrors
   * print-station.service.ts's retryStuckPrintJobs convention. */
  @Cron(CRON_EVERY_10_MINUTES.MENU_TRANSLATION_STUCK_RESET, {
    name: 'menuTranslationStuckReset',
    waitForCompletion: true,
  })
  async resetStuckPending(): Promise<void> {
    if (!this.isEnabled()) return;
    const cutoff = new Date(
      Date.now() - MenuTranslationWorkerService.STUCK_PENDING_MINUTES * 60_000,
    );
    const { count } = await this.prisma.menuTranslationState.updateMany({
      where: { status: 'PENDING', claimedAt: { lt: cutoff } },
      data: { status: 'STALE', claimedAt: null },
    });
    if (count > 0) {
      this.logger.warn(
        `Reset ${count} stuck PENDING translation state row(s) to STALE`,
      );
    }
  }

  /** Weekly orphan cleanup — a state row whose entity was deleted more than
   * a day ago (the 1-day guard avoids racing a same-transaction create). */
  @Cron('0 40 3 * * 0', {
    name: 'menuTranslationStateReap',
    waitForCompletion: true,
  })
  async reapOrphans(): Promise<void> {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    let total = 0;
    for (const [entityType, table] of [
      ['CATEGORY', 'menu_category'],
      ['ITEM', 'menu_item'],
      ['OPTION', 'menu_option'],
    ] as const) {
      const result = await this.prisma.$executeRawUnsafe(
        `DELETE FROM "menu_translation_state" s
         WHERE s."entityType" = $1
           AND s."updatedAt" < $2
           AND NOT EXISTS (SELECT 1 FROM "${table}" t WHERE t."id" = s."entityId")`,
        entityType,
        cutoff,
      );
      total += Number(result) || 0;
    }
    if (total > 0) {
      this.logger.log(`Reaped ${total} orphaned translation state row(s)`);
    }
  }
}
