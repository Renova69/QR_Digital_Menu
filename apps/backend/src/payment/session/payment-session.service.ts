import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { StripeProvider } from '../stripe.provider';
import { EventsGateway } from '../../events/events.gateway';
import { PaymentCoreService } from '../core/payment-core.service';
import { PaymentProviderConfigService } from '../payment-provider-config.service';
import { PaymentStatus } from '@prisma/client';
import { CheckoutScopeInput } from '../payment-scope.utils';
import {
  ABANDONED_PAYMENT_RETENTION_DAYS,
  CheckoutProvider,
  DAY_MS,
  PendingBillPaymentDto,
  STALE_OPEN_SESSION_HOURS,
} from '../payment.types';

@Injectable()
export class PaymentSessionService {
  private readonly logger = new Logger(PaymentSessionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeProvider,
    private readonly events: EventsGateway,
    private readonly core: PaymentCoreService,
    private readonly config: PaymentProviderConfigService,
  ) {}

  @Cron('0 20 3 * * *', {
    name: 'paymentSessionRetentionCleanup',
    waitForCompletion: true,
  })
  async cleanupAbandonedPaymentsAndStaleSessions(): Promise<void> {
    const abandonedCutoff = new Date(
      Date.now() - ABANDONED_PAYMENT_RETENTION_DAYS * DAY_MS,
    );
    const staleSessionCutoff = new Date(
      Date.now() - STALE_OPEN_SESSION_HOURS * 60 * 60 * 1000,
    );

    const abandoned = await this.prisma.payment.deleteMany({
      where: {
        status: PaymentStatus.ABANDONED,
        updatedAt: { lt: abandonedCutoff },
      },
    });

    let closedNoPayment = 0;
    let markedPaid = 0;
    let partialLeftOpen = 0;

    // Drain in pages instead of a single take:100 cap. A busy service-point
    // kiosk can abandon >100 sessions/day; a fixed cap lets the backlog grow
    // faster than cleanup removes it, leaving live token-addressable bills
    // forever. Partial (part-paid) sessions stay OPEN by design, so exclude
    // already-seen ones to guarantee forward progress and termination. The
    // page cap bounds a single run's work.
    const MAX_CLEANUP_PAGES = 50;
    const seenPartialIds: string[] = [];

    for (let page = 0; page < MAX_CLEANUP_PAGES; page++) {
      const staleSessions = await this.prisma.tableSession.findMany({
        where: {
          status: 'OPEN',
          createdAt: { lt: staleSessionCutoff },
          payments: { none: { status: PaymentStatus.PENDING } },
          ...(seenPartialIds.length ? { id: { notIn: seenPartialIds } } : {}),
        },
        select: { id: true, restaurantId: true, tableId: true },
        orderBy: { createdAt: 'asc' },
        take: 100,
      });

      if (staleSessions.length === 0) break;

      // M-PAY-5: one batched balance query for the whole page instead of two
      // queries per session inside the loop.
      const balances = await this.core.computeSessionAmountBalances(
        this.prisma,
        staleSessions.map((s) => s.id),
      );

      for (const session of staleSessions) {
        const balance = balances.get(session.id) ?? {
          billSubtotal: 0,
          paidSubtotal: 0,
          remaining: 0,
        };
        if (balance.paidSubtotal > 0 && balance.remaining > 0.01) {
          partialLeftOpen++;
          seenPartialIds.push(session.id);
          continue;
        }

        const status =
          balance.billSubtotal > 0 && balance.remaining <= 0.01
            ? 'PAID'
            : 'CLOSED_NO_PAYMENT';

        const updated = await this.prisma.tableSession.updateMany({
          where: { id: session.id, status: 'OPEN' },
          data: {
            status,
            ...(status === 'PAID' ? { paidAt: new Date() } : {}),
          },
        });
        if (updated.count === 0) continue;

        if (status === 'PAID') markedPaid++;
        else closedNoPayment++;

        this.events.emitTableStatusChanged(
          session.restaurantId,
          session.tableId,
          session.id,
        );
      }

      if (staleSessions.length < 100) break;
    }

    if (
      abandoned.count > 0 ||
      closedNoPayment > 0 ||
      markedPaid > 0 ||
      partialLeftOpen > 0
    ) {
      this.logger.log(
        `Payment retention cleanup: abandoned=${abandoned.count}, closedNoPayment=${closedNoPayment}, markedPaid=${markedPaid}, partialLeftOpen=${partialLeftOpen}`,
      );
    }
  }

