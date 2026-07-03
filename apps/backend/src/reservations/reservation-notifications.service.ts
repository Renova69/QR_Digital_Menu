import { Injectable, Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';

type NotifyKind = 'RECEIVED' | 'CONFIRMED' | 'DECLINED';

interface NotifyInput {
  restaurantId: string;
  guestEmail?: string | null;
  guestName: string;
  startsAt: Date;
  referenceCode: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Fire-and-forget guest email for reservation lifecycle events. Email only
 * (cheaper than SMS); reuses the Resend transport already used for auth OTP.
 * Never throws into the caller — a failed send must not roll back a booking or
 * a status change. Durable outbox/retry is a documented Phase-1.5 upgrade.
 */
@Injectable()
export class ReservationNotificationsService {
  private readonly logger = new Logger(ReservationNotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  notify(kind: NotifyKind, input: NotifyInput): void {
    void this.send(kind, input).catch((err) =>
      this.logger.error(
        `Reservation ${kind} email failed for ${input.referenceCode}`,
        err instanceof Error ? err.message : err,
      ),
    );
  }

  private async send(kind: NotifyKind, input: NotifyInput): Promise<void> {
    const to = input.guestEmail?.trim();
    if (!to) return;

    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: input.restaurantId },
      select: { name: true, timezone: true, contactInfo: true },
    });
    if (!restaurant) return;

    const when = DateTime.fromJSDate(input.startsAt)
      .setZone(restaurant.timezone || 'Europe/Sofia')
      .toFormat('cccc, dd LLL yyyy HH:mm');

    const { subject, intro } = this.template(
      kind,
      restaurant.name,
      input.guestName,
      when,
    );

    const html = `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2 style="margin:0 0 8px">${escapeHtml(restaurant.name)}</h2>
        <p style="font-size:15px;color:#333">${intro}</p>
        <p style="font-size:14px;color:#555">
          <strong>${escapeHtml(when)}</strong><br/>
          ${escapeHtml('Reference')}: <strong>${escapeHtml(
            input.referenceCode,
          )}</strong>
        </p>
        ${
          restaurant.contactInfo
            ? `<p style="font-size:13px;color:#888">${escapeHtml(
                restaurant.contactInfo,
              )}</p>`
            : ''
        }
      </div>`;
    const text = `${stripTags(intro)}\n\n${when}\nReference: ${input.referenceCode}`;

    const isDev = process.env.NODE_ENV !== 'production';
    if (isDev || !process.env.RESEND_API_KEY) {
      this.logger.log(`[dev] Reservation ${kind} email to ${to}: ${subject}`);
      return;
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || 'noreply@yourdomain.com',
        to: [to],
        subject,
        text,
        html,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      this.logger.error(
        `Resend reservation email failed (${res.status}): ${detail.slice(0, 200)}`,
      );
    }
  }

  private template(
    kind: NotifyKind,
    restaurantName: string,
    guestName: string,
    when: string,
  ): { subject: string; intro: string } {
    const name = escapeHtml(guestName);
    const rest = escapeHtml(restaurantName);
    switch (kind) {
      case 'CONFIRMED':
        return {
          subject: `Reservation confirmed — ${restaurantName}`,
          intro: `Hi ${name}, your reservation at <strong>${rest}</strong> is <strong>confirmed</strong>. See you soon!`,
        };
      case 'DECLINED':
        return {
          subject: `Reservation update — ${restaurantName}`,
          intro: `Hi ${name}, unfortunately your reservation request at <strong>${rest}</strong> could not be accepted. Please contact us for other options.`,
        };
      default:
        return {
          subject: `Reservation request received — ${restaurantName}`,
          intro: `Hi ${name}, we've received your reservation request at <strong>${rest}</strong>. We'll confirm shortly — this is not yet a confirmation.`,
        };
    }
  }
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '');
}
