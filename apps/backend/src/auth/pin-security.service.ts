import { Injectable, Logger } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';

/**
 * Detection for staff PIN-login abuse.
 *
 * Alert-only by design. The blocking control stays per-device lockout and
 * nothing here introduces a restaurant-wide one: an attacker who could lock out
 * a whole restaurant by deliberately failing PINs would have turned the security
 * control into the attack, taking every till offline mid-service.
 */

/** A 4-digit PIN is 10,000 combinations; five wrong ones locks that device. */
const MAX_ATTEMPTS = 5;

// Short-window signals. Two distinct devices locking is the strong signal: the
// same volume of failures concentrated in a pattern that does not happen by
// accident. The raw count is set well above a plausible shift change, where a
// handful of staff fat-fingering PINs on a greasy tablet is ordinary.
const SHORT_WINDOW_MS = 15 * 60 * 1000;
const MULTI_DEVICE_LOCK_THRESHOLD = 2;
const RAW_SPIKE_THRESHOLD = 20;

// Slow burn. Per-device lockout caps an attacker at five tries, so a patient one
// doing a few attempts an hour never trips a 15-minute window and never even
// locks. Concentrating this on a single device keeps it specific: 15 failures on
// one tablet over a week is not someone forgetting their PIN.
const SLOW_BURN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const SLOW_BURN_THRESHOLD = 15;

// Restaurant-wide aggregate. Dashboard only -- a full trading day of failures
// across every device is noisier than the 15-minute thresholds and would train
// owners to ignore the alerts that matter.
const AGGREGATE_WINDOW_MS = 24 * 60 * 60 * 1000;
const AGGREGATE_THRESHOLD = 20;

const DEDUPE_MS: Record<string, number> = {
  MULTI_DEVICE_LOCKOUT: SHORT_WINDOW_MS,
  PIN_SPIKE: SHORT_WINDOW_MS,
  DEVICE_SLOW_BURN: AGGREGATE_WINDOW_MS,
  RESTAURANT_AGGREGATE: AGGREGATE_WINDOW_MS,
};

/** Kinds that reach a person. The rest are dashboard-only. */
const PUSH_KINDS = new Set([
  'MULTI_DEVICE_LOCKOUT',
  'PIN_SPIKE',
  'DEVICE_SLOW_BURN',
]);

const FAILURE_STATUSES = ['INVALID_PIN', 'LOCKED'];

