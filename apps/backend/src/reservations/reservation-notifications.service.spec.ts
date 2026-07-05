import { ReservationNotificationsService } from './reservation-notifications.service';

describe('ReservationNotificationsService', () => {
  const originalEnv = { ...process.env };
  const restaurant = {
    name: 'Ресторант Тест',
    timezone: 'Europe/Sofia',
    contactInfo: 'София',
  };

  let service: ReservationNotificationsService;

  beforeEach(() => {
    process.env = { ...originalEnv, NODE_ENV: 'test' };
    service = new ReservationNotificationsService({
      restaurant: {
        findUnique: jest.fn().mockResolvedValue(restaurant),
      },
    } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('renders the guest confirmation in the persisted Bulgarian locale', async () => {
    const sendEmail = jest
      .spyOn(service as any, 'sendEmail')
      .mockResolvedValue(undefined);

    await (service as any).send('CONFIRMED', {
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

    expect(sendEmail).toHaveBeenCalledWith(
      'guest@example.com',
      'Резервацията е потвърдена — Ресторант Тест',
      expect.stringContaining('Вашата резервация е потвърдена'),
      expect.stringMatching(/понеделник, 06 юли 2026.*19:00/),
      'guest CONFIRMED',
    );
    expect(sendEmail.mock.calls[0][2]).toContain('Управление на резервацията');
  });

  it('uses a Twilio Messaging Service when no direct From number is configured', async () => {
    process.env.NODE_ENV = 'production';
    process.env.TWILIO_ACCOUNT_SID = 'AC-test';
    process.env.TWILIO_AUTH_TOKEN = 'secret';
    process.env.TWILIO_MESSAGING_SERVICE_SID = 'MG-test';
    delete process.env.TWILIO_FROM_NUMBER;
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: true } as Response);

    await (service as any).sendSms(
      '+359888123456',
      'Потвърдена резервация',
      'guest CONFIRMED',
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, request] = fetchMock.mock.calls[0];
    const body = new URLSearchParams(request?.body as string);
    expect(body.get('MessagingServiceSid')).toBe('MG-test');
    expect(body.get('From')).toBeNull();
  });

  it('reports missing production sender configuration without logging guest PII', async () => {
    process.env.NODE_ENV = 'production';
    process.env.TWILIO_ACCOUNT_SID = 'AC-test';
    process.env.TWILIO_AUTH_TOKEN = 'secret';
    delete process.env.TWILIO_MESSAGING_SERVICE_SID;
    delete process.env.TWILIO_FROM_NUMBER;
    const error = jest
      .spyOn((service as any).logger, 'error')
      .mockImplementation(() => undefined);

    await (service as any).sendSms(
      '+359888123456',
      'private reservation text',
      'guest CONFIRMED',
    );

    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('TWILIO_MESSAGING_SERVICE_SID'),
    );
    expect(JSON.stringify(error.mock.calls)).not.toContain('+359888123456');
    expect(JSON.stringify(error.mock.calls)).not.toContain(
      'private reservation text',
    );
  });
});
