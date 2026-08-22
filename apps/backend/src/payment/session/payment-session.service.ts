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
import { PaymentStatus, Prisma } from '@prisma/client';
import { CheckoutScopeInput } from '../payment-scope.utils';
import {
  ABANDONED_PAYMENT_RETENTION_DAYS,
  CheckoutProvider,
  DAY_MS,
  PendingBillPaymentDto,
  STALE_OPEN_SESSION_HOURS,
} from '../payment.types';
import { FeatureService } from '../../subscription/feature.service';
import { FeatureFlag } from '../../subscription/feature-flag.enum';
import { PAYMENT_AMOUNT_TOLERANCE } from '../payment.constants';

@Injectable()
export class PaymentSessionService {
  private readonly logger = new Logger(PaymentSessionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeProvider,
    private readonly events: EventsGateway,
    private readonly core: PaymentCoreService,
    private readonly config: PaymentProviderConfigService,
    private readonly featureService: FeatureService,
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

    let abandonedCount = 0;
    try {
      const abandoned = await this.prisma.payment.deleteMany({
        where: {
          status: PaymentStatus.ABANDONED,
          updatedAt: { lt: abandonedCutoff },
          // A provider event is evidence that the processor interacted with this
          // payment. Preserve it for repair/manual review instead of letting
          // retention erase a potentially captured transaction.
          providerEvents: { none: {} },
          reconciliationIssue: { is: null },
        },
      });
      abandonedCount = abandoned.count;
    } catch (error) {
      this.logger.error('Abandoned-payment retention step failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

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
      let staleSessions: Array<{
        id: string;
        restaurantId: string;
        tableId: string;
      }>;
      try {
        staleSessions = await this.prisma.tableSession.findMany({
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
      } catch (error) {
        this.logger.error('Stale-session retention query failed', {
          page,
          error: error instanceof Error ? error.message : String(error),
        });
        break;
      }

      if (staleSessions.length === 0) break;

      for (const session of staleSessions) {
        try {
          const outcome = await this.prisma.$transaction(async (tx) => {
            await this.core.lockOpenSessionForSettlement(tx, session.id);
            const pendingPayment = await tx.payment.findFirst({
              where: {
                tableSessionId: session.id,
                status: PaymentStatus.PENDING,
              },
              select: { id: true },
            });
            if (pendingPayment) return 'SKIPPED' as const;

            // Recompute only after owning the session lock. The paged candidate
            // query is intentionally just a hint; orders or payments may have
            // committed while cleanup was waiting.
            const balance = await this.core.computeSessionBalance(
              tx,
              session.id,
            );
            if (
              balance.paidSubtotal > 0 &&
              balance.remaining > PAYMENT_AMOUNT_TOLERANCE
            ) {
              return 'PARTIAL' as const;
            }
            const status =
              balance.billSubtotal > 0 &&
              balance.remaining <= PAYMENT_AMOUNT_TOLERANCE
                ? ('PAID' as const)
                : ('CLOSED_NO_PAYMENT' as const);
            await tx.tableSession.update({
              where: { id: session.id },
              data: {
                status,
                ...(status === 'PAID' ? { paidAt: new Date() } : {}),
              },
            });
            return status;
          });

          if (outcome === 'SKIPPED') continue;
          if (outcome === 'PARTIAL') {
            partialLeftOpen++;
            seenPartialIds.push(session.id);
            continue;
          }
          if (outcome === 'PAID') markedPaid++;
          else closedNoPayment++;
          try {
            this.events.emitTableStatusChanged(
              session.restaurantId,
              session.tableId,
              session.id,
            );
          } catch (error) {
            this.logger.error('Stale-session close event failed', {
              sessionId: session.id,
              restaurantId: session.restaurantId,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        } catch (error) {
          if (
            error instanceof ConflictException &&
            error.message === 'Session is no longer open'
          ) {
            continue;
          }
          this.logger.error('Stale session cleanup failed for one session', {
            sessionId: session.id,
            restaurantId: session.restaurantId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      if (staleSessions.length < 100) break;
    }

    if (
      abandonedCount > 0 ||
      closedNoPayment > 0 ||
      markedPaid > 0 ||
      partialLeftOpen > 0
    ) {
      this.logger.log(
        `Payment retention cleanup: abandoned=${abandonedCount}, closedNoPayment=${closedNoPayment}, markedPaid=${markedPaid}, partialLeftOpen=${partialLeftOpen}`,
      );
    }
  }

  async getOrCreateSession(
    tableId: string,
    restaurantId: string,
    token?: string,
  ): Promise<{ session: any; token: string }> {
    const table = await this.prisma.restaurantTable.findFirst({
      where: { id: tableId, restaurantId },
      include: { restaurant: true },
    });
    if (
      !table ||
      table.isActive === false ||
      table.restaurant.isActive === false ||
      table.restaurant.deletedAt
    ) {
      throw new NotFoundException('Table not found for this restaurant');
    }

    const isServicePoint = table.type !== 'TABLE';
    if (
      isServicePoint &&
      !this.featureService.restaurantHasFeature(
        table.restaurant,
        FeatureFlag.SERVICE_POINTS,
      )
    ) {
      throw new NotFoundException('Table not found for this restaurant');
    }

    if (token) {
      const existing = await this.prisma.tableSession.findFirst({
        where: {
          token,
          restaurantId,
          tableId,
          status: 'OPEN',
          isServicePoint,
        },
      });
      if (existing) return { session: existing, token };
    }

    // Service points (type !== 'TABLE') are isolated per customer: the partial
    // unique index only applies to isServicePoint=false, so multiple OPEN
    // sessions per counter are legal. Without a session token we must NEVER
    // reuse another customer's OPEN session by tableId (that leaks their bill
    // token / lets an attacker attach orders) — always mint a fresh isolated
    // session instead. Regular tables keep the one-open-session-per-table
    // get-or-create.
    if (isServicePoint) {
      const session = await this.prisma.tableSession.create({
        data: { tableId, restaurantId, isServicePoint: true },
      });
      return { session, token: session.token };
    }

    let session: any;
    try {
      session = await this.prisma.$transaction(async (tx) => {
        const lockedTables = await tx.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`
            SELECT "id"
            FROM "restaurant_table"
            WHERE "id" = ${tableId}
              AND "restaurantId" = ${restaurantId}
              AND "type" = 'TABLE'
              AND "isActive" = true
            FOR UPDATE
          `,
        );
        if (lockedTables.length === 0) {
          throw new NotFoundException('Table not found for this restaurant');
        }

        const existingRows = await tx.$queryRaw<any[]>(
          Prisma.sql`
            SELECT *
            FROM "table_session"
            WHERE "tableId" = ${tableId}
              AND "restaurantId" = ${restaurantId}
              AND "status" = 'OPEN'
              AND "isServicePoint" = false
            FOR UPDATE
          `,
        );
        const existing = existingRows[0] ?? null;
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
        // P0-3: email deliberately absent — this row feeds a public response.
        staff: { select: { name: true, role: true } },
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

    const enrichedOrders = orders.map((order) => {
      const items = order.items.map((oi) => {
        const optionsTotal = Array.isArray(oi.selectedOptions)
          ? (
              oi.selectedOptions as Array<{
                priceModifier?: number;
              }>
            ).reduce((s, x) => s + (x?.priceModifier || 0), 0)
          : 0;
        const persistedUnitPrice =
          typeof oi.unitPrice === 'number' ? oi.unitPrice : null;
        const persistedUnitPriceWithOptions =
          typeof oi.unitPriceWithOptions === 'number'
            ? oi.unitPriceWithOptions
            : null;
        const itemRedeemedWithPoints =
          (order.pointsRedeemedForItems ?? 0) > 0 && persistedUnitPrice === 0;
        const originalBasePrice = itemRedeemedWithPoints
          ? (oi.menuItem?.price ?? 0)
          : (persistedUnitPrice ?? oi.menuItem?.price ?? 0);
        const originalUnitPriceWithOptions = itemRedeemedWithPoints
          ? this.core.roundMoney(originalBasePrice + optionsTotal)
          : (persistedUnitPriceWithOptions ??
            this.core.roundMoney(originalBasePrice + optionsTotal));
        const effectiveUnitPrice = itemRedeemedWithPoints
          ? 0
          : persistedUnitPrice !== null && persistedUnitPrice > 0
            ? persistedUnitPrice
            : (oi.menuItem?.price ?? 0);
        const effectiveUnitPriceWithOptions = itemRedeemedWithPoints
          ? (persistedUnitPriceWithOptions ??
            this.core.roundMoney(optionsTotal))
          : persistedUnitPriceWithOptions !== null &&
              persistedUnitPriceWithOptions > 0
            ? persistedUnitPriceWithOptions
            : this.core.roundMoney((oi.menuItem?.price ?? 0) + optionsTotal);

        return {
          // orderItemId + paidQuantity drive the by-item split picker.
          orderItemId: oi.id,
          name: translatedName(oi.menuItem),
          quantity: oi.quantity,
          paidQuantity: oi.paidQuantity ?? 0,
          unitPrice: effectiveUnitPrice,
          unitPriceWithOptions: effectiveUnitPriceWithOptions,
          originalUnitPriceWithOptions,
          redeemedWithPoints: itemRedeemedWithPoints,
          selectedOptions: Array.isArray(oi.selectedOptions)
            ? oi.selectedOptions
            : [],
        };
      });

      // Order-level loyalty is a discount on the net order total, while the
      // persisted item snapshots retain their pre-discount prices. Allocate
      // that discount from the first displayed item forward so the bill makes
      // the redemption visible: fully covered lines become zero, one boundary
      // line may be partially reduced, and later lines stay at full price.
      const toCents = (value: number) =>
        Math.round(this.core.roundMoney(value) * 100);
      const preDiscountTotalCents = items.reduce(
        (sum, item) => sum + toCents(item.unitPriceWithOptions * item.quantity),
        0,
      );
      const orderTotalCents = Math.max(0, toCents(order.totalPrice ?? 0));
      let loyaltyDiscountCents =
        (order.pointsRedeemedForDiscount ?? 0) > 0
          ? Math.max(
              0,
              Math.min(
                preDiscountTotalCents,
                preDiscountTotalCents - orderTotalCents,
              ),
            )
          : 0;

      const allocatedItems = items.map((item) => {
        if (loyaltyDiscountCents <= 0) return item;

        const lineTotalCents = toCents(
          item.unitPriceWithOptions * item.quantity,
        );
        const appliedDiscountCents = Math.min(
          loyaltyDiscountCents,
          lineTotalCents,
        );
        if (appliedDiscountCents <= 0) return item;

        loyaltyDiscountCents -= appliedDiscountCents;
        const effectiveLineTotalCents = lineTotalCents - appliedDiscountCents;
        const effectiveUnitPrice =
          effectiveLineTotalCents / 100 / item.quantity;

        return {
          ...item,
          unitPrice: effectiveUnitPrice,
          unitPriceWithOptions: effectiveUnitPrice,
          redeemedWithPoints: true,
        };
      });

      // P0-3: this bill is served to anyone holding the table session token,
      // which is shared by every diner on the tab. Two fields were leaking
      // beyond what a co-diner needs to settle up:
      //
      //  - customerPhone: a co-diner's phone number. Its only consumer was a
      //    convenience prefill of the BORICA phone field, which picked an
      //    arbitrary order's number rather than the payer's — so dropping it
      //    removes a personal-data disclosure and a prefill bug at once.
      //  - staff.email: the `name ?? email` fallback put a staff member's
      //    email address on a public response whenever their name was unset.
      //    The bill only needs to attribute the order to a person, so fall
      //    back to the role label the response already carries.
      //
      // customerName stays: a shared bill has to show who ordered what.
      return {
        id: order.id,
        source: order.source,
        customerName: order.customerName,
        staffName: order.staff?.name ?? null,
        staffRole: order.staff?.role ?? null,
        totalPrice: order.totalPrice,
        items: allocatedItems,
      };
    });

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
    const preflight = await this.prisma.tableSession.findFirst({
      where: { token },
      select: { id: true },
    });
    if (!preflight) return;
    const abandonedIds = await this.prepareAndCancelPendingCheckoutPayments(
      preflight.id,
    );

    const result = await this.prisma.$transaction(async (tx) => {
      const sessions = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id"
        FROM "table_session"
        WHERE "token" = ${token}
        FOR UPDATE
      `);
      const session = sessions[0];
      if (!session) return null;

      const abandonedPaymentIds =
        await this.applyAbandonedPaymentsForLockedSession(
          tx,
          session.id,
          abandonedIds,
        );
      return { sessionId: session.id, abandonedPaymentIds };
    });

    if (result) {
      this.emitAbandonedCheckoutEvents(
        result.sessionId,
        result.abandonedPaymentIds,
      );
    }
  }

  /**
   * Pre-flight read (no transaction, no lock): find the session's PENDING
   * payments and split out which ones need an external Stripe cancel call.
   * Callers run this BEFORE opening their settlement transaction — the DB
   * read is just a hint (re-verified by the CAS in
   * applyAbandonedPaymentsForLockedSession), so it's safe outside a lock.
   */
  async findPendingCheckoutPayments(sessionId: string): Promise<{
    stripe: Array<{ id: string; stripePaymentIntentId: string }>;
    nonStripeIds: string[];
  }> {
    const pendingPayments = await this.prisma.payment.findMany({
      where: { tableSessionId: sessionId, status: 'PENDING' },
      select: { id: true, provider: true, stripePaymentIntentId: true },
    });
    const stripe = pendingPayments
      .filter((p) => p.provider === 'STRIPE' && p.stripePaymentIntentId)
      .map((p) => ({
        id: p.id,
        stripePaymentIntentId: p.stripePaymentIntentId!,
      }));
    const nonStripeIds = pendingPayments
      .filter((p) => p.provider !== 'STRIPE' || !p.stripePaymentIntentId)
      .map((p) => p.id);
    return { stripe, nonStripeIds };
  }

  /**
   * Cancel Stripe PaymentIntents OUTSIDE any DB transaction. This must never
   * run while holding a Postgres row lock under PgBouncer transaction-mode
   * pooling — an HTTP round-trip to Stripe held open across a locked
   * connection can exhaust the pool under load. Returns the payment ids whose
   * intent was confirmed cancelled; a payment Stripe couldn't cancel (already
   * succeeded, network error) stays PENDING — safe default, matches prior
   * behavior.
   */
  async cancelStripePaymentIntents(
    stripePayments: Array<{ id: string; stripePaymentIntentId: string }>,
    sessionId: string,
  ): Promise<string[]> {
    if (stripePayments.length === 0) return [];
    // Independent HTTP requests, no point waiting sequentially (#N+1-C2).
    const cancelResults = await Promise.allSettled(
      stripePayments.map((p) =>
        this.stripe.cancelPaymentIntent(p.stripePaymentIntentId),
      ),
    );
    const cancelledIds: string[] = [];
    cancelResults.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        cancelledIds.push(stripePayments[i].id);
      } else {
        this.logger.warn(
          `Could not cancel abandoned PaymentIntent ${stripePayments[i].stripePaymentIntentId} for session ${sessionId}`,
        );
      }
    });
    return cancelledIds;
  }

  /**
   * Apply the abandon outcome atomically inside the caller's lock — DB writes
   * only, no external calls. The CAS (`status: 'PENDING'`) guards against a
   * payment that flipped SUCCEEDED between the pre-flight read and this
   * write (webhook landed first) — it's left untouched rather than wrongly
   * marked ABANDONED. Fails closed (ConflictException) if anything is still
   * PENDING afterward, including a payment that appeared after the
   * pre-flight read — the caller retries, which redoes the whole
   * prepare/cancel/apply cycle fresh.
   */
  async applyAbandonedPaymentsForLockedSession(
    tx: Prisma.TransactionClient,
    sessionId: string,
    abandonedIds: string[],
    throwIfPending = true,
  ): Promise<string[]> {
    if (abandonedIds.length > 0) {
      await tx.payment.updateMany({
        where: { id: { in: abandonedIds }, status: 'PENDING' },
        data: { status: 'ABANDONED', providerStatus: 'ABANDONED' },
      });
    }

    const pendingPayment = await tx.payment.findFirst({
      where: { tableSessionId: sessionId, status: 'PENDING' },
      select: { id: true },
    });
    if (pendingPayment && throwIfPending) {
      this.logger.warn(
        `Refusing POS mutation for session ${sessionId}: payment ${pendingPayment.id} is still pending`,
      );
      throw new ConflictException(
        'A payment for this session is still being processed. Please wait or retry.',
      );
    }

    return abandonedIds;
  }

  /**
   * Convenience wrapper for callers that just need "abandon this session's
   * pending checkout payments" without any other work sharing the lock —
   * still runs the Stripe cancel outside the transaction.
   */
  private async prepareAndCancelPendingCheckoutPayments(
    sessionId: string,
  ): Promise<string[]> {
    const { stripe, nonStripeIds } =
      await this.findPendingCheckoutPayments(sessionId);
    const cancelledStripeIds = await this.cancelStripePaymentIntents(
      stripe,
      sessionId,
    );
    return [...nonStripeIds, ...cancelledStripeIds];
  }

  emitAbandonedCheckoutEvents(
    sessionId: string,
    abandonedPaymentIds: string[],
  ): void {
    for (const paymentId of abandonedPaymentIds) {
      this.core.emitBillPaymentCleared(sessionId, paymentId, 'ONLINE_PAYMENT');
    }
  }

  /**
   * POS operator "force-resolve stuck payment": verify access, then best-effort
   * abandon the session's pending payments (cancels cancellable Stripe intents,
   * marks hosted-provider payments ABANDONED — which stays claimable if a late
   * notify arrives). Returns the sessionId so the caller can poll Stripe for any
   * intent that couldn't be cancelled (may have actually succeeded).
   */
  async abandonAndAuthorize(token: string, userId: string): Promise<string> {
    const session = await this.prisma.tableSession.findFirst({
      where: { token },
      select: { id: true, restaurantId: true },
    });
    if (!session) throw new NotFoundException('Session not found');
    await this.core.verifyPosOperatorAccess(session.restaurantId, userId);
    await this.abandonCheckout(token);
    return session.id;
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
    const existingOrderCount = await this.prisma.order.count({
      where: { tableSessionId: session.id },
    });

    // Cancel any pending online payments before closing the session.
    // Without this, a customer who started a Stripe checkout while the waiter
    // force-closes would still be charged, but the system would never
    // acknowledge the payment — money stuck in limbo (#C1). The Stripe cancel
    // runs before the transaction opens — see cancelStripePaymentIntents.
    const abandonedIds = await this.prepareAndCancelPendingCheckoutPayments(
      session.id,
    );

    const abandonedPaymentIds = await this.prisma.$transaction(async (tx) => {
      await this.core.lockOpenSessionForSettlement(tx, session.id);
      const lockedOrderCount = await tx.order.count({
        where: { tableSessionId: session.id },
      });
      if (lockedOrderCount !== existingOrderCount) {
        throw new ConflictException(
          'An order was added while the table was being closed. Review the table and retry.',
        );
      }
      const abandoned = await this.applyAbandonedPaymentsForLockedSession(
        tx,
        session.id,
        abandonedIds,
      );

      await tx.tableSession.update({
        where: { id: session.id },
        data: { status: 'CLOSED_NO_PAYMENT' },
      });
      return abandoned;
    });

    this.emitAbandonedCheckoutEvents(session.id, abandonedPaymentIds);
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
    // once via the online payment (#POS-C2). Stripe cancel runs before the
    // transaction opens — see cancelStripePaymentIntents.
    const abandonedIds = await this.prepareAndCancelPendingCheckoutPayments(
      session.id,
    );

    // #2: compute the bill INSIDE the same transaction that flips the session to
    // PAID. Reading orders before the transaction let a QR order placed during
    // the close window slip through unbilled (TOCTOU on the total). Bill only the
    // REMAINING balance so a full close after a partial split collects what's
    // left, not the whole bill again.
    const { amount, paymentId, abandonedPaymentIds } =
      await this.prisma.$transaction(async (tx) => {
        await this.core.lockOpenSessionForSettlement(tx, session.id);

        const balance = await this.core.computeSessionBalance(tx, session.id);
        const billed = balance.remaining;
        if (billed <= 0)
          throw new BadRequestException(
            'Cannot close a session with no outstanding balance',
          );

        const abandonedPaymentIds =
          await this.applyAbandonedPaymentsForLockedSession(
            tx,
            session.id,
            abandonedIds,
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
        return { amount: billed, paymentId: payment.id, abandonedPaymentIds };
      });

    this.emitAbandonedCheckoutEvents(session.id, abandonedPaymentIds);
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
    if (table.type !== 'TABLE') {
      // Service points (ROOM/PICKUP/OTHER) intentionally allow multiple
      // concurrent OPEN sessions per tableId, one per guest (no unique-open
      // -session constraint applies — see isServicePoint). "Force open" only
      // makes sense against the single-session-per-table invariant; applying
      // it here would pick an arbitrary guest's session via findFirst and
      // force-close it out from under them (#H2).
      throw new BadRequestException(
        'Force-open is only available for physical tables, not service points.',
      );
    }

    // Cancel any pending online payments on the existing session before
    // force-opening a new one. Without this, a customer who started a Stripe
    // checkout on the old session would still be charged after the session is
    // closed, but the system would never acknowledge the payment (#C3).
    const existing = await this.prisma.tableSession.findFirst({
      where: { tableId, restaurantId, status: 'OPEN' },
    });
    const existingOrderCount = existing
      ? await this.prisma.order.count({
          where: { tableSessionId: existing.id },
        })
      : 0;
    // Stripe cancel runs before the transaction opens — see
    // cancelStripePaymentIntents. Safe to key off the pre-lock `existing.id`:
    // the in-transaction check below throws (and discards this list) unless
    // the locked session still matches that exact id.
    const abandonedIds = existing
      ? await this.prepareAndCancelPendingCheckoutPayments(existing.id)
      : [];
    const { session, closedSession, abandonedPaymentIds } =
      await this.prisma.$transaction(async (tx) => {
        const lockedTables = await tx.$queryRaw<
          Array<{ id: string }>
        >(Prisma.sql`
          SELECT "id"
          FROM "restaurant_table"
          WHERE "id" = ${tableId}
            AND "restaurantId" = ${restaurantId}
            AND "type" = 'TABLE'
            AND "isActive" = true
          FOR UPDATE
        `);
        if (lockedTables.length === 0) {
          throw new ConflictException(
            'The table changed while it was being reopened. Please retry.',
          );
        }

        const existingRows = await tx.$queryRaw<
          Array<{ id: string; tableId: string }>
        >(
          Prisma.sql`
            SELECT *
            FROM "table_session"
            WHERE "tableId" = ${tableId}
              AND "restaurantId" = ${restaurantId}
              AND "status" = 'OPEN'
              AND "isServicePoint" = false
            FOR UPDATE
          `,
        );
        const existingInTx = existingRows[0] ?? null;
        if ((existingInTx?.id ?? null) !== (existing?.id ?? null)) {
          throw new ConflictException(
            'The table session changed while it was being reopened. Please retry.',
          );
        }
        let abandonedPaymentIds: string[] = [];
        if (existingInTx) {
          const lockedOrderCount = await tx.order.count({
            where: { tableSessionId: existingInTx.id },
          });
          if (lockedOrderCount !== existingOrderCount) {
            throw new ConflictException(
              'An order was added while the table was being reopened. Review the table and retry.',
            );
          }
          abandonedPaymentIds =
            await this.applyAbandonedPaymentsForLockedSession(
              tx,
              existingInTx.id,
              abandonedIds,
            );

          await tx.tableSession.update({
            where: { id: existingInTx.id },
            data: { status: 'CLOSED_NO_PAYMENT' },
          });
        }
        const created = await tx.tableSession.create({
          data: {
            tableId,
            restaurantId,
            isServicePoint: false,
          },
        });
        return {
          session: created,
          closedSession: existingInTx,
          abandonedPaymentIds,
        };
      });

    // Emit socket events only after the transaction commits — emitting inside a
    // transaction can fire for work that later rolls back (#H4).
    if (closedSession) {
      this.emitAbandonedCheckoutEvents(closedSession.id, abandonedPaymentIds);
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
