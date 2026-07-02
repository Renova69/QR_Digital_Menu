import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
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

/**
 * F-PAY-1: the per-order-item paid-quantity units a refund must reverse. Stored
 * as JSON on RefundAttempt so the reversal is reconstructable long after the
 * live PaymentAllocation rows would otherwise have to be consulted.
 */
type AllocationSnapshot = {
  orderItemId: string;
  quantity: number;
  amount: number;
};

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

    // F-PAY-1 (v2): authoritative confirmation of a refund's outcome. The
    // refund lifecycle lives in RefundAttempt; the payment stayed SUCCEEDED
    // with allocations intact while the attempt was PENDING. `succeeded`
    // finalizes it (flip to REFUNDED + reverse allocations from the persisted
    // snapshot); `failed`/`canceled` just marks the attempt — nothing needs
    // restoring because nothing was reversed up front. `refund.failed` is the
    // dedicated failure event Stripe also emits, handled identically.
    if (event.type === 'refund.updated' || event.type === 'refund.failed') {
      await this.handleRefundWebhook(event);
    }
  }

  private async handleRefundWebhook(event: {
    id: string;
    type: string;
    data: { object: unknown };
  }): Promise<void> {
    const refundObj = event.data.object as {
      id: string;
      status: string | null;
      payment_intent: string | { id: string } | null;
      amount?: number;
      metadata?: { refundAttemptId?: string };
    };
    const status = event.type === 'refund.failed' ? 'failed' : refundObj.status;
    if (
      status !== 'succeeded' &&
      status !== 'failed' &&
      status !== 'canceled'
    ) {
      return;
    }
    const paymentIntentId =
      typeof refundObj.payment_intent === 'string'
        ? refundObj.payment_intent
        : refundObj.payment_intent?.id;

    // Correlate to the EXACT attempt by provider refund id first (F-PAY-1 #3).
    // If the synchronous path never persisted that id, require the immutable
    // application attempt id carried in the refund metadata.
    const { attempt, payment } = await this.resolveRefundAttemptForWebhook(
      refundObj.id,
      paymentIntentId,
      refundObj.metadata?.refundAttemptId,
    );
    if (!attempt || !payment) return;
    if (attempt.status !== 'PENDING') return; // already resolved

    // Even an exact application-attempt metadata match is not sufficient on
    // its own: metadata is operator-editable in Stripe's Dashboard. Bind the
    // event to the original PaymentIntent and full application payment amount
    // before recording or mutating anything.
    const expectedAmountCents = Math.round(payment.amount * 100);
    if (
      !paymentIntentId ||
      paymentIntentId !== payment.stripePaymentIntentId ||
      refundObj.amount !== expectedAmountCents
    ) {
      this.logger.warn(
        `Ignoring refund ${refundObj.id}: correlation mismatch for payment ${payment.id}`,
      );
      return;
    }

    const recorded = await this.prisma.$transaction((tx) =>
      this.core.recordProviderEvent(tx, PaymentProvider.STRIPE, event.id, {
        paymentId: payment.id,
        restaurantId: payment.restaurantId,
        payload: { type: event.type, refundId: refundObj.id, status },
      }),
    );
    if (!recorded) return;

    if (status === 'succeeded') {
      const finalized = await this.finalizeRefundSuccess(
        payment.id,
        this.parseAllocationSnapshot(attempt.allocationSnapshot),
        attempt.id,
        refundObj.id,
      );
      if (finalized) {
        this.events.emitToRestaurant(payment.restaurantId, 'payment:refunded', {
          paymentId: payment.id,
          tableSessionId: payment.tableSessionId,
          amount: payment.amount,
          tableNumber: payment.tableSession?.table?.name ?? null,
          refundId: refundObj.id,
        });
      }
      return;
    }

    // failed / canceled — payment stays SUCCEEDED, allocations untouched.
    await this.prisma.refundAttempt.updateMany({
      where: { id: attempt.id, status: 'PENDING' },
      data: {
        status: status === 'failed' ? 'FAILED' : 'CANCELED',
        providerRefundId: refundObj.id,
      },
    });
    this.logger.warn(
      `Refund ${refundObj.id} for payment ${payment.id} ended as ${status} at Stripe — attempt marked, bill left paid`,
    );
  }

  private async resolveRefundAttemptForWebhook(
    refundId: string,
    paymentIntentId: string | undefined,
    refundAttemptId: string | undefined,
  ): Promise<{
    attempt: {
      id: string;
      status: string;
      allocationSnapshot: unknown;
      paymentId: string;
    } | null;
    payment: {
      id: string;
      restaurantId: string;
      amount: number;
      tableSessionId: string;
      stripePaymentIntentId: string | null;
      tableSession?: { table?: { name: string | null } | null } | null;
    } | null;
  }> {
    const paymentInclude = {
      tableSession: { include: { table: { select: { name: true } } } },
    };

    const byRefundId = await this.prisma.refundAttempt
      .findUnique({ where: { providerRefundId: refundId } })
      .catch(() => null);
    if (byRefundId) {
      const payment = await this.prisma.payment.findUnique({
        where: { id: byRefundId.paymentId },
        include: paymentInclude,
      });
      return { attempt: byRefundId, payment: payment };
    }

    // The synchronous response can be lost before providerRefundId is saved.
    // Recover through the immutable application attempt id that was included
    // in Stripe refund metadata. This is exact; unlike PaymentIntent fallback,
    // it cannot select an unrelated manual/partial refund.
    if (refundAttemptId) {
      const byAttemptId = await this.prisma.refundAttempt
        .findUnique({ where: { id: refundAttemptId } })
        .catch(() => null);
      if (byAttemptId) {
        const payment = await this.prisma.payment.findUnique({
          where: { id: byAttemptId.paymentId },
          include: paymentInclude,
        });
        return { attempt: byAttemptId, payment: payment };
      }
    }

    // Never guess by PaymentIntent. Stripe explicitly permits multiple and
    // partial refunds for one intent, including Dashboard-created refunds. An
    // event with neither a known providerRefundId nor our immutable metadata is
    // unrelated/legacy and must be left for the idempotent cron to reconcile.
    return { attempt: null, payment: null };
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
        refundAttempts: { select: { id: true, status: true } },
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

    // F-PAY-1 (v2): the payment must be a settled, un-refunded payment. It
    // stays SUCCEEDED for the whole refund flow — allocations are only reversed
    // once Stripe confirms `succeeded`, so nothing here re-exposes the bill as
    // payable (no double-settlement window) and nothing needs reconstructing if
    // the provider outcome turns out ambiguous.
    if (payment.status !== 'SUCCEEDED') {
      throw new ConflictException(
        'Payment has already been refunded or is not in a refundable state',
      );
    }

    // One refund attempt per payment (state-aware rejection for UX). The unique
    // idempotencyKey below is the real concurrency backstop against a racing
    // double-click.
    const existingAttempt = payment.refundAttempts?.[0];
    if (existingAttempt) {
      if (existingAttempt.status === 'PENDING') {
        throw new ConflictException(
          'A refund for this payment is already in progress',
        );
      }
      if (existingAttempt.status === 'SUCCEEDED') {
        throw new ConflictException('Payment has already been refunded');
      }
      throw new ConflictException(
        'A previous refund attempt for this payment failed and requires manual reconciliation',
      );
    }

    if (payment.provider === 'STRIPE' && !payment.stripePaymentIntentId) {
      throw new BadRequestException('Stripe payment intent is missing');
    }

    const snapshot: AllocationSnapshot[] = (payment.allocations ?? []).map(
      (a) => ({
        orderItemId: a.orderItemId,
        quantity: a.quantity,
        amount: a.amount,
      }),
    );
    // Deterministic per-payment key: dedupes the Stripe call across HTTP
    // retries AND, as the RefundAttempt's @unique key, guards against two
    // concurrent refund requests both reaching Stripe.
    const idempotencyKey = `refund_${paymentId}`;

    // Persist the attempt (with the allocation snapshot) BEFORE contacting
    // Stripe. This is the crux of the fix: a later webhook/reconciliation can
    // always rebuild exactly what to reverse from this row, even though the
    // live PaymentAllocation rows are still untouched.
    let attempt: { id: string };
    try {
      attempt = await this.prisma.refundAttempt.create({
        data: {
          paymentId,
          restaurantId: payment.restaurantId,
          provider: payment.provider,
          amount: payment.amount,
          idempotencyKey,
          reason: data.reason ?? null,
          status: 'PENDING',
          allocationSnapshot: snapshot,
        },
        select: { id: true },
      });
    } catch (err) {
      if (this.core.isUniqueConstraintError(err)) {
        throw new ConflictException(
          'A refund for this payment is already in progress',
        );
      }
      throw err;
    }

    let refund: { refundId: string; status: string | null } | null = null;
    try {
      refund = await this.stripe.createRefund({
        paymentIntentId: payment.stripePaymentIntentId!,
        amountCents: Math.round(payment.amount * 100),
        reason: data.reason,
        refundAttemptId: attempt.id,
        idempotencyKey,
      });
    } catch (err) {
      if (this.isDefinitiveRefundFailure(err)) {
        // Stripe explicitly rejected the request — nothing was created, and the
        // payment/allocations were never touched. Mark the attempt failed.
        await this.prisma.refundAttempt
          .updateMany({
            where: { id: attempt.id, status: 'PENDING' },
            data: { status: 'FAILED' },
          })
          .catch(() => {});
        this.logger.error(
          `Stripe refund definitively failed for ${paymentId}`,
          err,
        );
        throw err;
      }
      // Ambiguous outcome (timeout/connection/5xx): Stripe may have created
      // the refund. Leave the attempt PENDING (snapshot persisted, no refund id
      // yet) and the payment SUCCEEDED — the refund.updated webhook or the
      // reconciliation cron resolves it from Stripe's authoritative state.
      this.logger.error(
        `CRITICAL: Stripe refund outcome unknown for ${paymentId} (ambiguous error) — attempt left PENDING for webhook/reconciliation`,
        err,
      );
      throw err;
    }

    // Inspect the synchronous status. Only `succeeded` is final success.
    const refundConfirmed = await this.applyRefundOutcome(
      { id: payment.id, restaurantId: payment.restaurantId },
      attempt.id,
      snapshot,
      refund,
    );

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
   * Apply a synchronous Stripe refund response to our state. Returns true only
   * when the refund is confirmed `succeeded` and the payment was finalized to
   * REFUNDED (F-PAY-1). `pending`/`requires_action` keep the attempt PENDING
   * (recording the refund id for correlation); `failed`/`canceled` mark the
   * attempt terminally, leaving the payment SUCCEEDED and allocations intact.
   */
  private async applyRefundOutcome(
    payment: { id: string; restaurantId: string },
    attemptId: string,
    snapshot: AllocationSnapshot[],
    refund: { refundId: string; status: string | null },
  ): Promise<boolean> {
    if (refund.status === 'succeeded') {
      return this.finalizeRefundSuccess(
        payment.id,
        snapshot,
        attemptId,
        refund.refundId,
      );
    }

    const attemptStatus =
      refund.status === 'failed'
        ? 'FAILED'
        : refund.status === 'canceled'
          ? 'CANCELED'
          : 'PENDING';
    await this.prisma.refundAttempt.updateMany({
      where: { id: attemptId, status: 'PENDING' },
      data: { status: attemptStatus, providerRefundId: refund.refundId },
    });
    if (attemptStatus === 'PENDING') {
      this.logger.warn(
        `Refund ${refund.refundId} for payment ${payment.id} is ${
          refund.status ?? 'unknown'
        } at Stripe — awaiting webhook/reconciliation`,
      );
    }
    return false;
  }

  /**
   * Atomically finalize a confirmed refund: flip the payment SUCCEEDED ->
   * REFUNDED, reverse the paid-quantity allocations from the persisted
   * snapshot, drop the allocation rows, and mark the attempt SUCCEEDED. The
   * payment compare-and-swap makes this idempotent — the synchronous path, the
   * webhook, and the reconciliation cron can all call it, but only the first to
   * win the CAS performs the reversal. Returns true iff this call did it.
   */
  private async finalizeRefundSuccess(
    paymentId: string,
    snapshot: AllocationSnapshot[],
    attemptId: string,
    refundId: string,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const claim = await tx.payment.updateMany({
        where: { id: paymentId, status: 'SUCCEEDED' },
        data: { status: 'REFUNDED' },
      });
      if (claim.count !== 1) {
        // Already finalized by another path — just make sure the attempt row
        // reflects success. No allocation change (the winner did it).
        await tx.refundAttempt.updateMany({
          where: { id: attemptId, status: 'PENDING' },
          data: { status: 'SUCCEEDED', providerRefundId: refundId },
        });
        return false;
      }

      for (const allocation of snapshot) {
        const reversal = await tx.orderItem.updateMany({
          where: {
            id: allocation.orderItemId,
            paidQuantity: { gte: allocation.quantity },
          },
          data: { paidQuantity: { decrement: allocation.quantity } },
        });
        if (reversal.count !== 1) {
          // Fail closed. Because this runs in the same transaction as the
          // SUCCEEDED -> REFUNDED claim, throwing restores the paid status and
          // leaves all allocations intact for reconciliation/manual repair.
          throw new InternalServerErrorException(
            `Refund allocation invariant failed for order item ${allocation.orderItemId}`,
          );
        }
      }
      await tx.paymentAllocation.deleteMany({ where: { paymentId } });
      await tx.refundAttempt.updateMany({
        where: { id: attemptId },
        data: { status: 'SUCCEEDED', providerRefundId: refundId },
      });
      return true;
    });
  }

  /** Parse the persisted snapshot fail-closed; refund accounting is all-or-nothing. */
  private parseAllocationSnapshot(raw: unknown): AllocationSnapshot[] {
    if (!Array.isArray(raw)) {
      throw new InternalServerErrorException(
        'Refund allocation snapshot is invalid',
      );
    }

    const seenOrderItems = new Set<string>();
    return raw.map((entry) => {
      const allocation = entry as Partial<AllocationSnapshot> | null;
      if (
        !allocation ||
        typeof allocation !== 'object' ||
        typeof allocation.orderItemId !== 'string' ||
        !allocation.orderItemId ||
        typeof allocation.quantity !== 'number' ||
        !Number.isSafeInteger(allocation.quantity) ||
        allocation.quantity <= 0 ||
        typeof allocation.amount !== 'number' ||
        !Number.isFinite(allocation.amount) ||
        allocation.amount < 0 ||
        seenOrderItems.has(allocation.orderItemId)
      ) {
        throw new InternalServerErrorException(
          'Refund allocation snapshot is invalid',
        );
      }

      seenOrderItems.add(allocation.orderItemId);
      return {
        orderItemId: allocation.orderItemId,
        quantity: allocation.quantity,
        amount: allocation.amount,
      };
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
   * F-PAY-1 (v2) reconciliation cron: a refund attempt can be left PENDING if
   * the webhook never arrives (delivery failure, misconfigured endpoint) or the
   * synchronous Stripe response was lost (timeout). Ask Stripe directly for the
   * authoritative outcome of anything stuck longer than a normal async refund
   * should take.
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async reconcilePendingRefunds(): Promise<void> {
    const staleBefore = new Date(Date.now() - 10 * 60 * 1000);
    const stuck = await this.prisma.refundAttempt.findMany({
      where: {
        status: 'PENDING',
        provider: 'STRIPE',
        updatedAt: { lt: staleBefore },
      },
      // Defensive cap: refunds normally resolve within seconds, so this should
      // stay tiny, but a prolonged Stripe/webhook outage shouldn't let a single
      // cron tick scan an unbounded backlog.
      take: 100,
      include: {
        payment: {
          select: {
            id: true,
            restaurantId: true,
            amount: true,
            tableSessionId: true,
            stripePaymentIntentId: true,
          },
        },
      },
    });

    for (const attempt of stuck) {
      const payment = attempt.payment;
      if (!payment?.stripePaymentIntentId) {
        this.logger.warn(
          `Reconciliation: refund attempt ${attempt.id} has no Stripe payment intent — skipping`,
        );
        continue;
      }
      try {
        // Resolve the EXACT refund. If we already recorded its id, retrieve it
        // directly; otherwise re-issue create with the deterministic
        // idempotency key — Stripe returns the same refund it made for the
        // timed-out call (or creates it if the original never landed), so we
        // never double-refund and we recover the id + status.
        const refund = attempt.providerRefundId
          ? await this.stripe.retrieveRefund(attempt.providerRefundId)
          : await this.stripe.createRefund({
              paymentIntentId: payment.stripePaymentIntentId,
              amountCents: Math.round(payment.amount * 100),
              // Stripe requires an idempotent replay to use the exact same
              // parameters. The initial call stores this free-text reason in
              // refund metadata, so omitting it here turns a recoverable
              // timeout into a permanent idempotency-parameter mismatch.
              reason: attempt.reason ?? undefined,
              refundAttemptId: attempt.id,
              idempotencyKey: attempt.idempotencyKey,
            });
        if (!refund) continue;

        const snapshot = this.parseAllocationSnapshot(
          attempt.allocationSnapshot,
        );

        if (refund.status === 'succeeded') {
          const finalized = await this.finalizeRefundSuccess(
            payment.id,
            snapshot,
            attempt.id,
            refund.refundId,
          );
          if (finalized) {
            this.events.emitToRestaurant(
              payment.restaurantId,
              'payment:refunded',
              {
                paymentId: payment.id,
                tableSessionId: payment.tableSessionId,
                amount: payment.amount,
                tableNumber: null,
                refundId: refund.refundId,
              },
            );
            this.logger.warn(
              `Reconciliation: confirmed refund for payment ${payment.id} via Stripe API poll`,
            );
          }
        } else if (refund.status === 'failed' || refund.status === 'canceled') {
          await this.prisma.refundAttempt.updateMany({
            where: { id: attempt.id, status: 'PENDING' },
            data: {
              status: refund.status === 'failed' ? 'FAILED' : 'CANCELED',
              providerRefundId: refund.refundId,
            },
          });
          this.logger.warn(
            `Reconciliation: refund for payment ${payment.id} ended ${refund.status} — bill left paid`,
          );
        } else if (!attempt.providerRefundId) {
          // We just recovered the refund id from an idempotent re-create;
          // persist it so the next tick can retrieve it directly.
          await this.prisma.refundAttempt.updateMany({
            where: { id: attempt.id, status: 'PENDING' },
            data: { providerRefundId: refund.refundId },
          });
        }
        // else: still pending at Stripe — leave PENDING, recheck next run.
      } catch (err) {
        this.logger.error(
          `Reconciliation check failed for refund attempt ${attempt.id}`,
          err,
        );
      }
    }
  }
}
