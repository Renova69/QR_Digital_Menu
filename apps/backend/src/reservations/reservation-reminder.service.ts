import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationDeliveryService } from '../notifications/notification-delivery.service';
import { ReservationNotificationsService } from './reservation-notifications.service';

// A booking becomes "due for reminder" once it is confirmed and its start is
// within this many hours. 24h is the classic no-show-reducing reminder window.
const REMINDER_WINDOW_HOURS = 24;

// Cap per tick so a backlog can never blow up a single run.
const REMINDER_BATCH = 200;

/**
 * Queues a 24-hour reminder for each requested channel. Tenant-scoped durable
 * identities make overlapping sweeps idempotent; delivery workers claim rows
 * with leases and only provider acceptance advances `reminderSentAt`.
 */
@Injectable()
export class ReservationReminderService {
  private readonly logger = new Logger(ReservationReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: ReservationNotificationsService,
    private readonly deliveries: NotificationDeliveryService,
  ) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  async runReminderSweep(): Promise<void> {
    await this.sweep();
  }

  /** Extracted for direct unit invocation. Returns how many were queued. */
  async sweep(now: Date = new Date()): Promise<number> {
    const windowEnd = new Date(
      now.getTime() + REMINDER_WINDOW_HOURS * 60 * 60 * 1000,
    );

    const due = await this.prisma.reservation.findMany({
      where: {
        status: 'CONFIRMED',
        reminderSentAt: null,
        startsAt: { gt: now, lte: windowEnd },
        restaurant: { isActive: true },
      },
      select: {
        id: true,
        restaurantId: true,
        guestEmail: true,
        guestPhone: true,
        guestName: true,
        startsAt: true,
        referenceCode: true,
        notifyByEmail: true,
        notifyBySms: true,
        notificationLocale: true,
        manageToken: true,
        adultsCount: true,
        childrenCount: true,
        occasion: true,
        customerNotes: true,
        customerPreferences: true,
        preferredZone: true,
        allergyNotes: true,
      },
      take: REMINDER_BATCH,
    });
    if (due.length === 0) return 0;

    let dispatched = 0;
    for (const r of due) {
      try {
        const prepared = await this.notifications.prepare('REMINDER', {
          restaurantId: r.restaurantId,
          guestEmail: r.guestEmail,
          guestPhone: r.guestPhone,
          guestName: r.guestName,
          startsAt: r.startsAt,
          referenceCode: r.referenceCode,
          notifyByEmail: r.notifyByEmail,
          notifyBySms: r.notifyBySms,
          notificationLocale: r.notificationLocale,
          manageToken: r.manageToken,
          adultsCount: r.adultsCount,
          childrenCount: r.childrenCount,
          occasion: r.occasion,
          customerNotes: r.customerNotes,
          customerPreferences: r.customerPreferences,
          preferredZone: r.preferredZone,
          allergyNotes: r.allergyNotes,
        });
        if (prepared.length === 0) {
          this.logger.error(
            `Reservation reminder has no deliverable channel for ${r.id}`,
          );
          continue;
        }
        await this.deliveries.enqueueMany(
          prepared.map((delivery) => ({
            restaurantId: r.restaurantId,
            sourceType: 'RESERVATION_REMINDER',
            sourceId: r.id,
            deduplicationKey: `${r.id}:reservation-reminder`,
            channel: delivery.channel,
            payload: delivery.payload,
          })),
        );
        dispatched += 1;
      } catch (error) {
        this.logger.error(
          `Reservation reminder failed for ${r.id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    if (dispatched > 0) {
      this.logger.log(`Queued ${dispatched} reservation reminder(s)`);
    }
    return dispatched;
  }
}
