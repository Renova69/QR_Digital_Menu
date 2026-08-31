import { DateTime } from 'luxon';
import type { ReservationNotificationKind } from './reservation-notification-copy';

const CALENDAR_KINDS = new Set<ReservationNotificationKind>([
  'RECEIVED',
  'CONFIRMED',
  'MODIFIED',
  'DECLINED',
  'CANCELLED',
]);

export interface ReservationCalendarInput {
  reservationId: string;
  referenceCode: string;
  restaurantName: string;
  restaurantLocation?: string | null;
  startsAt: Date;
  durationMinutes?: number | null;
  calendarSequence: number;
  occurredAt: Date;
  manageLink?: string | null;
}

export interface ReservationCalendarAttachment {
  filename: string;
  content: string;
}

function escapeCalendarText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function formatUtc(value: Date): string {
  return DateTime.fromJSDate(value, { zone: 'utc' }).toFormat(
    "yyyyLLdd'T'HHmmss'Z'",
  );
}

/**
 * RFC 5545 content lines are limited to 75 octets. Fold on Unicode code-point
 * boundaries so Cyrillic restaurant names are never split mid-character.
 */
function foldCalendarLine(line: string): string {
  const segments: string[] = [];
  let segment = '';
  let bytes = 0;
  for (const character of line) {
    const characterBytes = Buffer.byteLength(character, 'utf8');
    if (segment && bytes + characterBytes > 75) {
      segments.push(segment);
      segment = ` ${character}`;
      bytes = 1 + characterBytes;
    } else {
      segment += character;
      bytes += characterBytes;
    }
  }
  segments.push(segment);
  return segments.join('\r\n');
}

export function buildReservationCalendarAttachment(
  kind: ReservationNotificationKind,
  input: ReservationCalendarInput,
): ReservationCalendarAttachment | null {
  if (!CALENDAR_KINDS.has(kind)) return null;

  const cancelled = kind === 'CANCELLED' || kind === 'DECLINED';
  const confirmed = kind === 'CONFIRMED' || kind === 'MODIFIED';
  const endsAt = new Date(
    input.startsAt.getTime() + (input.durationMinutes ?? 90) * 60_000,
  );
  const description = [
    `Reservation reference: ${input.referenceCode}`,
    input.manageLink ? `Manage reservation: ${input.manageLink}` : null,
  ]
    .filter((value): value is string => value !== null)
    .join('\n');
  const lines = [
    'BEGIN:VCALENDAR',
    'PRODID:-//QR Digital Menu//Reservations//EN',
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    `METHOD:${cancelled ? 'CANCEL' : 'REQUEST'}`,
    'BEGIN:VEVENT',
    `UID:reservation-${escapeCalendarText(input.reservationId)}@qr-digital-menu.app`,
    `DTSTAMP:${formatUtc(input.occurredAt)}`,
    `DTSTART:${formatUtc(input.startsAt)}`,
    `DTEND:${formatUtc(endsAt)}`,
    `SEQUENCE:${Math.max(0, input.calendarSequence)}`,
    `STATUS:${cancelled ? 'CANCELLED' : confirmed ? 'CONFIRMED' : 'TENTATIVE'}`,
    `SUMMARY:${escapeCalendarText(`Reservation at ${input.restaurantName}`)}`,
    `DESCRIPTION:${escapeCalendarText(description)}`,
    ...(input.restaurantLocation
      ? [`LOCATION:${escapeCalendarText(input.restaurantLocation)}`]
      : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  const calendar = `${lines.map(foldCalendarLine).join('\r\n')}\r\n`;
  const safeReference =
    input.referenceCode.replace(/[^A-Za-z0-9_-]/g, '') || 'booking';
  return {
    filename: `reservation-${safeReference}.ics`,
    content: Buffer.from(calendar, 'utf8').toString('base64'),
  };
}