  async getOrCreateSession(
    tableId: string,
    restaurantId: string,
    token?: string,
  ): Promise<{ session: any; token: string }> {
    if (token) {
      const existing = await this.prisma.tableSession.findFirst({
        where: { token, restaurantId, status: 'OPEN' },
      });
      if (existing) return { session: existing, token };
    }

    const table = await this.prisma.restaurantTable.findFirst({
      where: { id: tableId, restaurantId },
    });
    if (!table)
      throw new NotFoundException('Table not found for this restaurant');

    // Service points (type !== 'TABLE') are isolated per customer: the partial
    // unique index only applies to isServicePoint=false, so multiple OPEN
    // sessions per counter are legal. Without a session token we must NEVER
    // reuse another customer's OPEN session by tableId (that leaks their bill
    // token / lets an attacker attach orders) — always mint a fresh isolated
    // session instead. Regular tables keep the one-open-session-per-table
    // get-or-create.
    if (table.type !== 'TABLE') {
      const session = await this.prisma.tableSession.create({
        data: { tableId, restaurantId, isServicePoint: true },
      });
      return { session, token: session.token };
    }

    let session: any;
    try {
      session = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.tableSession.findFirst({
          where: {
            tableId,
            restaurantId,
            status: 'OPEN',
            isServicePoint: false,
          },
        });
        if (existing) return existing;
        return tx.tableSession.create({
          data: { tableId, restaurantId, isServicePoint: false },
        });
      });
    } catch (error) {
      if (!this.core.isUniqueConstraintError(error)) throw error;

      const existing = await this.prisma.tableSession.findFirst({
        where: { tableId, restaurantId, status: 'OPEN', isServicePoint: false },
      });
      if (!existing) throw error;
      session = existing;
    }
    return { session, token: session.token };
  }

  async getSessionBill(
    token: string,
    lang?: string,
  ): Promise<{
    sessionId: string;
    tableId: string;
    tableName: string | null;
    orders: any[];
    subtotal: number;
    paidSubtotal: number;
    remaining: number;
    splitItemsAvailable: boolean;
    restaurantId: string;
    targetLanguages: string[];
    tipsEnabled: boolean;
    tipOptions: number[];
    paymentProviders: CheckoutProvider[];
    pendingPayment: PendingBillPaymentDto | null;
  }> {
    const session = await this.prisma.tableSession.findFirst({
      where: { token, status: 'OPEN' },
      include: {
        restaurant: true,
        table: { select: { name: true } },
      },
    });

    if (!session) throw new NotFoundException('Session not found');

    const orders = await this.prisma.order.findMany({
      where: { tableSessionId: session.id },
      include: {
        items: {
          include: {
            menuItem: {
              select: { name: true, price: true, translations: true },
            },
          },
        },
        staff: { select: { name: true, email: true, role: true } },
      },
    });

    const subtotal = orders.reduce(
      (sum: number, o: any) => sum + o.totalPrice,
      0,
    );
    const balance = await this.core.computeSessionBalance(
      this.prisma,
      session.id,
    );
    const pendingPayment = await this.core.getPendingBillPayment(session.id);

    // Resolve the display name against the menu item's stored translations for
    // the requested language. `name` is a display field only (the by-item split
    // picker keys on orderItemId), so translating it is safe. Falls back to the
    // canonical stored name when no translation exists for `lang`.
    const translatedName = (menuItem: any): string => {
      const base = menuItem?.name ?? 'Unknown item';
      if (!lang) return base;
      const translated = menuItem?.translations?.[lang]?.name;
      return typeof translated === 'string' && translated ? translated : base;
    };

    const enrichedOrders = orders.map((order) => ({
      id: order.id,
      source: order.source,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      staffName: order.staff ? (order.staff.name ?? order.staff.email) : null,
      staffRole: order.staff?.role ?? null,
      totalPrice: order.totalPrice,
      items: order.items.map((oi: any) => {
        const optionsTotal = Array.isArray(oi.selectedOptions)
          ? (oi.selectedOptions as any[]).reduce(
              (s, x) => s + (x?.priceModifier || 0),
              0,
            )
          : 0;
        return {
          // orderItemId + paidQuantity drive the by-item split picker.
          orderItemId: oi.id,
          name: translatedName(oi.menuItem),
          quantity: oi.quantity,
          paidQuantity: oi.paidQuantity ?? 0,
          unitPrice:
            typeof oi.unitPrice === 'number' && oi.unitPrice > 0
              ? oi.unitPrice
              : (oi.menuItem?.price ?? 0),
          unitPriceWithOptions:
            typeof oi.unitPriceWithOptions === 'number' &&
            oi.unitPriceWithOptions > 0
              ? oi.unitPriceWithOptions
              : this.core.roundMoney((oi.menuItem?.price ?? 0) + optionsTotal),
          selectedOptions: Array.isArray(oi.selectedOptions)
            ? oi.selectedOptions
            : [],
        };
      }),
    }));

    return {
      sessionId: session.id,
      tableId: session.tableId,
      tableName: session.table?.name ?? null,
      orders: enrichedOrders,
      subtotal,
      paidSubtotal: balance.paidSubtotal,
      remaining: balance.remaining,
      // By-item split can't reconcile against a loyalty-discounted total — the UI
      // falls back to even/custom split in that case.
      splitItemsAvailable: !balance.hasLoyaltyDiscount,
      restaurantId: session.restaurantId,
      targetLanguages: session.restaurant.targetLanguages ?? [],
      tipsEnabled: session.restaurant.tipsEnabled,
      tipOptions: session.restaurant.tipOptions,
      paymentProviders: [
        ...(this.config.isStripeConfigured(session.restaurant)
          ? ['STRIPE' as const]
          : []),
        ...(this.config.isEpayConfigured(session.restaurant)
          ? ['EPAY' as const]
          : []),
        ...(this.config.isBoricaConfigured(session.restaurant)
          ? ['BORICA' as const]
          : []),
        ...(this.config.isMyposConfigured(session.restaurant)
          ? ['MYPOS' as const]
          : []),
      ],
      pendingPayment,
    };
  }

  async abandonCheckout(token: string): Promise<void> {
    const session = await this.prisma.tableSession.findFirst({
      where: { token },
    });
    if (!session) return;
    const pendingPayments = await this.prisma.payment.findMany({
      where: { tableSessionId: session.id, status: 'PENDING' },
    });
    if (pendingPayments.length === 0) return;

    // Separate Stripe payments (need external API cancellation) from others.
    const stripePayments = pendingPayments.filter(
      (p) => p.provider === 'STRIPE' && p.stripePaymentIntentId,
    );
    const nonStripePayments = pendingPayments.filter(
      (p) => p.provider !== 'STRIPE' || !p.stripePaymentIntentId,
    );

    // Cancel Stripe PaymentIntents in parallel — each call is an independent
    // HTTP request, no point waiting sequentially (#N+1-C2).
    const abandonedIds: string[] = [...nonStripePayments.map((p) => p.id)];
    if (stripePayments.length > 0) {
      const cancelResults = await Promise.allSettled(
        stripePayments.map((p) =>
          this.stripe.cancelPaymentIntent(p.stripePaymentIntentId!),
        ),
      );
      cancelResults.forEach((result, i) => {
        if (result.status === 'fulfilled') {
          abandonedIds.push(stripePayments[i].id);
        } else {
          this.logger.warn(
            `Could not cancel abandoned PaymentIntent ${stripePayments[i].stripePaymentIntentId} for session ${session.id}`,
          );
          // Payment stays PENDING — safe default; if Stripe can't cancel it,
          // the intent may still succeed and the system should acknowledge it.
        }
      });
    }

    // Batch update all payments whose cancellation succeeded (or didn't need
    // an external API call) in a single query.
    if (abandonedIds.length > 0) {
      await this.prisma.payment.updateMany({
        where: { id: { in: abandonedIds }, status: 'PENDING' },
        data: { status: 'ABANDONED', providerStatus: 'ABANDONED' },
      });
      for (const paymentId of abandonedIds) {
        this.core.emitBillPaymentCleared(
          session.id,
          paymentId,
          'ONLINE_PAYMENT',
        );
      }
    }
  }

  async abandonCheckoutOrThrowIfPending(
    token: string,
    sessionId: string,
  ): Promise<void> {
    await this.abandonCheckout(token);

    const pendingPayment = await this.prisma.payment.findFirst({
      where: { tableSessionId: sessionId, status: 'PENDING' },
      select: { id: true, provider: true, stripePaymentIntentId: true },
    });
    if (!pendingPayment) return;

    this.logger.warn(
      `Refusing POS mutation for session ${sessionId}: payment ${pendingPayment.id} is still pending`,
    );
    throw new ConflictException(
      'A payment for this session is still being processed. Please wait or retry.',
    );
  }

  async closeSession(
    token: string,
    restaurantId: string,
    userId: string,
  ): Promise<void> {
    await this.core.verifyPosOperatorAccess(restaurantId, userId);
    const session = await this.prisma.tableSession.findFirst({
      where: { token, restaurantId, status: 'OPEN' },
    });
    if (!session) throw new NotFoundException('Session not found');

    // Cancel any pending online payments before closing the session.
    // Without this, a customer who started a Stripe checkout while the waiter
    // force-closes would still be charged, but the system would never
    // acknowledge the payment — money stuck in limbo (#C1).
    await this.abandonCheckoutOrThrowIfPending(token, session.id);

    await this.prisma.$transaction(async (tx) => {
      await this.core.lockOpenSessionForSettlement(tx, session.id);
      const pendingPayment = await tx.payment.findFirst({
        where: { tableSessionId: session.id, status: 'PENDING' },
        select: { id: true },
      });
      if (pendingPayment) {
        throw new ConflictException(
          'A payment for this session is still being processed. Please wait or retry.',
        );
      }

      await tx.tableSession.update({
        where: { id: session.id },
        data: { status: 'CLOSED_NO_PAYMENT' },
      });
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
    userId: string,
  ): Promise<{ amount: number }> {
    return this.closeSessionWithProvider(token, restaurantId, userId, 'MYPOS');
  }

  async closeSessionWithCash(
    token: string,
    restaurantId: string,
    userId: string,
  ): Promise<{ amount: number }> {
    return this.closeSessionWithProvider(token, restaurantId, userId, 'CASH');
  }

  /**
   * Shared in-person settlement path for POS closes. MYPOS (card terminal) and
   * CASH are structurally identical — the only difference is the recorded
   * provider — so both delegate here (#L1). Records a SUCCEEDED payment, flips
   * the session to PAID atomically, and emits status + confirmation events.
   */

  async closeSessionWithProvider(
    token: string,
    restaurantId: string,
    userId: string,
    provider: 'MYPOS' | 'CASH',
  ): Promise<{ amount: number }> {
    await this.core.verifyPosOperatorAccess(restaurantId, userId);
    const session = await this.prisma.tableSession.findFirst({
      where: { token, restaurantId, status: 'OPEN' },
    });
    if (!session) throw new NotFoundException('Session not found');

    // Cancel any pending online payments before recording a POS settlement.
    // Without this, a concurrent Stripe checkout that succeeds after the waiter
    // closes would charge the customer twice — once via the terminal/cash and
    // once via the online payment (#POS-C2).
    await this.abandonCheckoutOrThrowIfPending(token, session.id);

    // #2: compute the bill INSIDE the same transaction that flips the session to
    // PAID. Reading orders before the transaction let a QR order placed during
    // the close window slip through unbilled (TOCTOU on the total). Bill only the
    // REMAINING balance so a full close after a partial split collects what's
    // left, not the whole bill again.
    const { amount, paymentId } = await this.prisma.$transaction(async (tx) => {
      await this.core.lockOpenSessionForSettlement(tx, session.id);
      const pendingPayment = await tx.payment.findFirst({
        where: { tableSessionId: session.id, status: 'PENDING' },
        select: { id: true },
      });
      if (pendingPayment) {
        throw new ConflictException(
          'A payment for this session is still being processed. Please wait or retry.',
        );
      }

      const balance = await this.core.computeSessionBalance(tx, session.id);
      const billed = balance.remaining;
      if (billed <= 0)
        throw new BadRequestException(
          'Cannot close a session with no outstanding balance',
        );

      const payment = await tx.payment.create({
        data: {
          tableSessionId: session.id,
          restaurantId,
          amount: billed,
          tipAmount: 0,
          platformFeeAmount: 0,
          currency: 'eur',
          status: 'SUCCEEDED',
          provider,
        },
      });

      const updated = await tx.tableSession.updateMany({
        where: { id: session.id, status: 'OPEN' },
        data: { status: 'PAID', paidAt: new Date() },
      });
      if (updated.count === 0) throw new Error('Session already closed');
      return { amount: billed, paymentId: payment.id };
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
    const customerName =
      (
        await this.prisma.order.findFirst({
          where: { tableSessionId: session.id },
          orderBy: { createdAt: 'desc' },
          select: { customerName: true },
        })
      )?.customerName ?? null;

    const paymentConfirmedPayload = {
      paymentId,
      tableSessionId: session.id,
      amount,
      tipAmount: 0,
      tableNumber,
      customerName,
    };
    this.events.emitToRestaurant(
      restaurantId,
      'payment:confirmed',
      paymentConfirmedPayload,
    );
    this.events.emitToTableSession(
      session.id,
      'payment:confirmed',
      paymentConfirmedPayload,
    );

    return { amount };
  }

  async forceOpenSession(
    tableId: string,
    restaurantId: string,
    userId: string,
  ): Promise<{ session: any; token: string }> {
    await this.core.verifyPosOperatorAccess(restaurantId, userId);
    const table = await this.prisma.restaurantTable.findFirst({
      where: { id: tableId, restaurantId },
    });
    if (!table)
      throw new NotFoundException('Table not found for this restaurant');

    // Cancel any pending online payments on the existing session before
    // force-opening a new one. Without this, a customer who started a Stripe
    // checkout on the old session would still be charged after the session is
    // closed, but the system would never acknowledge the payment (#C3).
    const existing = await this.prisma.tableSession.findFirst({
      where: { tableId, restaurantId, status: 'OPEN' },
    });
    if (existing) {
      await this.abandonCheckoutOrThrowIfPending(existing.token, existing.id);
    }

    const { session, closedSession } = await this.prisma.$transaction(
      async (tx) => {
        const existingInTx = await tx.tableSession.findFirst({
          where: { tableId, restaurantId, status: 'OPEN' },
        });
        if (existingInTx) {
          await this.core.lockOpenSessionForSettlement(tx, existingInTx.id);
          const pendingPayment = await tx.payment.findFirst({
            where: { tableSessionId: existingInTx.id, status: 'PENDING' },
            select: { id: true },
          });
          if (pendingPayment) {
            throw new ConflictException(
              'A payment for this session is still being processed. Please wait or retry.',
            );
          }

          await tx.tableSession.update({
            where: { id: existingInTx.id },
            data: { status: 'CLOSED_NO_PAYMENT' },
          });
        }
        const created = await tx.tableSession.create({
          data: {
            tableId,
            restaurantId,
            isServicePoint: table.type !== 'TABLE',
          },
        });
        return { session: created, closedSession: existingInTx };
      },
    );

    // Emit socket events only after the transaction commits — emitting inside a
    // transaction can fire for work that later rolls back (#H4).
    if (closedSession) {
      this.events.emitTableStatusChanged(
        restaurantId,
        closedSession.tableId,
        closedSession.id,
      );
    }
    this.events.emitTableStatusChanged(restaurantId, tableId, session.id);
    return { session, token: session.token };
  }
}
