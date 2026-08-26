import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { captureException, SentryCron } from '@sentry/nestjs';
import { createHash } from 'crypto';
import { cronMonitor } from '../common/cron-monitor';
import { PrismaService } from '../prisma/prisma.service';

type ViewDef = { name: string; create: string; index: string };

/**
 * Prisma's interactive-transaction default is 5s. That is not a deliberate
 * budget for a REFRESH MATERIALIZED VIEW — it is just the default nobody
 * overrode, and it scales with the data while the work does too.
 *
 * To be clear about the size of the problem: at the time of writing the whole
 * database is ~50 MB and order_item holds ~5.4k rows, so a refresh completes
 * in milliseconds and 5s is roughly 500x more headroom than needed. This is a
 * latent trap, not a live incident — it only bites at a couple of orders of
 * magnitude more data.
 *
 * It is worth setting anyway because the cost is zero (a larger budget cannot
 * slow a fast transaction) and because these two paths are the ones where a
 * timeout would be least obvious. The bound stays modest rather than unlimited
 * for two real reasons: a plain, non-CONCURRENT refresh holds ACCESS EXCLUSIVE
 * on each view, and the transaction occupies one of only ten pooled
 * connections for its whole duration.
 */
const REFRESH_TX_OPTIONS = { timeout: 60_000, maxWait: 10_000 } as const;

/**
 * createViews is version-gated — an unchanged deploy does zero DDL — but a
 * definition change DROPs and rebuilds every view, which costs more than a
 * refresh. It also runs inside onModuleInit, so it delays app.listen(); the
 * budget stays inside Cloud Run's startup allowance rather than matching the
 * refresh ceiling.
 */
const CREATE_TX_OPTIONS = { timeout: 90_000, maxWait: 10_000 } as const;

@Injectable()
export class DashboardViewsService implements OnModuleInit {
  private readonly logger = new Logger(DashboardViewsService.name);
  private ready = false;
  private refreshing = false;

  constructor(private readonly prisma: PrismaService) {}

  // Materialized-view definitions. Each carries a content hash stamped into the
  // view's COMMENT; createViews only DROP+CREATEs when the hash changes, so a
  // plain pod restart is a no-op instead of an expensive full rebuild.
  private readonly viewDefs: ViewDef[] = [
    {
      name: 'mv_daily_stats',
      create: `
      CREATE MATERIALIZED VIEW mv_daily_stats AS
      SELECT
        o."restaurantId",
        DATE_TRUNC('day', o."createdAt") AS day_utc,
        COUNT(*)::int                    AS order_count,
        COALESCE(SUM(o."totalPrice"), 0) AS revenue
      FROM customer_order o
      WHERE o.status NOT IN ('CANCELED', 'PENDING_PAYMENT')
      GROUP BY o."restaurantId", DATE_TRUNC('day', o."createdAt")`,
      index: `CREATE UNIQUE INDEX mv_daily_stats_uid ON mv_daily_stats ("restaurantId", day_utc)`,
    },
    {
      name: 'mv_peak_hours',
      create: `
      CREATE MATERIALIZED VIEW mv_peak_hours AS
      SELECT
        o."restaurantId",
        DATE_TRUNC('day', o."createdAt")        AS day_utc,
        EXTRACT(HOUR FROM o."createdAt")::int   AS hour_utc,
        COUNT(*)::int                           AS order_count,
        COALESCE(SUM(o."totalPrice"), 0)        AS revenue
      FROM customer_order o
      WHERE o.status NOT IN ('CANCELED', 'PENDING_PAYMENT')
      GROUP BY o."restaurantId", DATE_TRUNC('day', o."createdAt"), EXTRACT(HOUR FROM o."createdAt")`,
      index: `CREATE UNIQUE INDEX mv_peak_hours_uid ON mv_peak_hours ("restaurantId", day_utc, hour_utc)`,
    },
    {
      name: 'mv_item_stats',
      create: `
      CREATE MATERIALIZED VIEW mv_item_stats AS
      SELECT
        o."restaurantId",
        COALESCE(oi."menuItemId", 'deleted:' || oi."itemName") AS "itemKey",
        oi."menuItemId",
        COALESCE(mi.name, oi."itemName")               AS item_name,
        DATE_TRUNC('day', o."createdAt")               AS day_utc,
        SUM(oi.quantity)::int                          AS total_quantity,
        COALESCE(SUM(oi."unitPriceWithOptions" * oi.quantity), 0) AS total_revenue
      FROM order_item oi
      JOIN customer_order o  ON oi."orderId"    = o.id
      LEFT JOIN menu_item mi ON oi."menuItemId" = mi.id
      WHERE o.status NOT IN ('CANCELED', 'PENDING_PAYMENT')
      GROUP BY o."restaurantId", COALESCE(oi."menuItemId", 'deleted:' || oi."itemName"),
               oi."menuItemId", COALESCE(mi.name, oi."itemName"), DATE_TRUNC('day', o."createdAt")`,
      index: `CREATE UNIQUE INDEX mv_item_stats_uid ON mv_item_stats ("restaurantId", "itemKey", day_utc)`,
    },
  ];

