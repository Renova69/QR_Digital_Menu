import { ReservationNotificationsService } from './reservation-notifications.service';

describe('ReservationNotificationsService', () => {
  const originalEnv = { ...process.env };
  const restaurant = {
    name: 'Ресторант Тест',
    timezone: 'Europe/Sofia',
    contactInfo: 'София',
  };
  const productionReservationRequest = {
    restaurantId: 'rest-1',
    guestEmail: null,
    guestPhone: '+359000000000',
    guestName: 'Guest',
    startsAt: new Date('2030-01-01T18:00:00Z'),
    referenceCode: 'REQ789',
    notifyByEmail: false,
    notifyBySms: true,
    notificationLocale: 'en',
    manageToken: 'manage-secret',
  };

  let service: ReservationNotificationsService;

  beforeEach(() => {
    process.env = { ...originalEnv, NODE_ENV: 'test' };
    // Keep tests hermetic regardless of the developer's local .env — each test
    // opts into a provider explicitly.
    delete process.env.SMS_PROVIDER;
    delete process.env.SMS_FORCE_SEND;
    delete process.env.SMS_GATEWAY_USERNAME;
    delete process.env.SMS_GATEWAY_PASSWORD;
    delete process.env.SMS_GATEWAY_URL;
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
      '+359000000000',
      'Потвърдена резервация',
      'guest CONFIRMED',
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, request] = fetchMock.mock.calls[0];
    const body = new URLSearchParams(request?.body as string);
    expect(body.get('MessagingServiceSid')).toBe('MG-test');
    expect(body.get('From')).toBeNull();
  });

  it('actually sends in dev when SMS_FORCE_SEND=true (local gateway testing)', async () => {
    process.env.NODE_ENV = 'test';
    process.env.SMS_FORCE_SEND = 'true';
    process.env.SMS_PROVIDER = 'smsgateway';
    process.env.SMS_GATEWAY_USERNAME = 'device-user';
    process.env.SMS_GATEWAY_PASSWORD = 'device-pass';
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: true, status: 202 } as Response);

    await service.notify('RECEIVED', productionReservationRequest);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.sms-gate.app/3rdparty/v1/message',
    );
  });

  it('returns a promise that completes the guest notification', async () => {
    process.env.NODE_ENV = 'production';
    process.env.SMS_PROVIDER = 'smsgateway';
    process.env.SMS_GATEWAY_USERNAME = 'device-user';
    process.env.SMS_GATEWAY_PASSWORD = 'device-pass';
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: true, status: 202 } as Response);

    const completion = service.notify('RECEIVED', productionReservationRequest);

    expect(completion).toBeInstanceOf(Promise);
    await completion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('dev-logs instead of sending when SMS_FORCE_SEND is not set', async () => {
    process.env.NODE_ENV = 'test';
    delete process.env.SMS_FORCE_SEND;
    process.env.SMS_PROVIDER = 'smsgateway';
    const fetchMock = jest.spyOn(global, 'fetch');

    await service.notify('RECEIVED', productionReservationRequest);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends via the SIM SMS gateway when SMS_PROVIDER=smsgateway', async () => {
    process.env.NODE_ENV = 'production';
    process.env.SMS_PROVIDER = 'smsgateway';
    process.env.SMS_GATEWAY_USERNAME = 'device-user';
    process.env.SMS_GATEWAY_PASSWORD = 'device-pass';
    delete process.env.SMS_GATEWAY_URL;
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: true, status: 202 } as Response);

    await service.notify('RECEIVED', productionReservationRequest);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.sms-gate.app/3rdparty/v1/message');
    const body = JSON.parse(request?.body as string);
    expect(body.phoneNumbers).toEqual(['+359000000000']);
    expect(body.textMessage.text).toContain(
      "we've received your reservation request",
    );
    expect(body.textMessage.text).toContain('REQ789');
  });

  it('reports missing gateway credentials without logging guest PII', async () => {
    process.env.NODE_ENV = 'production';
    process.env.SMS_PROVIDER = 'smsgateway';
    delete process.env.SMS_GATEWAY_USERNAME;
    delete process.env.SMS_GATEWAY_PASSWORD;
    const error = jest
      .spyOn((service as any).logger, 'error')
      .mockImplementation(() => undefined);
    const fetchMock = jest.spyOn(global, 'fetch');

    await service.notify('RECEIVED', productionReservationRequest);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('SMS_GATEWAY_USERNAME'),
    );
    expect(JSON.stringify(error.mock.calls)).not.toContain('+359000000000');
    expect(JSON.stringify(error.mock.calls)).not.toContain('REQ789');
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

    await service.notify('RECEIVED', productionReservationRequest);

    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('TWILIO_MESSAGING_SERVICE_SID'),
    );
    expect(JSON.stringify(error.mock.calls)).not.toContain('+359000000000');
    expect(JSON.stringify(error.mock.calls)).not.toContain('REQ789');
  });
});
