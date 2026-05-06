import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StripeProvider } from './stripe.provider';
import { EventsGateway } from '../events/events.gateway';

@Injectable()
export class PaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeProvider,
    private readonly events: EventsGateway,
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

    const session = await this.prisma.tableSession.create({
      data: { tableId, restaurantId },
    });
    return { session, token: session.token };
  }

  async getSessionBill(token: string) {
    const session = await this.prisma.tableSession.findFirst({
      where: { token, status: 'OPEN' },
      include: { restaurant: true },
    });

    if (!session) throw new NotFoundException('Session not found');

    const orders = await this.prisma.order.findMany({
      where: { tableSessionId: session.id },
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

  async createPaymentIntent(token: string, tipPercent: number) {
    const session = await this.prisma.tableSession.findFirst({
      where: { token, status: 'OPEN' },
      include: { restaurant: true },
    });

    if (!session) throw new NotFoundException('Session not found');

    const { restaurant } = session;

    if (!restaurant.paymentsEnabled) {
      throw new ForbiddenException('Payments are not enabled for this restaurant');
    }

    if (!restaurant.stripeOnboarded || !restaurant.stripeAccountId) {
      throw new BadRequestException('Stripe not connected');
    }

    const orders = await this.prisma.order.findMany({
      where: { tableSessionId: session.id },
    });

    const subtotal = orders.reduce((sum, o) => sum + o.totalPrice, 0);
    const tipAmount = Math.round(subtotal * tipPercent) / 100;
    const total = subtotal + tipAmount;
    const platformFee = (total * restaurant.platformFeePercent) / 100;

    const payment = await this.prisma.payment.create({
      data: {
        tableSessionId: session.id,
        restaurantId: session.restaurantId,
        amount: total,
        tipAmount,
        platformFeeAmount: platformFee,
        currency: 'eur',
        status: 'PENDING',
      },
    });

    const { clientSecret, paymentIntentId } = await this.stripe.createPaymentIntent({
      amountCents: Math.round(total * 100),
      currency: 'eur',
      restaurantStripeAccountId: restaurant.stripeAccountId,
      platformFeeCents: Math.round(platformFee * 100),
      metadata: { sessionId: session.id, paymentId: payment.id },
    });

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { stripePaymentIntentId: paymentIntentId },
    });

    return { clientSecret, paymentId: payment.id, total, tipAmount };
  }

  async handleWebhookEvent(payload: Buffer, signature: string) {
    const event = this.stripe.constructWebhookEvent(payload, signature);

    if (event.type === 'payment_intent.succeeded') {
      const intent = event.data.object as any;
      const payment = await this.prisma.payment.findFirst({
        where: { stripePaymentIntentId: intent.id },
        include: { tableSession: true },
      });
      if (!payment) return;

      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'SUCCEEDED', stripePaymentIntentId: intent.id },
      });

      await this.prisma.tableSession.update({
        where: { id: payment.tableSessionId },
        data: { status: 'PAID', paidAt: new Date() },
      });

      this.events.emitToRestaurant(
        payment.tableSession.restaurantId,
        'payment:confirmed',
        { paymentId: payment.id, tableSessionId: payment.tableSessionId },
      );
    }

    if (event.type === 'payment_intent.payment_failed') {
      const intent = event.data.object as any;
      const payment = await this.prisma.payment.findFirst({
        where: { stripePaymentIntentId: intent.id },
      });
      if (!payment) return;

      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED' },
      });
    }
  }

  async closeSession(token: string, restaurantId: string) {
    const session = await this.prisma.tableSession.findFirst({
      where: { token, restaurantId, status: 'OPEN' },
    });
    if (!session) throw new NotFoundException('Session not found');

    await this.prisma.tableSession.update({
      where: { id: session.id },
      data: { status: 'CLOSED_NO_PAYMENT' },
    });
  }

  async getTableSessions(restaurantId: string) {
    return this.prisma.tableSession.findMany({
      where: { restaurantId, status: { in: ['OPEN', 'PAID'] } },
      orderBy: { createdAt: 'desc' },
    });
  }
}
