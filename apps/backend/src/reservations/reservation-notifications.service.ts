import { Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { NotificationChannel, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { DeliveryPayload } from '../notifications/notification-provider';
import { NotificationDeliveryService } from '../notifications/notification-delivery.service';
import {
  getReservationNotificationCopy,
  getReservationDetailLabels,
  getReservationSmsStatus,
  normalizeReservationNotificationLocale,
  type ReservationNotificationKind,
  type ReservationDetailLabels,
} from './reservation-notification-copy';
import { buildReservationCalendarAttachment } from './reservation-calendar';

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

export interface NotifyInput extends BookingDetailFields {
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

export interface LifecycleNotifyInput extends NotifyInput {
  reservationId: string;
  durationMinutes?: number | null;
  calendarSequence: number;
  notificationOccurredAt: Date;
}

export type PreparedReservationNotification = {
  channel: NotificationChannel;
  payload: DeliveryPayload;
};

export interface OwnerNotifyInput extends BookingDetailFields {
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
 * Renders immutable reservation notification snapshots and persists them
 * through the shared durable outbox. Provider I/O deliberately lives only in
 * ProductionNotificationProvider so lifecycle callers cannot bypass retries.
 */
@Injectable()
export class ReservationNotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deliveries: NotificationDeliveryService,
  ) {}

  /**
   * Persist every requested guest channel in the same transaction as the
   * reservation event. Providers are called later by NotificationDeliveryService.
   */
  async enqueueGuest(
    tx: Prisma.TransactionClient,
    eventId: string,
    kind: ReservationNotificationKind,
    input: LifecycleNotifyInput,
  ): Promise<void> {
    const prepared = await this.prepare(kind, input, tx);
    await this.deliveries.enqueueMany(
      prepared.map((delivery) => ({
        restaurantId: input.restaurantId,
        sourceType: 'RESERVATION_LIFECYCLE',
        sourceId: input.reservationId,
        deduplicationKey: `reservation-event:${eventId}`,
        channel: delivery.channel,
        payload: delivery.payload,
      })),
      tx,
    );
  }

  async enqueueOwner(
    tx: Prisma.TransactionClient,
    eventId: string,
    reservationId: string,
    input: OwnerNotifyInput,
  ): Promise<void> {
    const prepared = await this.prepareOwner(input, tx);
    await this.deliveries.enqueueMany(
      prepared.map((delivery) => ({
        restaurantId: input.restaurantId,
        sourceType: 'RESERVATION_OWNER_NEW',
        sourceId: reservationId,
        deduplicationKey: `reservation-owner-event:${eventId}`,
        channel: delivery.channel,
        payload: delivery.payload,
      })),
      tx,
    );
  }

  async prepare(
    kind: ReservationNotificationKind,
    input: NotifyInput | LifecycleNotifyInput,
    client: Pick<Prisma.TransactionClient, 'restaurant'> = this.prisma,
  ): Promise<PreparedReservationNotification[]> {
    // Default to email when the caller didn't express a preference, preserving
    // the original behaviour for staff/manual paths.
    const wantEmail = input.notifyByEmail ?? true;
    const wantSms = input.notifyBySms ?? false;
    const to = input.guestEmail?.trim();
    const phone = input.guestPhone?.trim();
    if (!(wantEmail && to) && !(wantSms && phone)) return [];

    const restaurant = await client.restaurant.findUnique({
      where: { id: input.restaurantId },
      select: { name: true, timezone: true, contactInfo: true },
    });
    if (!restaurant) return [];

    const prepared: PreparedReservationNotification[] = [];

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
      const calendar =
        'reservationId' in input &&
        typeof input.reservationId === 'string' &&
        'calendarSequence' in input &&
        typeof input.calendarSequence === 'number' &&
        'notificationOccurredAt' in input &&
        input.notificationOccurredAt instanceof Date
          ? buildReservationCalendarAttachment(kind, {
              reservationId: input.reservationId,
              referenceCode: input.referenceCode,
              restaurantName: restaurant.name,
              restaurantLocation: restaurant.contactInfo,
              startsAt: input.startsAt,
              durationMinutes:
                'durationMinutes' in input &&
                typeof input.durationMinutes === 'number'
                  ? input.durationMinutes
                  : null,
              calendarSequence: input.calendarSequence,
              occurredAt: input.notificationOccurredAt,
              manageLink,
            })
          : null;
      prepared.push({
        channel: NotificationChannel.EMAIL,
        payload: {
          to,
          subject,
          html,
          text,
          ...(calendar ? { attachments: [calendar] } : {}),
        },
      });
    }

    if (wantSms && phone) {
      // Terse SMS: restaurant · status · when · party size · ref · short link.
      // No prose intro, no allergy — those live in the email.
      const status = getReservationSmsStatus(notificationLocale, kind);
      const guests = details.smsExtra ? ` · ${details.smsExtra}` : '';
      const body = `${restaurant.name}: ${status}. ${when}${guests}. ${copy.refShort} ${input.referenceCode}${
        shortManageLink ? ` ${shortManageLink}` : ''
      }`;
      prepared.push({
        channel: NotificationChannel.SMS,
        payload: { to: phone, body },
      });
    }
    return prepared;
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

  /** Render the owner/manager new-booking notice before persisting its legs. */
  private async prepareOwner(
    input: OwnerNotifyInput,
    client: Pick<Prisma.TransactionClient, 'restaurant'> = this.prisma,
  ): Promise<PreparedReservationNotification[]> {
    const email = input.notifyEmail?.trim();
    const phone = input.notifyPhone?.trim();
    if (!email && !phone) return [];

    const restaurant = await client.restaurant.findUnique({
      where: { id: input.restaurantId },
      select: { name: true, timezone: true },
    });
    if (!restaurant) return [];

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
    const prepared: PreparedReservationNotification[] = [];

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
      prepared.push({
        channel: NotificationChannel.EMAIL,
        payload: { to: email, subject, html, text },
      });
    }

    if (phone) {
      const smsDetails = details.smsExtra ? `. ${details.smsExtra}` : '';
      const body = `New booking: ${input.guestName} (${input.partySize}) ${when}. ${input.guestPhone}. Ref ${input.referenceCode}${smsDetails}`;
      prepared.push({
        channel: NotificationChannel.SMS,
        payload: { to: phone, body },
      });
    }
    return prepared;
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
