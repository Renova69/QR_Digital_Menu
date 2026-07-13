import { Injectable, Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';
import {
  smsProvider,
  smsGatewayConfigured,
  sendViaSmsGateway,
} from '../common/sms/sms-gateway';
import {
  getReservationNotificationCopy,
  getReservationDetailLabels,
  getReservationSmsStatus,
  normalizeReservationNotificationLocale,
  type ReservationNotificationKind,
  type ReservationDetailLabels,
} from './reservation-notification-copy';

// Kinds where the private manage link is still actionable for the guest.
const MANAGEABLE_KINDS = new Set<ReservationNotificationKind>([
  'RECEIVED',
  'CONFIRMED',
  'REMINDER',
  'MODIFIED',
]);

// Kinds that describe an upcoming visit, so echoing the booking details the
// guest provided (party size, occasion, preferences, seating, notes, allergies)
// is useful. A decline/cancel has nothing to detail. MODIFIED especially wants
// the details block — it is the "here are your new details" confirmation.
const DETAIL_KINDS = new Set<ReservationNotificationKind>([
  'RECEIVED',
  'CONFIRMED',
  'REMINDER',
  'MODIFIED',
]);

// Guest-provided booking details surfaced in notifications. All optional so
// legacy/manual call paths that omit them keep the prior lean message.
interface BookingDetailFields {
  adultsCount?: number | null;
  childrenCount?: number | null;
  occasion?: string | null;
  customerNotes?: string | null;
  customerPreferences?: string[] | null;
  preferredZone?: string | null;
  allergyNotes?: string | null;
}

interface NotifyInput extends BookingDetailFields {
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

interface OwnerNotifyInput extends BookingDetailFields {
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

  async notify(
    kind: ReservationNotificationKind,
    input: NotifyInput,
  ): Promise<void> {
    await this.send(kind, input).catch((err) =>
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
    const manageable = !!input.manageToken && MANAGEABLE_KINDS.has(kind);
    // Email uses the full self-descriptive URL; SMS uses the short in-house
    // redirect (`{BACKEND_URL}/r/{token}`) to save characters. The token never
    // leaves our infra — no third-party shortener.
    const manageLink = manageable
      ? this.buildManageLink(
          input.restaurantId,
          input.manageToken!,
          notificationLocale,
        )
      : null;
    const shortManageLink = manageable
      ? this.buildShortManageLink(
          input.manageToken!,
          input.restaurantId,
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

    // Echo the guest-provided booking details on upcoming-visit notices. Email
    // gets the full block; SMS carries only headcount + allergies to keep the
    // segment count (and cost) down.
    const details = DETAIL_KINDS.has(kind)
      ? buildBookingDetails(
          getReservationDetailLabels(notificationLocale),
          input,
        )
      : EMPTY_DETAILS;

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
        ${details.htmlRows}
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
      const detailsText = details.textLines.length
        ? `\n\n${details.textLines.join('\n')}`
        : '';
      const text = `${introText}\n\n${when}\n${copy.reference}: ${input.referenceCode}${detailsText}${
        manageLink ? `\n\n${copy.manage}: ${manageLink}` : ''
      }`;
      await this.sendEmail(to, subject, html, text, `guest ${kind}`);
    }

    if (wantSms && phone) {
      // Terse SMS: restaurant · status · when · party size · ref · short link.
      // No prose intro, no allergy — those live in the email.
      const status = getReservationSmsStatus(notificationLocale, kind);
      const guests = details.smsExtra ? ` · ${details.smsExtra}` : '';
      const body = `${restaurant.name}: ${status}. ${when}${guests}. ${copy.refShort} ${input.referenceCode}${
        shortManageLink ? ` ${shortManageLink}` : ''
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
      lang: notificationLocale,
    });
    return `${base}/booking/manage?${params.toString()}#token=${token}`;
  }

  /**
   * Short in-house manage link for SMS: `{BACKEND_URL}/r/{token}`. The backend
   * `GET /r/:token` route resolves the restaurant + locale and 302-redirects to
   * the full frontend manage page, so the SMS drops the long query string. When
   * BACKEND_URL isn't set (local dev), fall back to the full frontend link so
   * the link still works instead of pointing at a non-existent short route.
   */
  private buildShortManageLink(
    token: string,
    restaurantId: string,
    notificationLocale: string,
  ): string {
    const backend = process.env.BACKEND_URL?.trim().replace(/\/+$/, '');
    if (backend) return `${backend}/r/${token}`;
    // No backend URL configured (local dev): fall back to the full frontend
    // link so the SMS link still resolves correctly.
    return this.buildManageLink(restaurantId, token, notificationLocale);
  }

  /**
   * Fix 5: notify the owner/manager (settings.notifyEmail / notifyPhone) when a
   * new booking arrives. The caller awaits completion so Cloud Run cannot
   * suspend the instance before the outbound request has been accepted.
   */
  async notifyOwner(input: OwnerNotifyInput): Promise<void> {
    await this.sendOwner(input).catch((err) =>
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

    // Owner copy stays English (matches the existing owner subject/body). The
    // headcount is already on the summary line, so skip the guests row here and
    // append only occasion/preferences/seating/notes/allergies.
    const details = buildBookingDetails(
      getReservationDetailLabels('en'),
      input,
      {
        includeGuests: false,
      },
    );

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
        ${details.htmlRows}
      </div>`;
      const detailsText = details.textLines.length
        ? `\n${details.textLines.join('\n')}`
        : '';
      const text = `New reservation: ${input.guestName} (${input.partySize})\n${when}\n${input.guestPhone}\nReference: ${input.referenceCode}${detailsText}`;
      await this.sendEmail(email, subject, html, text, 'owner new-booking');
    }

    if (phone) {
      const smsDetails = details.smsExtra ? `. ${details.smsExtra}` : '';
      const body = `New booking: ${input.guestName} (${input.partySize}) ${when}. ${input.guestPhone}. Ref ${input.referenceCode}${smsDetails}`;
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
      this.logger.log(`[dev] Reservation ${context} email suppressed`);
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
        `Resend reservation email failed (${res.status}): ${redactProviderDetail(detail).slice(0, 200)}`,
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
    // Dev normally dev-logs instead of sending. Set SMS_FORCE_SEND=true to
    // actually deliver locally (for testing a real SIM-gateway send).
    const isDev = process.env.NODE_ENV !== 'production';
    const forceSend = process.env.SMS_FORCE_SEND === 'true';
    if (isDev && !forceSend) {
      this.logger.log(`[dev] Reservation ${context} SMS suppressed`);
      return;
    }

    // SIM SMS gateway (capcom6) path — active when SMS_PROVIDER=smsgateway.
    // Twilio config below is left untouched so switching back is a flag flip.
    if (smsProvider() === 'smsgateway') {
      if (!smsGatewayConfigured()) {
        this.logger.error(
          'Reservation SMS disabled in production: missing SMS_GATEWAY_USERNAME or SMS_GATEWAY_PASSWORD',
        );
        return;
      }
      const result = await sendViaSmsGateway(to, body, {
        ttlSeconds: 60 * 60,
      });
      if (!result.ok) {
        this.logger.error(
          `SMS gateway reservation SMS failed (${result.status}): ${redactProviderDetail(result.detail).slice(0, 200)}`,
        );
      }
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
        `Twilio reservation SMS failed (${res.status}): ${redactProviderDetail(detail).slice(0, 200)}`,
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

interface RenderedBookingDetails {
  htmlRows: string;
  textLines: string[];
  // SMS carries only the headcount (health data is kept out of SMS).
  smsExtra: string;
}

const EMPTY_DETAILS: RenderedBookingDetails = {
  htmlRows: '',
  textLines: [],
  smsExtra: '',
};

/**
 * Turn the guest-provided booking fields into the three channel renderings.
 * Counts are labelled (`Adults: 3`) rather than inflected into the noun, so no
 * locale needs plural handling. `includeGuests: false` is used for the owner
 * message, whose summary line already shows the headcount.
 */
function buildBookingDetails(
  labels: ReservationDetailLabels,
  d: BookingDetailFields,
  opts: { includeGuests?: boolean } = {},
): RenderedBookingDetails {
  const includeGuests = opts.includeGuests !== false;
  const textLines: string[] = [];
  const htmlParts: string[] = [];
  const push = (label: string, value: string): void => {
    textLines.push(`${label}: ${value}`);
    htmlParts.push(
      `<strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}`,
    );
  };

  const adults = typeof d.adultsCount === 'number' ? d.adultsCount : null;
  const children = typeof d.childrenCount === 'number' ? d.childrenCount : 0;
  const partySize = adults !== null ? adults + children : null;

  if (includeGuests && partySize !== null) {
    const counts = [`${labels.adults}: ${adults}`];
    if (children > 0) counts.push(`${labels.children}: ${children}`);
    push(labels.guests, `${partySize} (${counts.join(', ')})`);
  }

  if (d.occasion && d.occasion !== 'NONE') {
    const occLabel =
      labels.occasions[d.occasion as keyof typeof labels.occasions];
    if (occLabel) push(labels.occasion, occLabel);
  }

  const prefs = (d.customerPreferences ?? []).filter(
    (p): p is string => !!p && p.trim().length > 0,
  );
  if (prefs.length) push(labels.preferences, prefs.join(', '));

  const zone = d.preferredZone?.trim();
  if (zone) push(labels.seating, zone);

  const notes = d.customerNotes?.trim();
  if (notes) push(labels.notes, notes);

  const allergies = d.allergyNotes?.trim();
  if (allergies) push(labels.allergies, allergies);

  // SMS carries ONLY the headcount. Allergy/dietary is health data and stays
  // out of the plaintext SMS channel — it lives in the email instead.
  const smsBits: string[] = [];
  if (includeGuests && partySize !== null) {
    smsBits.push(`${labels.guests}: ${partySize}`);
  }

  return {
    htmlRows: htmlParts.length
      ? `<p style="font-size:14px;color:#555">${htmlParts.join('<br/>')}</p>`
      : '',
    textLines,
    smsExtra: smsBits.join('. '),
  };
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

/**
 * Strip sensitive PII or bearer tokens from raw provider error responses before
 * they land in our internal logs.
 */
export function redactProviderDetail(text: string): string {
  if (!text) return text;
  // Redact phones (e.g. +359888123456 or 0888123456)
  let redacted = text.replace(/(?:\+?\d{10,15})/g, '[REDACTED_PHONE]');
  // Redact emails
  redacted = redacted.replace(/[\w.-]+@[\w.-]+\.\w+/g, '[REDACTED_EMAIL]');
  // Redact tokens in query strings or short links
  redacted = redacted.replace(/token=[\w.-]+/g, 'token=[REDACTED]');
  redacted = redacted.replace(/\/r\/[\w.-]+/g, '/r/[REDACTED]');
  return redacted;
}
