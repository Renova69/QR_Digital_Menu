import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StripeProvider } from './stripe.provider';
import { EventsGateway } from '../events/events.gateway';
import { FeatureService } from '../subscription/feature.service';
import { FeatureFlag } from '../subscription/feature-flag.enum';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeProvider,
    private readonly events: EventsGateway,
    private readonly featureService: FeatureService,
  ) {}

  async getOrCreateSession(
    tableId: string,
    restaurantId: string,
    token?: string,
  ): Promise<{ session: any; token: string }> {
    if (token) {
      const existing = await this.prisma.tableSession.findFirst({
        where: { token, status: 'OPEN' },
      });
      if (existing) return { session: existing, token };
    }

    const table = await this.prisma.restaurantTable.findFirst({
      where: { id: tableId, restaurantId },
    });
    if (!table) throw new NotFoundException('Table not found for this restaurant');

    const session = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.tableSession.findFirst({
        where: { tableId, restaurantId, status: 'OPEN' },
      });
      if (existing) return existing;
      return tx.tableSession.create({
        data: { tableId, restaurantId },
      });
    });
    return { session, token: session.token };
  }

  async getSessionBill(token: string): Promise<{ orders: any[]; subtotal: number; restaurantId: string; tipsEnabled: boolean; tipOptions: number[] }> {
    const session = await this.prisma.tableSession.findFirst({
      where: { token, status: 'OPEN' },
      include: { restaurant: true },
    });

    if (!session) throw new NotFoundException('Session not found');

    const orders = await this.prisma.order.findMany({
      where: { tableSessionId: session.id },
      include: {
        items: {
          include: {
            menuItem: { select: { name: true, price: true } },
          },
        },
      },
    });

    const subtotal = orders.reduce((sum, o) => sum + o.totalPrice, 0);

    return {
      orders,
      subtotal,
      restaurantId: session.restaurantId,
      tipsEnabled: session.restaurant.tipsEnabled,
      tipOptions: session.restaurant.tipOptions,
    };
  }

  async createPaymentIntent(token: string, tipPercent: number): Promise<{ clientSecret: string; paymentId: string; total: number; tipAmount: number }> {
    const session = await this.prisma.tableSession.findFirst({
      where: { token, status: 'OPEN' },
      include: { restaurant: true },
    });

    if (!session) throw new NotFoundException('Session not found');

    if (tipPercent < 0 || tipPercent > 100) {
      throw new BadRequestException('tipPercent must be between 0 and 100');
    }

    const { restaurant } = session;

    if (!restaurant.paymentsEnabled) {
      throw new ForbiddenException('Payments are not enabled for this restaurant');
    }

    if (!this.featureService.hasFeature(String(restaurant.tier), FeatureFlag.PAYMENTS_STRIPE)) {
      throw new ForbiddenException({ code: 'FEATURE_LOCKED', message: 'Stripe payments require a Professional plan or above' });
    }

    if (!restaurant.stripeOnboarded || !restaurant.stripeAccountId) {
      throw new BadRequestException('Stripe not connected');
    }

    const orders = await this.prisma.order.findMany({
      where: { tableSessionId: session.id },
    });

    const subtotal = orders.reduce((sum, o) => sum + o.totalPrice, 0);
    if (subtotal <= 0) throw new BadRequestException('Cannot create payment for an empty session');

    const tipAmount = Math.round(subtotal * tipPercent) / 100;
    const total = subtotal + tipAmount;
    const platformFeeCents = Math.round(total * restaurant.platformFeePercent);
    const platformFeeAmount = platformFeeCents / 100;

    const payment = await this.prisma.payment.create({
      data: {
        tableSessionId: session.id,
        restaurantId: session.restaurantId,
        amount: total,
        tipAmount,
        platformFeeAmount,
        currency: 'eur',
        status: 'PENDING',
      },
    });

    const { clientSecret, paymentIntentId } = await this.stripe.createPaymentIntent({
      amountCents: Math.round(total * 100),
      currency: 'eur',
      restaurantStripeAccountId: restaurant.stripeAccountId,
      platformFeeCents,
      idempotencyKey: payment.id,
      metadata: { sessionId: session.id, paymentId: payment.id },
    });

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { stripePaymentIntentId: paymentIntentId },
    });

    return { clientSecret, paymentId: payment.id, total, tipAmount };
  }

  async handleWebhookEvent(payload: Buffer, signature: string): Promise<void> {
    const event = this.stripe.constructWebhookEvent(payload, signature);

    if (event.type === 'payment_intent.succeeded') {
      const intent = event.data.object as any;
      let payment = await this.prisma.payment.findFirst({
        where: { stripePaymentIntentId: intent.id },
        include: {
          tableSession: {
            include: { table: { select: { name: true } } },
          },
        },
      });
      if (!payment && intent.metadata?.paymentId) {
        payment = await this.prisma.payment.findFirst({
          where: { id: intent.metadata.paymentId },
          include: {
            tableSession: {
              include: { table: { select: { name: true } } },
            },
          },
        });
      }
      if (!payment) return;

      await this.prisma.$transaction([
        this.prisma.payment.update({
          where: { id: payment.id },
          data: { status: 'SUCCEEDED', stripePaymentIntentId: intent.id },
        }),
        this.prisma.tableSession.updateMany({
          where: { id: payment.tableSessionId, status: 'OPEN' },
          data: { status: 'PAID', paidAt: new Date() },
        }),
      ]);

      const tableNumber = payment.tableSession?.table?.name
        ?? (await this.prisma.restaurantTable.findUnique({
          where: { id: payment.tableSession.tableId },
          select: { name: true },
        }))?.name
        ?? null;

      const customerName = (
        await this.prisma.order.findFirst({
          where: { tableSessionId: payment.tableSessionId },
          orderBy: { createdAt: 'desc' },
          select: { customerName: true },
        })
      )?.customerName ?? null;

      this.events.emitToRestaurant(
        payment.tableSession.restaurantId,
        'payment:confirmed',
        {
          paymentId: payment.id,
          tableSessionId: payment.tableSessionId,
          amount: payment.amount,
          tipAmount: payment.tipAmount,
          tableNumber,
          customerName,
        },
      );

      this.events.emitTableStatusChanged(
        payment.tableSession.restaurantId,
        payment.tableSession.tableId,
        payment.tableSessionId,
      );
    }

    if (event.type === 'payment_intent.payment_failed') {
      const intent = event.data.object as any;
      let payment = await this.prisma.payment.findFirst({
        where: { stripePaymentIntentId: intent.id },
      });
      if (!payment && intent.metadata?.paymentId) {
        payment = await this.prisma.payment.findFirst({
          where: { id: intent.metadata.paymentId },
        });
      }
      if (!payment) return;

      await this.prisma.payment.updateMany({
        where: { id: payment.id, status: 'PENDING' },
        data: { status: 'FAILED' },
      });
    }
  }

  async closeSession(token: string, restaurantId: string): Promise<void> {
    const session = await this.prisma.tableSession.findFirst({
      where: { token, restaurantId, status: 'OPEN' },
    });
    if (!session) throw new NotFoundException('Session not found');

    await this.prisma.tableSession.update({
      where: { id: session.id },
      data: { status: 'CLOSED_NO_PAYMENT' },
    });

    this.events.emitTableStatusChanged(
      restaurantId,
      session.tableId,
      session.id,
    );
  }

  async closeSessionWithCard(
    token: string,
    restaurantId: string,
  ): Promise<{ amount: number }> {
    const session = await this.prisma.tableSession.findFirst({
      where: { token, restaurantId, status: 'OPEN' },
      include: { orders: true },
    });
    if (!session) throw new NotFoundException('Session not found');

    const amount = session.orders.reduce((sum, o) => sum + o.totalPrice, 0);
    if (amount <= 0) throw new BadRequestException('Cannot close a session with no orders');

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          tableSessionId: session.id,
          restaurantId,
          amount,
          tipAmount: 0,
          platformFeeAmount: 0,
          currency: 'eur',
          status: 'SUCCEEDED',
          provider: 'MYPOS',
        },
      });

      const updated = await tx.tableSession.updateMany({
        where: { id: session.id, status: 'OPEN' },
        data: { status: 'PAID', paidAt: new Date() },
      });
      if (updated.count === 0) throw new Error('Session already closed');
    });

    this.events.emitTableStatusChanged(
      restaurantId,
      session.tableId,
      session.id,
    );

    const tableNumber =
      (
        await this.prisma.restaurantTable.findUnique({
          where: { id: session.tableId },
          select: { name: true },
        })
      )?.name ?? null;

    this.events.emitToRestaurant(restaurantId, 'payment:confirmed', {
      tableSessionId: session.id,
      amount,
      tipAmount: 0,
      tableNumber,
    });

    return { amount };
  }

  async closeSessionWithCash(
    token: string,
    restaurantId: string,
  ): Promise<{ amount: number }> {
    const session = await this.prisma.tableSession.findFirst({
      where: { token, restaurantId, status: 'OPEN' },
      include: { orders: true },
    });
    if (!session) throw new NotFoundException('Session not found');

    const amount = session.orders.reduce((sum, o) => sum + o.totalPrice, 0);
    if (amount <= 0) throw new BadRequestException('Cannot close a session with no orders');

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          tableSessionId: session.id,
          restaurantId,
          amount,
          tipAmount: 0,
          platformFeeAmount: 0,
          currency: 'eur',
          status: 'SUCCEEDED',
          provider: 'CASH',
        },
      });

      const updated = await tx.tableSession.updateMany({
        where: { id: session.id, status: 'OPEN' },
        data: { status: 'PAID', paidAt: new Date() },
      });
      if (updated.count === 0) throw new Error('Session already closed');
    });

    this.events.emitTableStatusChanged(
      restaurantId,
      session.tableId,
      session.id,
    );

    const tableNumber =
      (
        await this.prisma.restaurantTable.findUnique({
          where: { id: session.tableId },
          select: { name: true },
        })
      )?.name ?? null;

    this.events.emitToRestaurant(restaurantId, 'payment:confirmed', {
      tableSessionId: session.id,
      amount,
      tipAmount: 0,
      tableNumber,
    });

    return { amount };
  }

  async forceOpenSession(
    tableId: string,
    restaurantId: string,
  ): Promise<{ session: any; token: string }> {
    const table = await this.prisma.restaurantTable.findFirst({
      where: { id: tableId, restaurantId },
    });
    if (!table) throw new NotFoundException('Table not found for this restaurant');

    const session = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.tableSession.findFirst({
        where: { tableId, restaurantId, status: 'OPEN' },
      });
      if (existing) {
        await tx.tableSession.update({
          where: { id: existing.id },
          data: { status: 'CLOSED_NO_PAYMENT' },
        });
        this.events.emitTableStatusChanged(restaurantId, existing.tableId, existing.id);
      }
      return tx.tableSession.create({
        data: { tableId, restaurantId },
      });
    });

    this.events.emitTableStatusChanged(restaurantId, tableId, session.id);
    return { session, token: session.token };
  }

  async getTableSessions(
    restaurantId: string,
    page?: number,
    limit?: number,
  ): Promise<{ data: any[]; meta: { total: number; page: number; limit: number } }> {
    const take = limit ?? 50;
    const skip = page ? (page - 1) * take : 0;

    const data = await this.prisma.tableSession.findMany({
      where: { restaurantId, status: { in: ['OPEN', 'PAID'] } },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });

    return {
      data,
      meta: { total: data.length, page: page ?? 1, limit: take },
    };
  }

  async getPaymentHistory(
    restaurantId: string,
    filters: {
      status?: string;
      startDate?: string;
      endDate?: string;
      page?: number;
      limit?: number;
    },
  ): Promise<{ data: any[]; meta: { total: number; page: number; limit: number } }> {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, 50);
    const skip = (page - 1) * limit;

    const where: any = { restaurantId };
    if (filters.status) where.status = filters.status;
    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = new Date(filters.startDate);
      if (filters.endDate) where.createdAt.lte = new Date(filters.endDate);
    }

    const [data, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        include: {
          tableSession: {
            include: {
              table: { select: { name: true } },
              orders: {
                select: { customerName: true },
                orderBy: { createdAt: 'desc' },
                take: 1,
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.payment.count({ where }),
    ]);

    return {
      data: data.map((p) => ({
        id: p.id,
        amount: p.amount,
        tipAmount: p.tipAmount,
        platformFeeAmount: p.platformFeeAmount,
        currency: p.currency,
        status: p.status,
        stripePaymentIntentId: p.stripePaymentIntentId,
        provider: p.provider,
        createdAt: p.createdAt,
        tableNumber: p.tableSession?.table?.name ?? null,
        customerName: p.tableSession?.orders[0]?.customerName ?? null,
        tableSessionId: p.tableSessionId,
      })),
      meta: { total, page, limit },
    };
  }
}
