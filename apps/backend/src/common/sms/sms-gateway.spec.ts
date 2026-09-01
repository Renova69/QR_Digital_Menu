import {
  getSmsGatewayMessageStatus,
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
      process.env.NODE_ENV = 'test';
      process.env.SMS_FORCE_SEND = 'true';
      process.env.SMS_GATEWAY_USERNAME = 'user';
      process.env.SMS_GATEWAY_PASSWORD = 'pass';
      delete process.env.SMS_GATEWAY_URL;
      const fetchMock = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue({ ok: true, status: 202 } as Response);

      const result = await sendViaSmsGateway('+359000000000', 'hello');

      expect(result).toEqual({ ok: true, status: 202, detail: '' });
      const [url, request] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.sms-gate.app/3rdparty/v1/messages');
      expect((request?.headers as Record<string, string>).Authorization).toBe(
        `Basic ${Buffer.from('user:pass').toString('base64')}`,
      );
      const body = JSON.parse(request?.body as string);
      expect(body).toEqual({
        textMessage: { text: 'hello' },
        phoneNumbers: ['+359000000000'],
        ttl: 3600,
        withDeliveryReport: false,
      });
    });

    it('honours a custom SMS_GATEWAY_URL (self-hosted private server)', async () => {
      process.env.NODE_ENV = 'test';
      process.env.SMS_FORCE_SEND = 'true';
      process.env.SMS_GATEWAY_USERNAME = 'user';
      process.env.SMS_GATEWAY_PASSWORD = 'pass';
      process.env.SMS_GATEWAY_URL = 'http://192.168.1.50:8080/message';
      const fetchMock = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue({ ok: true, status: 202 } as Response);

      await sendViaSmsGateway('+359000000000', 'hi');

      expect(fetchMock.mock.calls[0][0]).toBe(
        'http://192.168.1.50:8080/message',
      );
    });

    it('returns the error detail without throwing on a failed send', async () => {
      process.env.NODE_ENV = 'test';
      process.env.SMS_FORCE_SEND = 'true';
      process.env.SMS_GATEWAY_USERNAME = 'user';
      process.env.SMS_GATEWAY_PASSWORD = 'pass';
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      } as Response);

      const result = await sendViaSmsGateway('+359000000000', 'hi');

      expect(result).toEqual({
        ok: false,
        status: 401,
        detail: 'Unauthorized',
      });
    });

    it('supports a short TTL for OTP messages', async () => {
      process.env.NODE_ENV = 'test';
      process.env.SMS_FORCE_SEND = 'true';
      process.env.SMS_GATEWAY_USERNAME = 'user';
      process.env.SMS_GATEWAY_PASSWORD = 'pass';
      const fetchMock = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue({ ok: true, status: 202 } as Response);

      await sendViaSmsGateway('+359000000000', 'otp', { ttlSeconds: 600 });

      const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
      expect(body.ttl).toBe(600);
    });

    it('sends a stable message id and explicitly requests delivery reports', async () => {
      process.env.NODE_ENV = 'test';
      process.env.SMS_FORCE_SEND = 'true';
      process.env.SMS_GATEWAY_USERNAME = 'user';
      process.env.SMS_GATEWAY_PASSWORD = 'pass';
      const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 202,
        json: () => Promise.resolve({ id: 'delivery-123' }),
      } as Response);

      await expect(
        sendViaSmsGateway('+359000000000', 'hello', {
          messageId: 'delivery-123',
          withDeliveryReport: true,
        }),
      ).resolves.toEqual({
        ok: true,
        status: 202,
        detail: '',
        messageId: 'delivery-123',
      });

      expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual(
        expect.objectContaining({
          id: 'delivery-123',
          withDeliveryReport: true,
        }),
      );
    });

    it('blocks a real network call under NODE_ENV=test', async () => {
      process.env.NODE_ENV = 'test';
      process.env.SMS_FORCE_SEND = 'true';
      process.env.SMS_GATEWAY_USERNAME = 'user';
      process.env.SMS_GATEWAY_PASSWORD = 'pass';
      const originalFetch = global.fetch;
      let called = false;
      global.fetch = async () => {
        called = true;
        throw new Error('must not reach the network');
      };

      try {
        const result = await sendViaSmsGateway('+359000000000', 'blocked');

        expect(called).toBe(false);
        expect(result).toEqual(
          expect.objectContaining({
            ok: false,
            status: 0,
            detail: expect.stringContaining('blocked'),
          }),
        );
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('returns a structured failure when fetch rejects', async () => {
      process.env.NODE_ENV = 'production';
      process.env.SMS_GATEWAY_USERNAME = 'user';
      process.env.SMS_GATEWAY_PASSWORD = 'pass';
      jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'));

      await expect(
        sendViaSmsGateway('+359000000000', 'hello'),
      ).resolves.toEqual({
        ok: false,
        status: 0,
        detail: 'network down',
      });
    });
  });

  describe('getSmsGatewayMessageStatus', () => {
    it('GETs one message with basic auth and returns only status metadata', async () => {
      process.env.NODE_ENV = 'test';
      process.env.SMS_GATEWAY_USERNAME = 'user';
      process.env.SMS_GATEWAY_PASSWORD = 'pass';
      delete process.env.SMS_GATEWAY_URL;
      const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            id: 'message/id',
            state: 'Delivered',
            states: {
              Pending: '2030-01-01T12:00:00Z',
              Delivered: '2030-01-01T12:01:00Z',
            },
            recipients: [{ phoneNumber: '+359000000000' }],
            textMessage: { text: 'private message body' },
            reason: 'private provider detail',
          }),
      } as Response);

      await expect(getSmsGatewayMessageStatus('message/id')).resolves.toEqual({
        ok: true,
        status: 200,
        detail: '',
        message: {
          id: 'message/id',
          state: 'Delivered',
          states: {
            Pending: '2030-01-01T12:00:00Z',
            Delivered: '2030-01-01T12:01:00Z',
          },
        },
      });

      const [url, request] = fetchMock.mock.calls[0];
      expect(url).toBe(
        'https://api.sms-gate.app/3rdparty/v1/messages/message%2Fid',
      );
      expect(request?.method).toBe('GET');
      expect((request?.headers as Record<string, string>).Authorization).toBe(
        `Basic ${Buffer.from('user:pass').toString('base64')}`,
      );
    });

    it('does not copy a provider error body into the result', async () => {
      process.env.NODE_ENV = 'test';
      process.env.SMS_GATEWAY_USERNAME = 'user';
      process.env.SMS_GATEWAY_PASSWORD = 'pass';
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('recipient +359000000000 failed'),
      } as Response);

      await expect(getSmsGatewayMessageStatus('message-1')).resolves.toEqual({
        ok: false,
        status: 500,
        detail: 'SMS gateway status request failed with HTTP 500',
      });
    });

    it('rejects an unsupported provider state without returning the payload', async () => {
      process.env.NODE_ENV = 'test';
      process.env.SMS_GATEWAY_USERNAME = 'user';
      process.env.SMS_GATEWAY_PASSWORD = 'pass';
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            id: 'message-1',
            state: 'Unexpected',
            phoneNumbers: ['+359000000000'],
          }),
      } as Response);

      await expect(getSmsGatewayMessageStatus('message-1')).resolves.toEqual({
        ok: false,
        status: 502,
        detail: 'SMS gateway returned an invalid status response',
      });
    });
  });
});
