import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PushService } from './push.service';
import { PrismaService } from '../prisma/prisma.service';
import { SubscribePushDto } from './dto/subscribe-push.dto';

const mockSendNotification = jest.fn();
const mockSetVapidDetails = jest.fn();
const mockGenerateVAPIDKeys = jest.fn();

jest.mock('web-push', () => ({
  setVapidDetails: (...args: any[]) => mockSetVapidDetails(...args),
  generateVAPIDKeys: () => mockGenerateVAPIDKeys(),
  sendNotification: (...args: any[]) => mockSendNotification(...args),
}));

describe('PushService', () => {
  let service: PushService;

  const mockPrisma = {
    pushSubscription: {
      upsert: jest.fn(),
      findMany: jest.fn(),
      delete: jest.fn(),
    },
  };

  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = { ...originalEnv };
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    delete process.env.NODE_ENV;
    process.env.RESEND_FROM_EMAIL = 'test@example.com';

    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PushService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<PushService>(PushService);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createSubscription', () => {
    const validSub: SubscribePushDto = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
      keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
    };

    it('should upsert push subscription for valid FCM endpoint', async () => {
      mockPrisma.pushSubscription.upsert.mockResolvedValue({
        id: 'sub-1',
        userId: 'user-1',
      });

      const result = await service.createSubscription('user-1', validSub);

      expect(mockPrisma.pushSubscription.upsert).toHaveBeenCalledWith({
        where: { endpoint: validSub.endpoint },
        create: {
          userId: 'user-1',
          endpoint: validSub.endpoint,
          p256dh: validSub.keys.p256dh,
          auth: validSub.keys.auth,
        },
        update: {
          userId: 'user-1',
          p256dh: validSub.keys.p256dh,
          auth: validSub.keys.auth,
        },
      });
      expect(result).toBeDefined();
    });

    it('should reject invalid URL endpoint', async () => {
      const badSub: SubscribePushDto = {
        endpoint: 'not-a-url',
        keys: { p256dh: 'k', auth: 'k' },
      };

      await expect(
        service.createSubscription('user-1', badSub),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject non-HTTPS endpoint', async () => {
      const badSub: SubscribePushDto = {
        endpoint: 'http://fcm.googleapis.com/fcm/send/test',
        keys: { p256dh: 'k', auth: 'k' },
      };

      await expect(
        service.createSubscription('user-1', badSub),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject disallowed push host', async () => {
      const badSub: SubscribePushDto = {
        endpoint: 'https://evil.example.com/push',
        keys: { p256dh: 'k', auth: 'k' },
      };

      await expect(
        service.createSubscription('user-1', badSub),
      ).rejects.toThrow(BadRequestException);
    });

    it('should accept Firefox push endpoint', async () => {
      const firefoxSub: SubscribePushDto = {
        endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/test',
        keys: { p256dh: 'k', auth: 'k' },
      };
      mockPrisma.pushSubscription.upsert.mockResolvedValue({ id: 'sub-2' });

      const result = await service.createSubscription('user-2', firefoxSub);

      expect(result).toBeDefined();
    });

    it('should accept Edge/WNS push endpoint', async () => {
      const edgeSub: SubscribePushDto = {
        endpoint: 'https://db5.notify.windows.com/w/push',
        keys: { p256dh: 'k', auth: 'k' },
      };
      mockPrisma.pushSubscription.upsert.mockResolvedValue({ id: 'sub-3' });

      const result = await service.createSubscription('user-3', edgeSub);

      expect(result).toBeDefined();
    });

    it('should accept Apple push endpoint', async () => {
      const appleSub: SubscribePushDto = {
        endpoint: 'https://web.push.apple.com/QpTest123',
        keys: { p256dh: 'k', auth: 'k' },
      };
      mockPrisma.pushSubscription.upsert.mockResolvedValue({ id: 'sub-4' });

      const result = await service.createSubscription('user-4', appleSub);

      expect(result).toBeDefined();
    });
  });

  describe('sendPushNotification', () => {
    it('should warn and return when VAPID is not configured', async () => {
      (service as any).isVapidConfigured = false;
      const logSpy = jest.spyOn((service as any).logger, 'warn');

      await service.sendPushNotification('user-1', 'Title', 'Body');

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cannot send notification'),
      );
      expect(mockPrisma.pushSubscription.findMany).not.toHaveBeenCalled();
    });

    it('should return early when user has no subscriptions', async () => {
      (service as any).isVapidConfigured = true;
      mockPrisma.pushSubscription.findMany.mockResolvedValue([]);

      await service.sendPushNotification('user-1', 'Title', 'Body');

      expect(mockSendNotification).not.toHaveBeenCalled();
    });

    it('should send push notification to all user subscriptions', async () => {
      (service as any).isVapidConfigured = true;
      mockPrisma.pushSubscription.findMany.mockResolvedValue([
        {
          id: 'sub-1',
          endpoint: 'https://fcm.googleapis.com/fcm/send/a',
          p256dh: 'k1',
          auth: 'a1',
        },
        {
          id: 'sub-2',
          endpoint: 'https://web.push.apple.com/b',
          p256dh: 'k2',
          auth: 'a2',
        },
      ]);
      mockSendNotification.mockResolvedValue({ statusCode: 201 });

      await service.sendPushNotification(
        'user-1',
        'Test Title',
        'Test Body',
        '/dashboard',
      );

      expect(mockSendNotification).toHaveBeenCalledTimes(2);
    });

    it('should remove expired subscription on 410', async () => {
      (service as any).isVapidConfigured = true;
      mockPrisma.pushSubscription.findMany.mockResolvedValue([
        {
          id: 'sub-1',
          endpoint: 'https://fcm.googleapis.com/fcm/send/a',
          p256dh: 'k1',
          auth: 'a1',
        },
      ]);
      mockSendNotification.mockRejectedValue({ statusCode: 410 });

      await service.sendPushNotification('user-1', 'Title', 'Body');

      expect(mockPrisma.pushSubscription.delete).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
      });
    });

    it('should remove subscription on 404', async () => {
      (service as any).isVapidConfigured = true;
      mockPrisma.pushSubscription.findMany.mockResolvedValue([
        {
          id: 'sub-1',
          endpoint: 'https://fcm.googleapis.com/fcm/send/a',
          p256dh: 'k1',
          auth: 'a1',
        },
      ]);
      mockSendNotification.mockRejectedValue({ statusCode: 404 });

      await service.sendPushNotification('user-1', 'Title', 'Body');

      expect(mockPrisma.pushSubscription.delete).toHaveBeenCalled();
    });

    it('should log error but not remove subscription for other errors', async () => {
      (service as any).isVapidConfigured = true;
      mockPrisma.pushSubscription.findMany.mockResolvedValue([
        {
          id: 'sub-1',
          endpoint: 'https://fcm.googleapis.com/fcm/send/a',
          p256dh: 'k1',
          auth: 'a1',
        },
      ]);
      mockSendNotification.mockRejectedValue({ statusCode: 500 });

      await service.sendPushNotification('user-1', 'Title', 'Body');

      expect(mockPrisma.pushSubscription.delete).not.toHaveBeenCalled();
    });

    it('should handle delete cleanup failure gracefully', async () => {
      (service as any).isVapidConfigured = true;
      mockPrisma.pushSubscription.findMany.mockResolvedValue([
        {
          id: 'sub-1',
          endpoint: 'https://fcm.googleapis.com/fcm/send/a',
          p256dh: 'k1',
          auth: 'a1',
        },
      ]);
      mockSendNotification.mockRejectedValue({ statusCode: 410 });
      mockPrisma.pushSubscription.delete.mockRejectedValue(
        new Error('DB error'),
      );

      await service.sendPushNotification('user-1', 'Title', 'Body');
    });

    it('should default urlPath to /orders', async () => {
      (service as any).isVapidConfigured = true;
      mockPrisma.pushSubscription.findMany.mockResolvedValue([
        {
          id: 'sub-1',
          endpoint: 'https://fcm.googleapis.com/fcm/send/a',
          p256dh: 'k1',
          auth: 'a1',
        },
      ]);
      mockSendNotification.mockResolvedValue({ statusCode: 201 });

      await service.sendPushNotification('user-1', 'Title', 'Body');

      const payload = JSON.parse(mockSendNotification.mock.calls[0][1]);
      expect(payload.url).toBe('/orders');
    });
  });
});
