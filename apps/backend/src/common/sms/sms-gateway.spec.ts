import {
  smsProvider,
  smsGatewayConfigured,
  sendViaSmsGateway,
} from './sms-gateway';

describe('sms-gateway', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  describe('smsProvider', () => {
    it('defaults to twilio when SMS_PROVIDER is unset', () => {
      delete process.env.SMS_PROVIDER;
      expect(smsProvider()).toBe('twilio');
    });

    it('returns twilio for any non-smsgateway value', () => {
      process.env.SMS_PROVIDER = 'something-else';
      expect(smsProvider()).toBe('twilio');
    });

    it('returns smsgateway when explicitly selected', () => {
      process.env.SMS_PROVIDER = 'smsgateway';
      expect(smsProvider()).toBe('smsgateway');
    });
  });

  describe('smsGatewayConfigured', () => {
    it('is false without credentials', () => {
      delete process.env.SMS_GATEWAY_USERNAME;
      delete process.env.SMS_GATEWAY_PASSWORD;
      expect(smsGatewayConfigured()).toBe(false);
    });

    it('is false with only a username', () => {
      process.env.SMS_GATEWAY_USERNAME = 'user';
      delete process.env.SMS_GATEWAY_PASSWORD;
      expect(smsGatewayConfigured()).toBe(false);
    });

    it('is true with username and password', () => {
      process.env.SMS_GATEWAY_USERNAME = 'user';
      process.env.SMS_GATEWAY_PASSWORD = 'pass';
      expect(smsGatewayConfigured()).toBe(true);
    });
  });

  describe('sendViaSmsGateway', () => {
    it('POSTs the capcom6 body shape with basic auth to the default URL', async () => {
      process.env.SMS_GATEWAY_USERNAME = 'user';
      process.env.SMS_GATEWAY_PASSWORD = 'pass';
      delete process.env.SMS_GATEWAY_URL;
      const fetchMock = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue({ ok: true, status: 202 } as Response);

      const result = await sendViaSmsGateway('+359888123456', 'hello');

      expect(result).toEqual({ ok: true, status: 202, detail: '' });
      const [url, request] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.sms-gate.app/3rdparty/v1/message');
      expect((request?.headers as Record<string, string>).Authorization).toBe(
        `Basic ${Buffer.from('user:pass').toString('base64')}`,
      );
      const body = JSON.parse(request?.body as string);
      expect(body).toEqual({
        textMessage: { text: 'hello' },
        phoneNumbers: ['+359888123456'],
      });
    });

    it('honours a custom SMS_GATEWAY_URL (self-hosted private server)', async () => {
      process.env.SMS_GATEWAY_USERNAME = 'user';
      process.env.SMS_GATEWAY_PASSWORD = 'pass';
      process.env.SMS_GATEWAY_URL = 'http://192.168.1.50:8080/message';
      const fetchMock = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue({ ok: true, status: 202 } as Response);

      await sendViaSmsGateway('+359888123456', 'hi');

      expect(fetchMock.mock.calls[0][0]).toBe(
        'http://192.168.1.50:8080/message',
      );
    });

    it('returns the error detail without throwing on a failed send', async () => {
      process.env.SMS_GATEWAY_USERNAME = 'user';
      process.env.SMS_GATEWAY_PASSWORD = 'pass';
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      } as Response);

      const result = await sendViaSmsGateway('+359888123456', 'hi');

      expect(result).toEqual({
        ok: false,
        status: 401,
        detail: 'Unauthorized',
      });
    });
  });
});