  private viewVersion(def: ViewDef): string {
    return createHash('sha1')
      .update(def.create + def.index)
      .digest('hex')
      .slice(0, 16);
  }

  isReady(): boolean {
    return this.ready;
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.createViews();
      this.ready = true;
      this.logger.log('Analytics materialized views initialised');
    } catch (err) {
      // Degrading to raw queries keeps the dashboard working, so this is a
      // warning rather than a boot failure — but it must still reach Sentry.
      // See refreshViews for why: nothing else reports a swallowed cron error.
      captureException(err, {
        tags: { subsystem: 'dashboard-views', phase: 'create' },
      });
      this.logger.warn(
        'Materialized views unavailable — falling back to raw queries',
        err,
      );
    }
  }

  @Cron(CronExpression.EVERY_HOUR, {
    name: 'dashboardMaterializedViewRefresh',
    waitForCompletion: true,
  })
  @SentryCron(
    'dashboard-materialized-view-refresh',
    cronMonitor(CronExpression.EVERY_HOUR, {
      maxRuntimeMinutes: 15,
      checkinMarginMinutes: 15,
      failureIssueThreshold: 2,
    }),
  )
  async refreshViews(): Promise<void> {
    // In-process guard avoids duplicate refreshes inside one pod; the advisory
    // transaction lock below coordinates all pods sharing the same Postgres DB.
    if (!this.ready || this.refreshing) return;
    this.refreshing = true;
    try {
      const refreshed = await this.prisma.$transaction(async (tx) => {
        const [lock] = await tx.$queryRaw<{ locked: boolean }[]>`
          SELECT pg_try_advisory_xact_lock(hashtext('dashboard_views_refresh')) AS locked
        `;
        if (!lock?.locked) return false;

        // Plain REFRESH (NOT CONCURRENTLY): `REFRESH ... CONCURRENTLY` cannot run
        // inside a transaction block (Postgres errors), but we need a transaction
        // for the advisory xact-lock that coordinates pods on PgBouncer (session
        // locks are unsafe under transaction pooling). These views are small
        // per-restaurant aggregates, so the brief ACCESS EXCLUSIVE lock during a
        // plain refresh is an acceptable trade for a refresh that actually runs.
        await tx.$executeRawUnsafe('REFRESH MATERIALIZED VIEW mv_daily_stats');
        await tx.$executeRawUnsafe('REFRESH MATERIALIZED VIEW mv_peak_hours');
        await tx.$executeRawUnsafe('REFRESH MATERIALIZED VIEW mv_item_stats');
        return true;
      }, REFRESH_TX_OPTIONS);
      if (refreshed) this.logger.log('Analytics views refreshed');
    } catch (err) {
      // The only capture point for this failure. AllExceptionsFilter reports
      // HTTP errors, but a cron that catches its own exception reaches nothing
      // — so a refresh that fails every hour would leave the dashboard serving
      // silently stale numbers with no error anywhere. Wrong analytics that
      // look right are worse than analytics that are visibly broken.
      captureException(err, {
        tags: { subsystem: 'dashboard-views', phase: 'refresh' },
      });
      this.logger.warn('View refresh failed', err);
    } finally {
      this.refreshing = false;
    }
  }

  private async createViews(): Promise<void> {
    // Serialize across pods + version-gate per view: a view is only DROPped and
    // rebuilt when its content hash differs from the hash stamped in its COMMENT.
    // A normal restart (unchanged definitions) does zero DDL. DDL here is plain
    // (no CONCURRENTLY), so running it inside a transaction is safe.
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('dashboard_views_create'))`;

      for (const def of this.viewDefs) {
        const version = this.viewVersion(def);
        const rows = await tx.$queryRawUnsafe<{ comment: string | null }[]>(
          `SELECT obj_description(to_regclass($1), 'pg_class') AS comment`,
          def.name,
        );
        if (rows?.[0]?.comment === `v:${version}`) {
          continue; // up to date — skip the expensive rebuild
        }

        await tx.$executeRawUnsafe(
          `DROP MATERIALIZED VIEW IF EXISTS ${def.name} CASCADE`,
        );
        await tx.$executeRawUnsafe(def.create);
        await tx.$executeRawUnsafe(def.index);
        await tx.$executeRawUnsafe(
          `COMMENT ON MATERIALIZED VIEW ${def.name} IS 'v:${version}'`,
        );
        this.logger.log(`Rebuilt ${def.name} (v:${version})`);
      }
    }, CREATE_TX_OPTIONS);
  }
}
