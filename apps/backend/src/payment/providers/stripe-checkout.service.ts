import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsGateway } from '../../events/events.gateway';
import { FeatureService } from '../../subscription/feature.service';
import { FeatureFlag } from '../../subscription/feature-flag.enum';
import { StripeProvider } from '../stripe.provider';
import { PaymentCoreService } from '../core/payment-core.service';
import { PaymentProviderConfigService } from '../payment-provider-config.service';
import { PaymentProvider, PaymentStatus, Prisma } from '@prisma/client';
import { SplitMode } from '../dto/settle-partial.dto';
import {
  CheckoutScopeInput,
  checkoutScopePayload,
  normalizeCheckoutScope,
  paymentScopeMatches,
} from '../payment-scope.utils';

@Injectable()
export class StripeCheckoutService {
  private readonly logger = new Logger(StripeCheckoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeProvider,
    private readonly events: EventsGateway,
    private readonly featureService: FeatureService,
    private readonly core: PaymentCoreService,
    private readonly config: PaymentProviderConfigService,
  ) {}

  async createPaymentIntent(
    token: string,
    tipPercent: number,
    checkoutScope?: CheckoutScopeInput,
  ): Promise<{
    clientSecret: string;
    paymentId: string;
    total: number;
    tipAmount: number;
  }> {
    const session = await this.prisma.tableSession.findFirst({
      where: { token, status: 'OPEN' },
      include: { restaurant: true },
    });

    if (!session) throw new NotFoundException('Session not found');

    const normalizedTipPercent = this.core.normalizeTipPercent(tipPercent);

    const { restaurant } = session;

    if (!restaurant.paymentsEnabled) {
      throw new ForbiddenException(
        'Payments are not enabled for this restaurant',
      );
    }

    if (
      !this.featureService.restaurantHasFeature(
        restaurant,
        FeatureFlag.PAYMENTS_STRIPE,
      )
    ) {
      throw new ForbiddenException({
        code: 'FEATURE_LOCKED',
        message: 'Stripe payments require a Professional plan or above',
      });
    }

    if (!restaurant.stripeOnboarded || !restaurant.stripeAccountId) {
      throw new BadRequestException('Stripe not connected');
    }

    // Charge the REMAINING balance, not the full bill — POS split settlements may
    // already have paid part of it. With no partials, remaining == full subtotal.
    const {
      tipAmount,
      total,
      platformFeeCents,
      platformFeeAmount,
      checkoutScope: resolvedCheckoutScope,
      checkoutScopeKey,
    } = await this.core.resolveCheckoutCharge(
      this.prisma,
      session,
      normalizedTipPercent,
      restaurant.platformFeePercent ?? 0,
      checkoutScope,
    );

    // platformFeePercent is a WHOLE-NUMBER percent (e.g. 5 = 5%), not a fraction
    // (#L1). fee_in_cents = total_euros × percent works only under that unit:
    //   €20 × 5 = 100 cents = €1.00 = 5% of €20.
    // If this is ever stored as a fraction (0.05), fees become 100× too small.
    const amountCents = Math.round(total * 100);
    const stripeCheckoutKey = this.core.buildStripeCheckoutKey(
      session.id,
      amountCents,
      platformFeeCents,
      checkoutScopeKey,
    );

    // Guard against double capture (#H1). A session can accumulate multiple
    // intents (double-click, retried tab) and all could be confirmed. A fully
    // paid session is already rejected by the remaining<=0 check above; here we
    // only deal with stale PENDING intents so the newest one is capturable.
    // SUCCEEDED partials (POS split settlements) must be left untouched — they
    // already reduced `remaining`, which this intent now charges.
    const existingPayments = await this.prisma.payment.findMany({
      where: {
        tableSessionId: session.id,
        status: { in: ['PENDING'] },
      },
    });

    // Issue 35: Idempotency — reuse an existing PENDING Stripe intent when the
    // cart amount hasn't changed. Prevents orphaned authorized holds on double-tap.
    const matchingIntent = existingPayments.find(
      (p) =>
        p.provider === 'STRIPE' &&
        p.status === 'PENDING' &&
        p.stripePaymentIntentId &&
        paymentScopeMatches(p, resolvedCheckoutScope) &&
        (!p.providerReference || p.providerReference === stripeCheckoutKey) &&
        Math.abs((p.amount ?? 0) - total) < 0.001,
    );
    const ignoredPendingPaymentIds: string[] = [];
    if (matchingIntent?.stripePaymentIntentId) {
      const existing = await this.stripe.retrievePaymentIntent(
        matchingIntent.stripePaymentIntentId,
      );
      if (existing?.clientSecret) {
        this.core.emitPendingBillPayment(
          this.core.formatPendingPayment({
            ...matchingIntent,
            tableSessionId: session.id,
          }),
        );
        return {
          clientSecret: existing.clientSecret,
          paymentId: matchingIntent.id,
          total,
          tipAmount,
        };
      }
      await this.prisma.payment.updateMany({
        where: { id: matchingIntent.id, status: 'PENDING' },
        data: {
          status: 'ABANDONED',
          providerStatus: 'ABANDONED',
          providerReference: null,
        },
      });
      this.core.emitBillPaymentCleared(
        session.id,
        matchingIntent.id,
        'ONLINE_PAYMENT',
      );
      ignoredPendingPaymentIds.push(matchingIntent.id);
    }

    let payment: { id: string };
    try {
      payment = await this.core.createPendingPaymentAfterScopeGuard(
        session.id,
        resolvedCheckoutScope,
        {
          tableSessionId: session.id,
          restaurantId: session.restaurantId,
          amount: total,
          tipAmount,
          platformFeeAmount,
          currency: 'eur',
          status: 'PENDING',
          provider: 'STRIPE',
          providerReference: stripeCheckoutKey,
          providerPayload: checkoutScopePayload(resolvedCheckoutScope) as any,
          splitMode: resolvedCheckoutScope ? SplitMode.ITEM : undefined,
        },
        { ignorePaymentIds: ignoredPendingPaymentIds },
      );
    } catch (error) {
      if (!this.core.isUniqueConstraintError(error)) throw error;
      const existing = await this.prisma.payment.findFirst({
        where: { provider: 'STRIPE', providerReference: stripeCheckoutKey },
      });
      if (existing?.status === 'SUCCEEDED') {
        throw new ConflictException('This session has already been paid');
      }
      if (existing?.status === 'PENDING' && existing.stripePaymentIntentId) {
        const intent = await this.stripe.retrievePaymentIntent(
          existing.stripePaymentIntentId,
        );
        if (intent?.clientSecret) {
          return {
            clientSecret: intent.clientSecret,
            paymentId: existing.id,
            total,
            tipAmount,
          };
        }
      }
      throw new ConflictException(
        'A payment for this session is already being prepared',
      );
    }

    try {
      const { clientSecret, paymentIntentId } =
        await this.stripe.createPaymentIntent({
          amountCents,
          currency: 'eur',
          restaurantStripeAccountId: restaurant.stripeAccountId,
          platformFeeCents,
          idempotencyKey: stripeCheckoutKey,
          metadata: {
            sessionId: session.id,
            paymentId: payment.id,
            ...(checkoutScopeKey ? { checkoutScopeKey } : {}),
          },
        });

      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { stripePaymentIntentId: paymentIntentId },
      });

