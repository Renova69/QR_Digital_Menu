import { NotificationChannel } from '@prisma/client';
import { ReservationNotificationsService } from './reservation-notifications.service';

describe('ReservationNotificationsService', () => {
  const originalEnv = { ...process.env };
  const restaurant = {
    name: 'Ресторант Тест',
    timezone: 'Europe/Sofia',
    contactInfo: 'София',
  };
  const detailedGuestInput = {
    restaurantId: 'rest-1',
    guestEmail: 'guest@example.com',
    guestPhone: '+359000000000',
    guestName: 'Guest',
    startsAt: new Date('2030-01-01T18:00:00Z'),
    referenceCode: 'REQ789',
    notificationLocale: 'en',
    notifyByEmail: true,
    notifyBySms: true,
    manageToken: 'manage-secret',
    adultsCount: 3,
    childrenCount: 1,
    occasion: 'BIRTHDAY',
    customerPreferences: ['Window seat', 'Quiet area'],
    preferredZone: 'Terrace',
    customerNotes: 'High chair please',
    allergyNotes: 'Peanut allergy',
  };

  let service: ReservationNotificationsService;
  let deliveries: { enqueueMany: jest.Mock };

  beforeEach(() => {
    process.env = { ...originalEnv, NODE_ENV: 'test' };
    deliveries = { enqueueMany: jest.fn().mockResolvedValue([]) };
    service = new ReservationNotificationsService(
      {
        restaurant: {
          findUnique: jest.fn().mockResolvedValue(restaurant),
        },
      } as unknown as ConstructorParameters<
        typeof ReservationNotificationsService
      >[0],
      deliveries as unknown as ConstructorParameters<
        typeof ReservationNotificationsService
      >[1],
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('renders the guest confirmation in the persisted Bulgarian locale', async () => {
    const [email] = await service.prepare('CONFIRMED', {
      restaurantId: 'rest-1',
      guestEmail: 'guest@example.com',
      guestName: 'Мария',
      startsAt: new Date('2026-07-06T16:00:00.000Z'),
      referenceCode: 'ABC234',
      notificationLocale: 'bg',
      notifyByEmail: true,
      notifyBySms: false,
      manageToken: 'manage-secret',
    });

    expect(email.payload.subject).toBe(
      'Резервацията е потвърдена — Ресторант Тест',
    );
    expect(email.payload.html).toContain('Вашата резервация е потвърдена');
    expect(email.payload.text).toMatch(/понеделник, 06 юли 2026.*19:00/);
    expect(email.payload.html).toContain('Управление на резервацията');
  });

  it('persists lifecycle email and SMS legs with one event identity', async () => {
    const tx = {
      restaurant: { findUnique: jest.fn().mockResolvedValue(restaurant) },
      notificationDelivery: {},
    };

    await service.enqueueGuest(tx as never, 'event-1', 'CONFIRMED', {
      ...detailedGuestInput,
      reservationId: 'reservation-1',
      durationMinutes: 120,
      calendarSequence: 2,
      notificationOccurredAt: new Date('2029-12-01T10:00:00.000Z'),
    });

    expect(deliveries.enqueueMany).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          sourceType: 'RESERVATION_LIFECYCLE',
          sourceId: 'reservation-1',
          deduplicationKey: 'reservation-event:event-1',
          channel: NotificationChannel.EMAIL,
          payload: expect.objectContaining({
            attachments: [
              expect.objectContaining({
                filename: 'reservation-REQ789.ics',
              }),
            ],
          }),
        }),
        expect.objectContaining({
          sourceType: 'RESERVATION_LIFECYCLE',
          sourceId: 'reservation-1',
          deduplicationKey: 'reservation-event:event-1',
          channel: NotificationChannel.SMS,
        }),
      ],
      tx,
    );
  });

  it('propagates an outbox write failure so the reservation transaction rolls back', async () => {
    deliveries.enqueueMany.mockRejectedValueOnce(new Error('database down'));

    await expect(
      service.enqueueGuest(
        {
          restaurant: { findUnique: jest.fn().mockResolvedValue(restaurant) },
        } as never,
        'event-1',
        'CONFIRMED',
        {
          ...detailedGuestInput,
          reservationId: 'reservation-1',
          calendarSequence: 1,
          notificationOccurredAt: new Date(),
        },
      ),
    ).rejects.toThrow('database down');
  });

  it('includes all guest-provided details in the guest email', async () => {
    const [email] = await service.prepare('CONFIRMED', {
      ...detailedGuestInput,
      notifyBySms: false,
    });

    for (const needle of [
      'Guests',
      '4',
      'Adults',
      'Children',
      'Occasion',
      'Birthday',
      'Window seat',
      'Quiet area',
      'Terrace',
      'High chair please',
      'Peanut allergy',
    ]) {
      expect(email.payload.text).toContain(needle);
      expect(email.payload.html).toContain(needle);
    }
  });

  it('keeps the guest SMS terse: status + party size, no allergy or prose', async () => {
    process.env.BACKEND_URL = 'https://api.example.com';
    const [sms] = await service.prepare('CONFIRMED', {
      ...detailedGuestInput,
      notifyByEmail: false,
    });

    expect(sms.payload.body).toContain('Booking confirmed');
    expect(sms.payload.body).toContain('Guests: 4');
    expect(sms.payload.body).toContain(
      'https://api.example.com/r/manage-secret',
    );
    expect(sms.payload.body).not.toContain('/booking/manage?');
    expect(sms.payload.body).not.toContain('Peanut allergy');
    expect(sms.payload.body).not.toContain('Birthday');
    expect(sms.payload.body).not.toContain('Window seat');
  });

  it('renders a distinct updated notice with the new booking details', async () => {
    const [email] = await service.prepare('MODIFIED', {
      ...detailedGuestInput,
      notifyBySms: false,
    });

    expect(email.payload.subject).toBe('Reservation updated — Ресторант Тест');
    expect(email.payload.html).toContain('has been <strong>updated</strong>');
    expect(email.payload.text).toContain('Guests: 4');
  });

  it('persists full owner email details but keeps allergy data out of owner SMS', async () => {
    const tx = {
      restaurant: { findUnique: jest.fn().mockResolvedValue(restaurant) },
      notificationDelivery: {},
    };

    await service.enqueueOwner(tx as never, 'event-1', 'reservation-1', {
      restaurantId: 'rest-1',
      notifyEmail: 'owner@example.com',
      notifyPhone: '+359111111111',
      guestName: 'Guest',
      guestPhone: '+359000000000',
      startsAt: new Date('2030-01-01T18:00:00Z'),
      partySize: 4,
      referenceCode: 'REQ789',
      adultsCount: 3,
      childrenCount: 1,
      occasion: 'BIRTHDAY',
      customerPreferences: ['Window seat'],
      preferredZone: 'Terrace',
      customerNotes: 'High chair',
      allergyNotes: 'Peanut allergy',
    });

    const [email, sms] = deliveries.enqueueMany.mock.calls[0][0];
    expect(email.payload.html).toContain('Birthday');
    expect(email.payload.html).toContain('Peanut allergy');
    expect(sms.payload.body).not.toContain('Peanut allergy');
    expect(email.deduplicationKey).toBe('reservation-owner-event:event-1');
    expect(sms.deduplicationKey).toBe('reservation-owner-event:event-1');
  });

  it('uses a calendar cancellation with the same reservation UID', async () => {
    const [email] = await service.prepare('CANCELLED', {
      ...detailedGuestInput,
      notifyBySms: false,
      reservationId: 'reservation-1',
      calendarSequence: 4,
      notificationOccurredAt: new Date('2029-12-02T10:00:00.000Z'),
    });

    const calendar = Buffer.from(
      email.payload.attachments![0].content,
      'base64',
    ).toString('utf8');
    expect(calendar).toContain(
      'UID:reservation-reservation-1@qr-digital-menu.app',
    );
    expect(calendar).toContain('METHOD:CANCEL');
    expect(calendar).toContain('SEQUENCE:4');
  });
});
