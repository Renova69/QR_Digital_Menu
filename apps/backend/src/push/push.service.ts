import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import * as webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Exact hosts / host suffixes of the browser push services we accept. The
 * subscription `endpoint` is later fetched server-side by web-push, so an
 * unvalidated endpoint is an SSRF vector (metadata IP, internal hosts). Only
 * these HTTPS push origins may be persisted.
 */
const ALLOWED_PUSH_HOSTS: readonly string[] = [
  'fcm.googleapis.com', // Chrome / Chromium / FCM
  'web.push.apple.com', // Safari / Apple
];
const ALLOWED_PUSH_HOST_SUFFIXES: readonly string[] = [
  '.push.services.mozilla.com', // Firefox (updates.push.services.mozilla.com)
  '.notify.windows.com', // Edge / WNS
];

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private isVapidConfigured = false;

  constructor(private readonly prisma: PrismaService) {}

  /** Reject any endpoint that isn't an HTTPS URL on a known push service host. */
  private assertAllowedPushEndpoint(endpoint: string): void {
    let url: URL;
    try {
      url = new URL(endpoint);
    } catch {
      throw new BadRequestException('Invalid push endpoint');
    }
    const host = url.hostname.toLowerCase();
    const allowed =
      url.protocol === 'https:' &&
      (ALLOWED_PUSH_HOSTS.includes(host) ||
        ALLOWED_PUSH_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix)));
    if (!allowed) {
      throw new BadRequestException('Unsupported push endpoint');
    }
  }

  onModuleInit() {
    this.configureVapid();
  }

  private configureVapid() {
    let publicKey = process.env.VAPID_PUBLIC_KEY;
    let privateKey = process.env.VAPID_PRIVATE_KEY;
    let email = process.env.RESEND_FROM_EMAIL || 'mailto:admin@qrmenu.app';
    if (email && !email.startsWith('mailto:') && !email.startsWith('https:')) {
      email = `mailto:${email}`;
    }

    if (!publicKey || !privateKey) {
      if (process.env.NODE_ENV === 'production') {
        // Fail loud but safe. Never fall back to ephemeral keys in production:
        // they change on every restart and differ per Cloud Run instance, so
        // subscriptions silently break. Leave Web Push DISABLED
        // (isVapidConfigured stays false) and log an error — don't crash a
        // non-critical feature, but make the missing config impossible to miss.
        this.logger.error(
          'VAPID keys are not configured (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY). ' +
            'Web Push is DISABLED. Set both in the environment / secret manager.',
        );
        return;
      }

      this.logger.warn(
        'VAPID keys not fully configured in environment. Generating ephemeral dev fallback keys...',
      );
      const keys = webpush.generateVAPIDKeys();
      publicKey = keys.publicKey;
      privateKey = keys.privateKey;

      // Log ONLY the public key. The private key is a secret — never write it to
      // any log sink (Cloud Logging retains it). The public key is enough for the
      // operator to correlate; the pair must be set in env for stable delivery.
      this.logger.warn(
        `Generated ephemeral VAPID public key: ${publicKey}. ` +
          'Set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY in the environment — ephemeral ' +
          'keys change on every restart and invalidate all existing subscriptions.',
      );
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
      throw new BadRequestException('Invalid subscription object format');
    }
    this.assertAllowedPushEndpoint(endpoint);

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

  async sendPushNotification(
    userId: string,
    title: string,
    body: string,
    urlPath = '/orders',
  ) {
    if (!this.isVapidConfigured) {
      this.logger.warn(
        'Web Push VAPID details are not configured. Cannot send notification.',
      );
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

      return webpush
        .sendNotification(pushSubscription, payload)
        .catch(async (error) => {
          // If the subscription is expired or invalid, remove it from our DB
          if (error.statusCode === 410 || error.statusCode === 404) {
            this.logger.log(
              `Removing expired or invalid push subscription: ${sub.endpoint}`,
            );
            try {
              await this.prisma.pushSubscription.delete({
                where: { id: sub.id },
              });
            } catch (cleanupError) {
              this.logger.error(
                `Failed to remove stale push subscription ${sub.id} (${sub.endpoint})`,
                cleanupError instanceof Error
                  ? cleanupError.stack
                  : String(cleanupError),
              );
            }
          } else {
            this.logger.error(
              `Error sending push notification to endpoint ${sub.endpoint}:`,
              error,
            );
          }
        });
    });

    await Promise.all(notificationPromises);
  }
}
