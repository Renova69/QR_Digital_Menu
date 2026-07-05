import { Injectable, Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';
import {
  getReservationNotificationCopy,
  normalizeReservationNotificationLocale,
  type ReservationNotificationKind,
} from './reservation-notification-copy';

// Kinds where the private manage link is still actionable for the guest.
const MANAGEABLE_KINDS = new Set<ReservationNotificationKind>([
  'RECEIVED',
  'CONFIRMED',
  'REMINDER',
]);

interface NotifyInput {
  restaurantId: string;
  guestEmail?: string | null;
  guestPhone?: string | null;
  guestName: string;
  startsAt: Date;
  referenceCode: string;
  notificationLocale?: string | null;
  // Feature 1: which channels the guest opted into. Defaults keep the prior
  // email-only behaviour when a caller doesn't pass them.
  notifyByEmail?: boolean;
  notifyBySms?: boolean;
  // Feature 2: token for the guest's private manage link (view/modify/cancel).
  manageToken?: string | null;
}

interface OwnerNotifyInput {
  restaurantId: string;
  notifyEmail?: string | null;
  notifyPhone?: string | null;
  guestName: string;
  guestPhone: string;
  startsAt: Date;
  partySize: number;
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
 * Fire-and-forget guest notifications for reservation lifecycle events. Email
 * reuses the Resend transport already used for auth OTP; SMS uses Twilio
 * (Feature 1). Dev/test logs instead of sending; production reports missing
 * transport configuration without logging guest PII. Never throws into
 * the caller — a failed send must not roll back a booking or a status change.
 * Durable outbox/retry is a documented Phase-1.5 upgrade.
 */
@Injectable()
export class ReservationNotificationsService {
  private readonly logger = new Logger(ReservationNotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  notify(kind: ReservationNotificationKind, input: NotifyInput): void {
    void this.send(kind, input).catch((err) =>
      this.logger.error(
        `Reservation ${kind} notification failed for ${input.referenceCode}`,
        err instanceof Error ? err.message : err,
      ),
    );
  }

  private async send(
    kind: ReservationNotificationKind,
    input: NotifyInput,
  ): Promise<void> {
    // Default to email when the caller didn't express a preference, preserving
    // the original behaviour for staff/manual paths.
    const wantEmail = input.notifyByEmail ?? true;
    const wantSms = input.notifyBySms ?? false;
    const to = input.guestEmail?.trim();
    const phone = input.guestPhone?.trim();
    if (!(wantEmail && to) && !(wantSms && phone)) return;

    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: input.restaurantId },
      select: { name: true, timezone: true, contactInfo: true },
    });
    if (!restaurant) return;

    const notificationLocale = normalizeReservationNotificationLocale(
      input.notificationLocale,
    );
    const copy = getReservationNotificationCopy(notificationLocale);
    const when = DateTime.fromJSDate(input.startsAt)
      .setZone(restaurant.timezone || 'Europe/Sofia')
      .setLocale(notificationLocale)
      .toLocaleString({
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      });

    // Feature 2: only surface the manage link on live bookings — a declined or
    // cancelled booking has nothing to manage.
    const manageLink =
      input.manageToken && MANAGEABLE_KINDS.has(kind)
        ? this.buildManageLink(
            input.restaurantId,
            input.manageToken,
            notificationLocale,
          )
        : null;

    const { subject, intro } = this.template(
      kind,
      restaurant.name,
      input.guestName,
      notificationLocale,
    );
    // `intro` is HTML (escaped values + <strong> tags). For the SMS and the
    // plain-text email part, strip the tags AND decode the entities so a name
    // like `Bar & Grill` reads correctly instead of `Bar &amp; Grill`.
    const introText = decodeEntities(stripTags(intro));

    if (wantEmail && to) {
      const html = `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2 style="margin:0 0 8px">${escapeHtml(restaurant.name)}</h2>
        <p style="font-size:15px;color:#333">${intro}</p>
        <p style="font-size:14px;color:#555">
          <strong>${escapeHtml(when)}</strong><br/>
          ${escapeHtml(copy.reference)}: <strong>${escapeHtml(
            input.referenceCode,
          )}</strong>
        </p>
        ${
          manageLink
            ? `<p style="font-size:14px;margin:16px 0">
                 <a href="${escapeHtml(manageLink)}" style="display:inline-block;padding:10px 18px;background:#4f46e5;color:#fff;border-radius:8px;text-decoration:none">${escapeHtml(copy.manage)}</a>
               </p>
               <p style="font-size:12px;color:#888">${escapeHtml(copy.manageHelp)}</p>`
            : ''
        }
        ${
          restaurant.contactInfo
            ? `<p style="font-size:13px;color:#888">${escapeHtml(
                restaurant.contactInfo,
              )}</p>`
            : ''
        }
      </div>`;
      const text = `${introText}\n\n${when}\n${copy.reference}: ${input.referenceCode}${
        manageLink ? `\n\n${copy.manage}: ${manageLink}` : ''
      }`;
      await this.sendEmail(to, subject, html, text, `guest ${kind}`);
    }

    if (wantSms && phone) {
      const body = `${restaurant.name}: ${introText} ${when}. ${copy.refShort} ${input.referenceCode}${
        manageLink ? ` ${copy.manage}: ${manageLink}` : ''
      }`;
      await this.sendSms(phone, body, `guest ${kind}`);
    }
  }

  /** Public guest-facing manage URL. FRONTEND_URL drives cross-origin prod. */
  private buildManageLink(
    restaurantId: string,
    token: string,
    notificationLocale: string,
  ): string {
    const base = (process.env.FRONTEND_URL || 'http://localhost:3001').replace(
      /\/+$/,
      '',
    );
    const params = new URLSearchParams({
      r: restaurantId,
      token,
      lang: notificationLocale,
    });
    return `${base}/booking/manage?${params.toString()}`;
  }

  /**
   * Fix 5: notify the owner/manager (settings.notifyEmail / notifyPhone) when a
   * new booking arrives. Fire-and-forget.
   */
  notifyOwner(input: OwnerNotifyInput): void {
    void this.sendOwner(input).catch((err) =>
      this.logger.error(
        `Owner new-booking notification failed for ${input.referenceCode}`,
        err instanceof Error ? err.message : err,
      ),
    );
  }

  private async sendOwner(input: OwnerNotifyInput): Promise<void> {
    const email = input.notifyEmail?.trim();
    const phone = input.notifyPhone?.trim();
    if (!email && !phone) return;

    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: input.restaurantId },
      select: { name: true, timezone: true },
    });
    if (!restaurant) return;

    const when = DateTime.fromJSDate(input.startsAt)
      .setZone(restaurant.timezone || 'Europe/Sofia')
      .toFormat('cccc, dd LLL yyyy HH:mm');

    if (email) {
      const subject = `New reservation request — ${input.guestName} (${input.partySize})`;
      const html = `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2 style="margin:0 0 8px">${escapeHtml(restaurant.name)}</h2>
        <p style="font-size:15px;color:#333">New reservation request:</p>
        <p style="font-size:14px;color:#555">
          <strong>${escapeHtml(input.guestName)}</strong> · ${input.partySize} ${escapeHtml('guests')}<br/>
          ${escapeHtml(when)}<br/>
          ${escapeHtml(input.guestPhone)}<br/>
          Reference: <strong>${escapeHtml(input.referenceCode)}</strong>
        </p>
      </div>`;
      const text = `New reservation: ${input.guestName} (${input.partySize})\n${when}\n${input.guestPhone}\nReference: ${input.referenceCode}`;
      await this.sendEmail(email, subject, html, text, 'owner new-booking');
    }

    if (phone) {
      const body = `New booking: ${input.guestName} (${input.partySize}) ${when}. ${input.guestPhone}. Ref ${input.referenceCode}`;
      await this.sendSms(phone, body, 'owner new-booking');
    }
  }

  /** Shared Resend transport (dev logs instead of sending). Never throws. */
  private async sendEmail(
    to: string,
    subject: string,
    html: string,
    text: string,
    context: string,
  ): Promise<void> {
    const isDev = process.env.NODE_ENV !== 'production';
    if (isDev || !process.env.RESEND_API_KEY) {
      this.logger.log(
        `[dev] Reservation ${context} email to ${to}: ${subject}`,
      );
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

  /**
   * Twilio SMS transport (Feature 1). Dev/test logs instead of sending.
   * Production accepts either a Messaging Service SID or direct From number,
   * and reports incomplete configuration without including guest PII.
   */
  private async sendSms(
    to: string,
    body: string,
    context: string,
  ): Promise<void> {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_FROM_NUMBER;
    const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
    const isDev = process.env.NODE_ENV !== 'production';
    if (isDev) {
      this.logger.log(`[dev] Reservation ${context} SMS to ${to}: ${body}`);
      return;
    }
    if (!sid || !token || (!from && !messagingServiceSid)) {
      const missing = [
        !sid ? 'TWILIO_ACCOUNT_SID' : null,
        !token ? 'TWILIO_AUTH_TOKEN' : null,
        !from && !messagingServiceSid
          ? 'TWILIO_FROM_NUMBER or TWILIO_MESSAGING_SERVICE_SID'
          : null,
      ].filter(Boolean);
      this.logger.error(
        `Reservation SMS disabled in production: missing ${missing.join(', ')}`,
      );
      return;
    }

    const form = new URLSearchParams({
      To: to,
      Body: body,
    });
    if (messagingServiceSid) {
      form.set('MessagingServiceSid', messagingServiceSid);
    } else {
      form.set('From', from!);
    }

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
      },
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      this.logger.error(
        `Twilio reservation SMS failed (${res.status}): ${detail.slice(0, 200)}`,
      );
    }
  }

  private template(
    kind: ReservationNotificationKind,
    restaurantName: string,
    guestName: string,
    notificationLocale?: string | null,
  ): { subject: string; intro: string } {
    const copy = getReservationNotificationCopy(notificationLocale);
    const name = escapeHtml(guestName);
    const rest = escapeHtml(restaurantName);
    return {
      subject: fillTemplate(copy.subjects[kind], {
        restaurant: restaurantName,
      }),
      intro: fillTemplate(copy.messages[kind], {
        name,
        restaurant: rest,
      }),
    };
  }
}

function fillTemplate(
  template: string,
  values: Record<string, string>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match,
  );
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '');
}

// Reverse escapeHtml for the plain-text/SMS channels. `&amp;` is decoded LAST so
// an escaped `&lt;` (`&amp;lt;`) round-trips to `&lt;`, not `<`.
function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}
