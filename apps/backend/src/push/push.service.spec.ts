import * as webpush from 'web-push';
import { Logger } from '@nestjs/common';
import { PushService } from './push.service';

jest.mock('web-push', () => ({
  generateVAPIDKeys: jest.fn(),
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn(),
}));

describe('PushService stale subscription cleanup', () => {
  it('logs a failed database cleanup without aborting the notification batch', async () => {
    const cleanupError = new Error('database unavailable');
    const prisma = {
      pushSubscription: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'subscription-1',
            endpoint: 'https://fcm.googleapis.com/push/1',
            p256dh: 'public-key',
            auth: 'auth-key',
          },
        ]),
        delete: jest.fn().mockRejectedValue(cleanupError),
      },
    };
    const service = new PushService(prisma as never);
    Reflect.set(service, 'isVapidConfigured', true);
    const logger = Reflect.get(service, 'logger') as Logger;
    const loggerError = jest
      .spyOn(logger, 'error')
      .mockImplementation(() => undefined);
    (webpush.sendNotification as jest.Mock).mockRejectedValue({
      statusCode: 410,
    });

    await expect(
      service.sendPushNotification('user-1', 'Title', 'Body'),
    ).resolves.toBeUndefined();

    expect(prisma.pushSubscription.delete).toHaveBeenCalledWith({
      where: { id: 'subscription-1' },
    });
    expect(loggerError).toHaveBeenCalledWith(
      expect.stringContaining('subscription-1'),
      cleanupError.stack,
    );
  });
});
