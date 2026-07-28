import { Injectable } from '@nestjs/common';
import { PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentCoreService } from '../core/payment-core.service';

export type PaymentNotificationKind = 'PAYMENT_SUCCEEDED' | 'PAYMENT_REFUNDED';

export interface PaymentNotificationFeedItem {
  id: string;
  paymentId: string;
  tableSessionId: string | null;
  amount: number;
  tipAmount: number;
  currency: string;
  tableNumber: string | null;
  customerName: string | null;
  provider: string;
  status: string;
  kind: PaymentNotificationKind;
  occurredAt: Date;
  read: boolean;
}

@Injectable()
export class PaymentNotificationFeedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly core: PaymentCoreService,
  ) {}

  async getFeed(restaurantId: string, userId: string, limit = 20) {
    const access = await this.core.verifyRestaurantStaffAccess(
      restaurantId,
      userId,
    );
    if (!this.canReceiveNotifications(access, userId)) {
      return { data: [], unreadCount: 0, readThrough: null };
    }

    const normalizedLimit = Number.isFinite(limit) ? Math.trunc(limit) : 20;
    const boundedLimit = Math.min(Math.max(normalizedLimit, 1), 50);
    const cursor = await this.prisma.paymentNotificationCursor.findUnique({
      where: { userId_restaurantId: { userId, restaurantId } },
      select: { readThrough: true },
    });
    const readThrough = cursor?.readThrough ?? new Date(0);
    const where: Prisma.PaymentWhereInput = {
      restaurantId,
      status: { in: [PaymentStatus.SUCCEEDED, PaymentStatus.REFUNDED] },
    };
    const [payments, unreadCount] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        include: {
          tableSession: {
            include: {
              table: { select: { name: true } },
              orders: {
                select: { customerName: true },
                orderBy: { createdAt: 'desc' as const },
                take: 1,
              },
            },
          },
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: boundedLimit,
      }),
      this.prisma.payment.count({
        where: {
          ...where,
          updatedAt: { gt: readThrough },
        },
      }),
    ]);

    return {
      data: payments.map(
        (payment): PaymentNotificationFeedItem => ({
          id: `payment:${payment.id}`,
          paymentId: payment.id,
          tableSessionId: payment.tableSessionId,
          amount: payment.amount,
          tipAmount: payment.tipAmount,
          currency: payment.currency,
          tableNumber: payment.tableSession?.table?.name ?? null,
          customerName: payment.tableSession?.orders?.[0]?.customerName ?? null,
          provider: payment.provider,
          status: payment.status,
          kind:
            payment.status === 'REFUNDED'
              ? 'PAYMENT_REFUNDED'
              : 'PAYMENT_SUCCEEDED',
          occurredAt: payment.updatedAt,
          read: payment.updatedAt <= readThrough,
        }),
      ),
      unreadCount,
      readThrough: cursor?.readThrough ?? null,
    };
  }

  async markAllRead(restaurantId: string, userId: string) {
    const access = await this.core.verifyRestaurantStaffAccess(
      restaurantId,
      userId,
    );
    const readThrough = new Date();

    if (this.canReceiveNotifications(access, userId)) {
      await this.prisma.paymentNotificationCursor.upsert({
        where: { userId_restaurantId: { userId, restaurantId } },
        create: { userId, restaurantId, readThrough },
        update: { readThrough },
      });
    }

    return { readThrough };
  }

  private canReceiveNotifications(
    access: Awaited<
      ReturnType<PaymentCoreService['verifyRestaurantStaffAccess']>
    >,
    userId: string,
  ) {
    return (
      access.restaurant.ownerId === userId ||
      access.user?.role === 'SUPER_ADMIN' ||
      access.restaurant.notifyAllStaffOnPayment
    );
  }
}