@Injectable()
export class PinSecurityService {
  private readonly logger = new Logger(PinSecurityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  /**
   * Evaluate the signals after a failed PIN attempt has been audited.
   *
   * Called fire-and-forget from the auth path: detection must never be able to
   * fail a login, delay one, or turn a wrong PIN into a 500.
   *
   * @param deviceTokenId the DeviceEnrollmentToken row id, never the device
   *   token itself. Nothing credential-bearing may be passed here or added to
   *   the values below: they are attached to Sentry events on failure, and a
   *   PIN, a raw device token or a token hash would then be sitting in an
   *   external error tracker. The row id is opaque and useless on its own.
   */
  async evaluate(
    restaurantId: string,
    deviceTokenId: string,
    now: Date = new Date(),
  ): Promise<string[]> {
    try {
      const raised: string[] = [];
      const since = (ms: number) => new Date(now.getTime() - ms);

      const [shortWindow, deviceSlowBurn, dayCount] = await Promise.all([
        this.prisma.staffPinLoginAudit.findMany({
          where: {
            restaurantId,
            status: { in: FAILURE_STATUSES },
            createdAt: { gte: since(SHORT_WINDOW_MS) },
          },
          select: { status: true, deviceTokenId: true },
        }),
        this.prisma.staffPinLoginAudit.count({
          where: {
            restaurantId,
            deviceTokenId,
            status: { in: FAILURE_STATUSES },
            createdAt: { gte: since(SLOW_BURN_WINDOW_MS) },
          },
        }),
        this.prisma.staffPinLoginAudit.count({
          where: {
            restaurantId,
            status: { in: FAILURE_STATUSES },
            createdAt: { gte: since(AGGREGATE_WINDOW_MS) },
          },
        }),
      ]);

      const lockedDevices = new Set(
        shortWindow
          .filter((row) => row.status === 'LOCKED')
          .map((row) => row.deviceTokenId),
      );

      if (lockedDevices.size >= MULTI_DEVICE_LOCK_THRESHOLD) {
        if (
          await this.raise(restaurantId, 'MULTI_DEVICE_LOCKOUT', null, now, {
            devicesLocked: lockedDevices.size,
            windowMinutes: SHORT_WINDOW_MS / 60000,
          })
        ) {
          raised.push('MULTI_DEVICE_LOCKOUT');
        }
      }

      if (shortWindow.length >= RAW_SPIKE_THRESHOLD) {
        if (
          await this.raise(restaurantId, 'PIN_SPIKE', null, now, {
            failures: shortWindow.length,
            windowMinutes: SHORT_WINDOW_MS / 60000,
          })
        ) {
          raised.push('PIN_SPIKE');
        }
      }

      if (deviceSlowBurn >= SLOW_BURN_THRESHOLD) {
        if (
          await this.raise(
            restaurantId,
            'DEVICE_SLOW_BURN',
            deviceTokenId,
            now,
            { failures: deviceSlowBurn, windowDays: 7 },
          )
        ) {
          raised.push('DEVICE_SLOW_BURN');
        }
      }

      if (dayCount >= AGGREGATE_THRESHOLD) {
        if (
          await this.raise(restaurantId, 'RESTAURANT_AGGREGATE', null, now, {
            failures: dayCount,
            windowHours: 24,
          })
        ) {
          raised.push('RESTAURANT_AGGREGATE');
        }
      }

      return raised;
    } catch (error) {
      // Advisory: a failure here must never surface as a login error or change
      // what the caller sees. But not-propagated is not the same as discarded --
      // nothing else reports a swallowed detection failure, so silent loss here
      // would mean PIN monitoring could be dead for weeks with no signal.
      Sentry.captureException(error, {
        tags: { subsystem: 'pin-security', phase: 'evaluate' },
        // Opaque row ids only. See the note on this method's parameters: no
        // PIN, raw device token or token hash may ever reach here.
        extra: { restaurantId, deviceTokenId },
      });
      this.logger.error(
        `PIN security evaluation failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return [];
    }
  }

  /**
   * Record an alert unless an equivalent one is already inside its dedupe
   * window, and notify for the kinds that reach a person.
   *
   * @returns whether a new alert was recorded.
   */
  private async raise(
    restaurantId: string,
    kind: string,
    deviceTokenId: string | null,
    now: Date,
    detail: Record<string, number>,
  ): Promise<boolean> {
    const dedupeWindow = DEDUPE_MS[kind] ?? SHORT_WINDOW_MS;
    const scope = `${restaurantId}:${kind}:${deviceTokenId ?? 'restaurant'}`;
    const recorded = await this.prisma.$transaction(async (tx) => {
      // findFirst + create is not a dedupe boundary on its own: two Cloud Run
      // instances can both observe no row and both alert. A transaction-scoped
      // advisory lock serializes this exact signal scope across every instance.
      // Transaction scope is essential with PgBouncer transaction pooling: the
      // lock is released with this transaction and never leaks to a later user
      // of the same database connection.
      // executeRaw avoids asking Prisma to deserialize PostgreSQL's `void`
      // return type from pg_advisory_xact_lock.
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${scope}, 0))
      `;

      const existing = await tx.securityAlert.findFirst({
        where: {
          restaurantId,
          kind,
          // Device-scoped signals dedupe per device, so one noisy tablet cannot
          // suppress an alert about a different one.
          deviceTokenId,
          createdAt: { gte: new Date(now.getTime() - dedupeWindow) },
        },
        select: { id: true },
      });
      if (existing) return false;

      await tx.securityAlert.create({
        data: { restaurantId, kind, deviceTokenId, detail },
      });
      return true;
    });
    if (!recorded) return false;

    if (PUSH_KINDS.has(kind)) {
      void this.notifyOwner(restaurantId, kind, detail);
    }
    return true;
  }

  /**
   * Push to the restaurant owner.
   *
   * Deliberately not email: there is no shared mailer in this codebase (Resend
   * is called inline in AuthService), and introducing one belongs in its own
   * change rather than inside a detection feature.
   */
  private async notifyOwner(
    restaurantId: string,
    kind: string,
    detail: Record<string, number>,
  ): Promise<void> {
    try {
      const restaurant = await this.prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { ownerId: true, name: true },
      });
      if (!restaurant?.ownerId) return;

      const body =
        kind === 'MULTI_DEVICE_LOCKOUT'
          ? `${detail.devicesLocked} devices were locked out within ${detail.windowMinutes} minutes.`
          : kind === 'PIN_SPIKE'
            ? `${detail.failures} failed staff PIN attempts within ${detail.windowMinutes} minutes.`
            : `${detail.failures} failed staff PIN attempts on one device over ${detail.windowDays} days.`;

      await this.push.sendPushNotification(
        restaurant.ownerId,
        'Unusual staff PIN activity',
        body,
        '/dashboard?tab=settings',
      );
    } catch (error) {
      // The alert is already recorded and the dashboard will show it, so a
      // delivery failure is not data loss -- but a push channel that has quietly
      // stopped working must still be visible, or alerts stop reaching anyone
      // while the dashboard looks healthy.
      Sentry.captureException(error, {
        tags: { subsystem: 'pin-security', phase: 'notify' },
        // A restaurant id and a signal name. `detail` is deliberately not
        // included: it is only counts today, but it is the field most likely
        // to grow something identifying later.
        extra: { restaurantId, kind },
      });
      this.logger.warn(
        `Could not push PIN security alert: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /** Signals a restaurant's dashboard should currently surface. */
  async recentAlerts(restaurantId: string, now: Date = new Date()) {
    return this.prisma.securityAlert.findMany({
      where: {
        restaurantId,
        createdAt: { gte: new Date(now.getTime() - AGGREGATE_WINDOW_MS) },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        kind: true,
        deviceTokenId: true,
        detail: true,
        createdAt: true,
      },
    });
  }
}

export const PIN_SECURITY_THRESHOLDS = {
  MAX_ATTEMPTS,
  MULTI_DEVICE_LOCK_THRESHOLD,
  RAW_SPIKE_THRESHOLD,
  SLOW_BURN_THRESHOLD,
  AGGREGATE_THRESHOLD,
};
