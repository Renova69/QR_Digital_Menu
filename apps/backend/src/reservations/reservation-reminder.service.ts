import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { ReservationNotificationsService } from './reservation-notifications.service';

// A booking becomes "due for reminder" once it is confirmed and its start is
// within this many hours. 24h is the classic no-show-reducing reminder window.
const REMINDER_WINDOW_HOURS = 24;

// Cap per tick so a backlog can never blow up a single run.
const REMINDER_BATCH = 200;

/**
 * Feature 1: fires a one-time 24-hour reminder for confirmed reservations over
 * the guest's chosen channels. `reminderSentAt` is claimed with a compare-and-
 * swap BEFORE dispatch, so a booking is reminded at most once even if the cron
 * overlaps or a delivery is redelivered — deliberately at-most-once, because a
 * duplicate SMS costs money and a missed reminder is low-harm. A transient send
 * failure is therefore NOT retried; a durable outbox is the Phase-1.5 upgrade.
 */
@Injectable()
export class ReservationReminderService {
  private readonly logger = new Logger(ReservationReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: ReservationNotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  async runReminderSweep(): Promise<void> {
    await this.sweep();
  }

  /** Extracted for direct unit invocation. Returns how many were reminded. */
  async sweep(now: Date = new Date()): Promise<number> {
    const windowEnd = new Date(
      now.getTime() + REMINDER_WINDOW_HOURS * 60 * 60 * 1000,
    );

    const due = await this.prisma.reservation.findMany({
      where: {
        status: 'CONFIRMED',
        reminderSentAt: null,
        startsAt: { gt: now, lte: windowEnd },
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
      // Claim the row first (CAS on reminderSentAt still null) so a concurrent
      // run or a redelivery can't double-send. Only the winner dispatches.
      const { count } = await this.prisma.reservation.updateMany({
        where: { id: r.id, reminderSentAt: null },
        data: { reminderSentAt: now },
      });
      if (count === 0) continue;

      dispatched += 1;
      await this.notifications.notify('REMINDER', {
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
    }

    if (dispatched > 0) {
      this.logger.log(`Sent ${dispatched} reservation reminder(s)`);
    }
    return dispatched;
  }
}