      this.core.emitPendingBillPayment(
        this.core.formatPendingPayment({
          id: payment.id,
          tableSessionId: session.id,
          provider: 'STRIPE',
          providerPayload: checkoutScopePayload(resolvedCheckoutScope),
          amount: total,
          createdAt: new Date(),
        }),
      );

      return { clientSecret, paymentId: payment.id, total, tipAmount };
    } catch (err) {
      // Stripe failed after the PENDING record was created — mark it FAILED so
      // it doesn't linger forever and block future intents for this session.
      await this.prisma.payment
        .update({
          where: { id: payment.id },
          data: { status: 'FAILED', providerReference: null },
        })
        .catch(() => {});
      throw err;
    }
  }

  async handleWebhookEvent(payload: Buffer, signature: string): Promise<void> {
    const event = this.stripe.constructWebhookEvent(payload, signature);

    if (event.type === 'payment_intent.succeeded') {
      const intent = event.data.object;
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

      // Idempotent claim: a provider callback can only win while the session is
      // still OPEN and the exact payment row is still pending/abandoned.
      const claim = await this.prisma.$transaction(async (tx) => {
        const recorded = await this.core.recordProviderEvent(
          tx,
          PaymentProvider.STRIPE,
          event.id,
          {
            paymentId: payment.id,
            restaurantId: payment.restaurantId,
            payload: { type: event.type, paymentIntentId: intent.id },
          },
        );
        if (!recorded) return { claimed: false, sessionPaid: false };

        return this.core.claimSuccessfulPayment(tx, payment, {
          status: 'SUCCEEDED',
          stripePaymentIntentId: intent.id,
        });
      });
      await this.core.emitPaymentClaimEvents(payment, claim);
    }

    if (event.type === 'payment_intent.payment_failed') {
      const intent = event.data.object;
      let payment = await this.prisma.payment.findFirst({
        where: { stripePaymentIntentId: intent.id },
      });
      if (!payment && intent.metadata?.paymentId) {
        payment = await this.prisma.payment.findFirst({
          where: { id: intent.metadata.paymentId },
        });
      }
      if (!payment) return;

      await this.prisma.$transaction(async (tx) => {
        const recorded = await this.core.recordProviderEvent(
          tx,
          PaymentProvider.STRIPE,
          event.id,
          {
            paymentId: payment.id,
            restaurantId: payment.restaurantId,
            payload: { type: event.type, paymentIntentId: intent.id },
          },
        );
        if (!recorded) return;

        await tx.payment.updateMany({
          where: { id: payment.id, status: 'PENDING' },
          data: { status: 'FAILED' },
        });
      });
    }

    // F-PAY-1: authoritative confirmation of a refund's outcome. Resolves a
    // payment left in REFUND_PENDING by refundPayment()'s ambiguous-error
    // path — succeeded confirms REFUNDED, failed/canceled confirms it's safe
    // to restore allocations. A refund still `pending` produces no event
    // worth acting on yet, so it's ignored until it resolves.
    if (event.type === 'refund.updated') {
      const refundObj = event.data.object as unknown as {
        id: string;
        status: string | null;
        payment_intent: string | { id: string } | null;
      };
      const paymentIntentId =
        typeof refundObj.payment_intent === 'string'
          ? refundObj.payment_intent
          : refundObj.payment_intent?.id;
      if (!paymentIntentId) return;
      if (
        refundObj.status !== 'succeeded' &&
        refundObj.status !== 'failed' &&
        refundObj.status !== 'canceled'
      ) {
        return;
      }

      const payment = await this.prisma.payment.findFirst({
        where: {
          stripePaymentIntentId: paymentIntentId,
          status: 'REFUND_PENDING',
        },
        include: {
          tableSession: { include: { table: { select: { name: true } } } },
          allocations: {
            select: { orderItemId: true, quantity: true, amount: true },
          },
        },
      });
      // Nothing to reconcile: already resolved by us, or not a tracked payment.
      if (!payment) return;

      const recorded = await this.prisma.$transaction((tx) =>
        this.core.recordProviderEvent(tx, PaymentProvider.STRIPE, event.id, {
          paymentId: payment.id,
          restaurantId: payment.restaurantId,
          payload: {
            type: event.type,
            refundId: refundObj.id,
            status: refundObj.status,
          },
        }),
      );
      if (!recorded) return;

      if (refundObj.status === 'succeeded') {
        const { count } = await this.prisma.payment.updateMany({
          where: { id: payment.id, status: 'REFUND_PENDING' },
          data: { status: 'REFUNDED' },
        });
        if (count === 1) {
          this.events.emitToRestaurant(
            payment.restaurantId,
            'payment:refunded',
            {
              paymentId: payment.id,
              tableSessionId: payment.tableSessionId,
              amount: payment.amount,
              tableNumber: payment.tableSession?.table?.name ?? null,
              refundId: refundObj.id,
            },
          );
        }
      } else {
        await this.restoreAllocationsAndStatus(
          payment.id,
          payment.allocations ?? [],
        );
        this.logger.warn(
          `Refund ${refundObj.id} for payment ${payment.id} ended as ${refundObj.status} at Stripe — restored allocations/status`,
        );
      }
    }
  }

  async refundPayment(
    paymentId: string,
    userId: string,
    data: { amount?: number; reason?: string },
  ) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        tableSession: {
          include: { table: { select: { name: true } } },
        },
        allocations: {
          select: { orderItemId: true, quantity: true, amount: true },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    await this.core.verifyRestaurantAccess(payment.restaurantId, userId);

    const refundAmount = data.amount ?? payment.amount;
    if (Math.abs(refundAmount - payment.amount) > 0.001) {
      throw new BadRequestException('Partial refunds are not supported yet');
    }

    if (payment.provider === 'MYPOS') {
      throw new BadRequestException(
        'MYPOS card refunds must be processed at the physical terminal',
      );
    }

    if (payment.provider === 'CASH') {
      throw new BadRequestException(
        'Cash payment refunds must be processed manually at the restaurant',
      );
    }

    if (payment.provider === 'EPAY') {
      throw new BadRequestException(
        'ePay.bg refunds must be processed in the ePay.bg merchant account',
      );
    }

    if (payment.provider === 'BORICA') {
      throw new BadRequestException(
        'BORICA refunds must be processed in the BORICA merchant portal',
      );
    }

    // Atomic claim — prevents duplicate refunds under concurrent requests.
    // updateMany with status condition acts as an optimistic lock: only one
    // request will get count=1; all others see count=0 and are rejected.
    // F-PAY-1: claim into REFUND_PENDING, not straight to REFUNDED — the
    // Stripe call hasn't happened yet, and its outcome can be genuinely
    // ambiguous (timeout/5xx). REFUNDED is only set once we have positive
    // confirmation (synchronous success, webhook, or reconciliation poll).
    const { count } = await this.prisma.payment.updateMany({
      where: { id: paymentId, status: 'SUCCEEDED' },
      data: { status: 'REFUND_PENDING' },
    });

    if (count === 0) {
      throw new ConflictException(
        'Payment has already been refunded or is not in a refundable state',
      );
    }

    // F-PAY-1: reverse the internal paid-quantity allocation BEFORE contacting
    // Stripe, not after. If this purely-internal step fails, nothing external
    // has happened yet, so rolling back the REFUNDED claim is fully safe. The
    // previous ordering (Stripe first, allocation reversal second) could leave
    // money refunded at Stripe while paidQuantity was never decremented, with
    // no safe way to undo the external refund automatically.
    const allocations = payment.allocations ?? [];
    if (allocations.length > 0) {
      try {
        await this.prisma.$transaction(async (tx) => {
          for (const allocation of allocations) {
            const restored = await tx.orderItem.updateMany({
              where: {
                id: allocation.orderItemId,
                paidQuantity: { gte: allocation.quantity },
              },
              data: { paidQuantity: { decrement: allocation.quantity } },
            });
            if (restored.count === 0) {
              throw new Error(
                `Could not reverse split allocation for order item ${allocation.orderItemId}`,
              );
            }
          }

          await tx.paymentAllocation.deleteMany({
            where: { paymentId: payment.id },
          });
        });
      } catch (err) {
        await this.prisma.payment
          .updateMany({
            where: { id: paymentId, status: 'REFUND_PENDING' },
            data: { status: 'SUCCEEDED' },
          })
          .catch(() => {});
        this.logger.error(
          `Allocation reversal failed for ${paymentId}, refund aborted before contacting Stripe`,
          err,
        );
        throw err;
      }
    }

    let refund: { refundId: string; status: string | null } | null = null;
    let refundConfirmed = false;
    if (payment.provider === 'STRIPE') {
      if (!payment.stripePaymentIntentId) {
        await this.restoreAllocationsAndStatus(paymentId, allocations);
        throw new BadRequestException('Stripe payment intent is missing');
      }
      try {
        refund = await this.stripe.createRefund({
          paymentIntentId: payment.stripePaymentIntentId,
          amountCents: Math.round(payment.amount * 100),
          reason: data.reason,
          // Deterministic per-payment key: a retried request after a
          // lost/timed-out response reconciles to the same Stripe refund
          // instead of risking a second one.
          idempotencyKey: `refund_${paymentId}`,
        });
        // Confirmed synchronously — finalize now (the common case).
        await this.prisma.payment.updateMany({
          where: { id: paymentId, status: 'REFUND_PENDING' },
          data: { status: 'REFUNDED' },
        });
        refundConfirmed = true;
      } catch (err) {
        if (this.isDefinitiveRefundFailure(err)) {
          // Stripe explicitly rejected the request — nothing was created.
          // Safe to fully undo both the allocation reversal and the claim.
          await this.restoreAllocationsAndStatus(paymentId, allocations);
          this.logger.error(
            `Stripe refund definitively failed for ${paymentId}, status and allocations rolled back`,
            err,
          );
          throw err;
        }
        // Ambiguous outcome (timeout/connection/5xx): Stripe may have
        // already created the refund. Do NOT guess — leave the payment in
        // REFUND_PENDING with allocations already reversed, and let the
        // refund.updated webhook or the reconciliation cron resolve it from
        // Stripe's authoritative state. Guessing wrong here is exactly the
        // "money refunded but internal state says otherwise" bug this whole
        // fix exists to prevent. Still surface the error to the caller (the
        // request itself did not complete successfully) — only the internal
        // rollback decision differs from the definitive-failure branch above.
        this.logger.error(
          `CRITICAL: Stripe refund outcome unknown for ${paymentId} (ambiguous error) — left as REFUND_PENDING pending webhook/reconciliation`,
          err,
        );
        throw err;
      }
    }

    const updated = await this.prisma.payment.findUnique({
      where: { id: paymentId },
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
    });

    if (refundConfirmed) {
      this.events.emitToRestaurant(payment.restaurantId, 'payment:refunded', {
        paymentId: payment.id,
        tableSessionId: payment.tableSessionId,
        amount: payment.amount,
        tableNumber: payment.tableSession?.table?.name ?? null,
        refundId: refund?.refundId ?? null,
      });
    }

    return {
      payment: this.core.mapPayment(updated!),
      refund,
    };
  }

  /**
   * Undo an already-applied allocation reversal and the REFUND_PENDING claim.
   * Only ever called once we're SURE no refund was created at Stripe (a
   * definitive rejection, a missing payment intent, or Stripe's own webhook/
   * reconciliation confirming failure) — this is a pure-internal
   * compensating action (F-PAY-1).
   */
  private async restoreAllocationsAndStatus(
    paymentId: string,
    allocations: { orderItemId: string; quantity: number; amount: number }[],
  ): Promise<void> {
    await this.prisma
      .$transaction(async (tx) => {
        // Atomic claim first: two callers can race for the same stuck
        // REFUND_PENDING payment (the refund.updated webhook and the
        // reconciliation cron both observing it around the same time, or the
        // cron running concurrently across replicas). Only the caller that
        // wins this compare-and-swap proceeds to restore allocations —
        // otherwise both would apply the increment/createMany unconditionally
        // and double-credit paidQuantity even though only one flips the
        // status (the loser's status updateMany would just no-op).
        const claim = await tx.payment.updateMany({
          where: { id: paymentId, status: 'REFUND_PENDING' },
          data: { status: 'SUCCEEDED' },
        });
        if (claim.count !== 1) return;

        for (const allocation of allocations) {
          await tx.orderItem.updateMany({
            where: { id: allocation.orderItemId },
            data: { paidQuantity: { increment: allocation.quantity } },
          });
        }
        if (allocations.length > 0) {
          await tx.paymentAllocation.createMany({
            data: allocations.map((a) => ({
              paymentId,
              orderItemId: a.orderItemId,
              quantity: a.quantity,
              amount: a.amount,
            })),
          });
        }
      })
      .catch((rollbackErr) => {
        this.logger.error(
          `CRITICAL: failed to restore allocations/status for ${paymentId} after an aborted refund — manual reconciliation required`,
          rollbackErr,
        );
      });
  }

  /**
   * True only when Stripe's response proves the refund request was rejected
   * before anything was created (bad params, already-refunded charge, auth/
   * rate-limit failure). False (ambiguous) for connection/timeout/5xx errors,
   * where the request may have reached Stripe and created a refund anyway —
   * those must NOT be treated as "safe to roll back" (F-PAY-1).
   */
  private isDefinitiveRefundFailure(err: unknown): boolean {
    const type = (err as { type?: string } | null)?.type;
    return (
      type === 'StripeInvalidRequestError' ||
      type === 'StripeAuthenticationError' ||
      type === 'StripePermissionError' ||
      type === 'StripeRateLimitError' ||
      type === 'StripeIdempotencyError'
    );
  }

  /**
   * F-PAY-1 reconciliation cron: a refund can be left in REFUND_PENDING if
   * the webhook never arrives (delivery failure, misconfigured endpoint) —
   * poll Stripe directly for anything stuck long enough that a normal
   * async refund should have resolved by now.
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async reconcilePendingRefunds(): Promise<void> {
    const staleBefore = new Date(Date.now() - 10 * 60 * 1000);
    const stuck = await this.prisma.payment.findMany({
      where: {
        status: 'REFUND_PENDING',
        provider: 'STRIPE',
        updatedAt: { lt: staleBefore },
      },
      // Defensive cap: refunds normally resolve within seconds, so this
      // should stay tiny, but a prolonged Stripe/webhook outage shouldn't be
      // able to make a single cron tick scan an unbounded backlog.
      take: 100,
      include: {
        allocations: {
          select: { orderItemId: true, quantity: true, amount: true },
        },
      },
    });

    for (const payment of stuck) {
      if (!payment.stripePaymentIntentId) {
        // Should be unreachable — refundPayment() always restores+throws
        // before a payment can reach REFUND_PENDING without an intent ID.
        // Warn rather than throw so one bad row can't block the batch.
        this.logger.warn(
          `Reconciliation: payment ${payment.id} is REFUND_PENDING with no stripePaymentIntentId — skipping`,
        );
        continue;
      }
      try {
        const refunds = await this.stripe.listRefundsForPaymentIntent(
          payment.stripePaymentIntentId,
        );
        const succeeded = refunds.find((r) => r.status === 'succeeded');
        const stillPending = refunds.some((r) => r.status === 'pending');

        if (succeeded) {
          const { count } = await this.prisma.payment.updateMany({
            where: { id: payment.id, status: 'REFUND_PENDING' },
            data: { status: 'REFUNDED' },
          });
          if (count === 1) {
            this.events.emitToRestaurant(
              payment.restaurantId,
              'payment:refunded',
              {
                paymentId: payment.id,
                tableSessionId: payment.tableSessionId,
                amount: payment.amount,
                tableNumber: null,
                refundId: succeeded.id,
              },
            );
            this.logger.warn(
              `Reconciliation: confirmed refund for payment ${payment.id} via Stripe API poll`,
            );
          }
        } else if (!stillPending) {
          await this.restoreAllocationsAndStatus(
            payment.id,
            payment.allocations ?? [],
          );
          this.logger.warn(
            `Reconciliation: no successful/pending refund found at Stripe for payment ${payment.id} — restored allocations/status`,
          );
        }
        // else: still pending at Stripe — leave as REFUND_PENDING, recheck next run.
      } catch (err) {
        this.logger.error(
          `Reconciliation check failed for payment ${payment.id}`,
          err,
        );
      }
    }
  }
}
