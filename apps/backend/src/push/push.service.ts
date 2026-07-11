import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private isVapidConfigured = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.configureVapid();
  }

  private configureVapid() {
    let publicKey = process.env.VAPID_PUBLIC_KEY;
    let privateKey = process.env.VAPID_PRIVATE_KEY;
    const email = process.env.RESEND_FROM_EMAIL || 'mailto:admin@qrmenu.app';

    if (!publicKey || !privateKey) {
      this.logger.warn('VAPID keys not fully configured in environment. Generating dynamic fallback keys...');
      const keys = webpush.generateVAPIDKeys();
      publicKey = keys.publicKey;
      privateKey = keys.privateKey;
      
      // Log them so the user can easily add them to their .env file
      this.logger.log(`Generated Public VAPID Key: ${publicKey}`);
      this.logger.log(`Generated Private VAPID Key: ${privateKey}`);
    }

    try {
      webpush.setVapidDetails(email, publicKey, privateKey);
      this.isVapidConfigured = true;
      this.logger.log('Web Push VAPID keys successfully initialized.');
    } catch (error) {
      this.logger.error('Failed to configure Web Push VAPID keys:', error);
    }
  }

  async createSubscription(userId: string, subscription: any) {
    const { endpoint, keys } = subscription;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      throw new Error('Invalid subscription object format');
    }

    return this.prisma.pushSubscription.upsert({
      where: { endpoint },
      create: {
        userId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      },
      update: {
        userId,
        p256dh: keys.p256dh,
        auth: keys.auth,
      },
    });
  }

  async sendPushNotification(userId: string, title: string, body: string, urlPath = '/orders') {
    if (!this.isVapidConfigured) {
      this.logger.warn('Web Push VAPID details are not configured. Cannot send notification.');
      return;
    }

    // Get all active push subscriptions for the specified user
    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { userId },
    });

    if (subscriptions.length === 0) {
      return;
    }

    const payload = JSON.stringify({ title, body, url: urlPath });

    const notificationPromises = subscriptions.map((sub) => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      };

      return webpush.sendNotification(pushSubscription, payload)
        .catch(async (error) => {
          // If the subscription is expired or invalid, remove it from our DB
          if (error.statusCode === 410 || error.statusCode === 404) {
            this.logger.log(`Removing expired or invalid push subscription: ${sub.endpoint}`);
            await this.prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
          } else {
            this.logger.error(`Error sending push notification to endpoint ${sub.endpoint}:`, error);
          }
        });
    });

    await Promise.all(notificationPromises);
  }
}
