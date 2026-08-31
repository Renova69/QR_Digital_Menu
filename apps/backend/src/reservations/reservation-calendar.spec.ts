import { buildReservationCalendarAttachment } from './reservation-calendar';

const input = {
  reservationId: 'reservation-1',
  referenceCode: 'ABC234',
  restaurantName: 'Ресторант Тест',
  restaurantLocation: 'София, България',
  startsAt: new Date('2030-01-01T18:00:00.000Z'),
  durationMinutes: 120,
  calendarSequence: 3,
  occurredAt: new Date('2029-12-01T10:11:12.000Z'),
  manageLink: 'https://example.test/booking/manage#token=opaque',
};

function decode(content: string): string {
  return Buffer.from(content, 'base64').toString('utf8');
}

describe('buildReservationCalendarAttachment', () => {
  it('builds a stable confirmed event with UTC instants and sequence', () => {
    const attachment = buildReservationCalendarAttachment('MODIFIED', input);

    expect(attachment?.filename).toBe('reservation-ABC234.ics');
    const calendar = decode(attachment!.content);
    expect(calendar).toContain(
      'UID:reservation-reservation-1@qr-digital-menu.app',
    );
    expect(calendar).toContain('DTSTART:20300101T180000Z');
    expect(calendar).toContain('DTEND:20300101T200000Z');
    expect(calendar).toContain('SEQUENCE:3');
    expect(calendar).toContain('STATUS:CONFIRMED');
    expect(calendar).toContain('METHOD:REQUEST');
    expect(calendar).toContain('Ресторант Тест');
  });

  it.each(['CANCELLED', 'DECLINED'] as const)(
    'uses the same UID and emits a calendar cancellation for %s',
    (kind) => {
      const calendar = decode(
        buildReservationCalendarAttachment(kind, input)!.content,
      );

      expect(calendar).toContain(
        'UID:reservation-reservation-1@qr-digital-menu.app',
      );
      expect(calendar).toContain('METHOD:CANCEL');
      expect(calendar).toContain('STATUS:CANCELLED');
    },
  );

  it('does not attach a calendar event to reminders', () => {
    expect(buildReservationCalendarAttachment('REMINDER', input)).toBeNull();
  });

  it('folds long UTF-8 lines without corrupting Cyrillic text', () => {
    const calendar = decode(
      buildReservationCalendarAttachment('CONFIRMED', {
        ...input,
        restaurantName: 'Много дълго име на ресторант '.repeat(8),
      })!.content,
    );

    expect(calendar).toContain('\r\n ');
    expect(calendar).not.toContain('�');
  });
});
