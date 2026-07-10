import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsGateway } from '../../events/events.gateway';
import { FeatureService } from '../../subscription/feature.service';
import {
  CashPaymentRequestScope,
  CashPaymentRequestStatus,
  PaymentProvider,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { SplitMode } from '../dto/settle-partial.dto';
import { assertRestaurantActive } from '../../restaurants/assert-restaurant-active';
import {
  BillPaymentScope,
  CheckoutScope,
  CheckoutScopeAllocation,
  CheckoutScopeInput,
  billScopeFromCashRequest,
  billScopeFromCheckoutScope,
  billScopeFromPayment,
  billScopesOverlap,
  checkoutScopePayload,
  getCheckoutScopeFromPayload,
  getCheckoutScopeKey,
  normalizeCheckoutScope,
  normalizeScopeOrderIds,
} from '../payment-scope.utils';
import {
  CashPaymentRequestDto,
  CheckoutCharge,
  CheckoutProvider,
  PaymentClaimResult,
  PendingBillPaymentDto,
} from '../payment.types';

@Injectable()
export class PaymentCoreService {
  private readonly logger = new Logger(PaymentCoreService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
    private readonly featureService: FeatureService,
  ) {}

  roundMoney(value: number) {
    return Math.round(value * 100) / 100;
  }

  async verifyRestaurantAccess(restaurantId: string, userId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        id: true,
        ownerId: true,
        isActive: true,
        deletedAt: true,
        paymentsEnabled: true,
        stripeOnboarded: true,
        stripeAccountId: true,
        epayEnabled: true,
        epayMode: true,
        epayClientId: true,
        epayMerchantEmail: true,
        epaySecretEncrypted: true,
        epayPage: true,
        boricaEnabled: true,
        boricaMode: true,
        boricaTerminalId: true,
        boricaMerchantId: true,
        boricaMerchantName: true,
        boricaPrivateKeyEncrypted: true,
        boricaPublicCert: true,
        boricaCurrency: true,
        myposEnabled: true,
        myposMode: true,
        myposClientNumber: true,
        myposStoreId: true,
        myposKeyIndex: true,
        myposPrivateKeyEncrypted: true,
        myposPublicCert: true,
        myposCurrency: true,
        platformFeePercent: true,
        tipsEnabled: true,
        tipOptions: true,
      },
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }

    if (restaurant.ownerId === userId) {
      assertRestaurantActive(restaurant);
      return restaurant;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { restaurantId: true, role: true },
    });

    // SUPER_ADMIN can still inspect/manage a suspended or soft-deleted
    // restaurant (support/investigation); every other caller is blocked below.
    if (user?.role === 'SUPER_ADMIN') return restaurant;
    assertRestaurantActive(restaurant);

    if (
      user?.restaurantId === restaurantId &&
      (user?.role === 'MANAGER' || user?.role === 'OWNER')
    ) {
      return restaurant;
    }

    throw new ForbiddenException(
      'You do not have permission to access these payments',
    );
  }

  /**
   * Access check for table-session operations performed from the POS
   * (open/close/force). Allows the owner, super-admin, and floor staff who
   * actually handle bills — MANAGER and WAITER — assigned to this restaurant.
   * STAFF (a dashboard/password role) and KITCHEN are excluded: they should
   * not close or force-open payment sessions. Without this check the endpoints
   * mutated sessions by token/restaurantId with no caller verification (#3).
   */

  async verifyPosOperatorAccess(restaurantId: string, userId: string) {
    const [restaurant, user] = await Promise.all([
      this.prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { ownerId: true, isActive: true, deletedAt: true },
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { restaurantId: true, role: true },
      }),
    ]);
    if (!restaurant) throw new NotFoundException('Restaurant not found');
    if (user?.role === 'SUPER_ADMIN') return;
    assertRestaurantActive(restaurant);
    if (restaurant.ownerId === userId) return;
    if (
      user?.restaurantId === restaurantId &&
      (user.role === 'MANAGER' || user.role === 'WAITER')
    ) {
      return;
    }
    throw new ForbiddenException(
      'You do not have permission to manage this table session',
    );
  }

  async verifyRestaurantStaffAccess(restaurantId: string, userId: string) {
    const [restaurant, user] = await Promise.all([
      this.prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { id: true, ownerId: true, isActive: true, deletedAt: true },
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { restaurantId: true, role: true },
      }),
    ]);

    if (!restaurant) throw new NotFoundException('Restaurant not found');
    if (user?.role === 'SUPER_ADMIN') return { restaurant, user };
    assertRestaurantActive(restaurant);
    if (restaurant.ownerId === userId) return { restaurant, user };
    if (user?.restaurantId === restaurantId) return { restaurant, user };

    throw new ForbiddenException(
      'You do not have permission to access these requests',
    );
  }

  /**
   * Access check for confirming/cancelling a cash collection request. Unlike
   * verifyPosOperatorAccess (session force/close), this DELIBERATELY allows
   * STAFF: collecting cash at the table is a cashier/front-of-house action, so
   * OWNER/MANAGER/WAITER/STAFF all qualify. STAFF still cannot force-open or
   * close sessions. KITCHEN is excluded from both. Keep the two role sets
   * divergent on purpose — do not "align" them.
   */

  async verifyCashPaymentOperatorAccess(restaurantId: string, userId: string) {
    const context = await this.verifyRestaurantStaffAccess(
      restaurantId,
      userId,
    );
    if (
      context.user?.role === 'SUPER_ADMIN' ||
      context.restaurant.ownerId === userId ||
      ['OWNER', 'MANAGER', 'WAITER', 'STAFF'].includes(context.user?.role ?? '')
    ) {
      return context;
    }

    throw new ForbiddenException(
      'You do not have permission to confirm cash payments',
    );
  }

  paymentStatusLabel(status: string) {
    return status === 'SUCCEEDED'
      ? 'Succeeded'
      : status.charAt(0) + status.slice(1).toLowerCase();
  }

  mapPayment(payment: any) {
    return {
      id: payment.id,
      amount: payment.amount,
      tipAmount: payment.tipAmount,
      platformFeeAmount: payment.platformFeeAmount,
      currency: payment.currency,
      status: payment.status,
      statusLabel: this.paymentStatusLabel(payment.status),
      stripePaymentIntentId: payment.stripePaymentIntentId,
      providerReference: payment.providerReference,
      providerStatus: payment.providerStatus,
      provider: payment.provider,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
      tableNumber: payment.tableSession?.table?.name ?? null,
      customerName: payment.tableSession?.orders?.[0]?.customerName ?? null,
      tableSessionId: payment.tableSessionId,
      netAmount: this.roundMoney(payment.amount - payment.platformFeeAmount),
    };
  }

  isUniqueConstraintError(error: unknown): boolean {
    return !!(
      error &&
      typeof error === 'object' &&
      (error as { code?: string }).code === 'P2002'
    );
  }

  buildStripeCheckoutKey(
    sessionId: string,
    amountCents: number,
    platformFeeCents: number,
    checkoutScopeKey?: string | null,
  ): string {
    const base = `stripe:${sessionId}:${amountCents}:${platformFeeCents}:eur`;
    return checkoutScopeKey ? `${base}:${checkoutScopeKey}` : base;
  }

  normalizeTipPercent(tipPercent: number | undefined): number {
    const normalized = Number(tipPercent ?? 0);
    if (!Number.isFinite(normalized) || normalized < 0 || normalized > 100) {
      throw new BadRequestException('tipPercent must be between 0 and 100');
    }
    return normalized;
  }

  calculateTotals(
    orders: Array<{ totalPrice: number }>,
    tipPercent: number,
    platformFeePercent: number,
  ) {
    const subtotal = orders.reduce((sum, order) => sum + order.totalPrice, 0);
    return this.calculatePartialTotals(
      subtotal,
      tipPercent,
      platformFeePercent,
    );
  }

  /**
   * Totals for an arbitrary chargeable subtotal — used by full-bill checkout
   * (subtotal = remaining balance) and split settlement. tipAmount and the
   * platform fee are derived from this subtotal only, never the whole bill.
   */

  calculatePartialTotals(
    subtotal: number,
    tipPercent: number,
    platformFeePercent: number,
  ) {
    if (subtotal <= 0) {
      throw new BadRequestException(
        'Cannot create payment for an empty session',
      );
    }

    const feePercent = platformFeePercent ?? 0;
    if (feePercent < 0 || feePercent > 100) {
      throw new BadRequestException('Invalid platform fee configuration');
    }

    const tipAmount = Math.round(subtotal * tipPercent) / 100;
    const total = subtotal + tipAmount;
    const platformFeeCents = Math.round(total * feePercent);

    return {
      subtotal,
      tipAmount,
      total,
      platformFeeCents,
      platformFeeAmount: platformFeeCents / 100,
    };
  }

  /**
   * Single source of truth for split-bill state. The PAID gate is amount-based:
   *   paidSubtotal = Σ (succeeded payment.amount − tipAmount)
   *   remaining    = billSubtotal − paidSubtotal
   * Per-unit `paidQuantity` is advisory (drives the by-item picker + receipts +
   * refund reversal). `hasLoyaltyDiscount` disables by-item split, where line
   * values can't sum to a loyalty-discounted Order.totalPrice.
   */

  async computeSessionBalance(
    tx: {
      order: { findMany: (args: any) => Promise<any[]> };
      payment: { findMany: (args: any) => Promise<any[]> };
    },
    sessionId: string,
  ): Promise<{
    billSubtotal: number;
    paidSubtotal: number;
    remaining: number;
    hasLoyaltyDiscount: boolean;
    items: Array<{
      orderItemId: string;
      name: string;
      unitPrice: number;
      quantity: number;
      paidQuantity: number;
      remainingQuantity: number;
    }>;
  }> {
    const orders = await tx.order.findMany({
      where: { tableSessionId: sessionId },
      select: {
        totalPrice: true,
        pointsRedeemedForDiscount: true,
        pointsRedeemedForItems: true,
        items: {
          select: {
            id: true,
            quantity: true,
            unitPrice: true,
            unitPriceWithOptions: true,
            paidQuantity: true,
            selectedOptions: true,
            menuItem: { select: { name: true, price: true } },
          },
        },
      },
    });

    const billSubtotal = this.roundMoney(
      orders.reduce((sum, o) => sum + o.totalPrice, 0),
    );

    const payments = await tx.payment.findMany({
      where: { tableSessionId: sessionId, status: 'SUCCEEDED' },
      select: { amount: true, tipAmount: true, status: true },
    });
    // Defensive re-filter: the DB query already scopes to SUCCEEDED, but unit-test
    // mocks ignore the where-clause — only succeeded payments reduce the balance.
    const paidSubtotal = this.roundMoney(
      payments
        .filter((p) => p.status === 'SUCCEEDED')
        .reduce((sum, p) => sum + (p.amount - (p.tipAmount ?? 0)), 0),
    );

    const hasLoyaltyDiscount = orders.some(
      (o) =>
        (o.pointsRedeemedForDiscount ?? 0) > 0 ||
        (o.pointsRedeemedForItems ?? 0) > 0,
    );

    const items = orders.flatMap((o) =>
      ((o.items as any[]) ?? []).map((it) => {
        const optionsTotal = Array.isArray(it.selectedOptions)
          ? (it.selectedOptions as any[]).reduce(
              (s, x) => s + (x?.priceModifier || 0),
              0,
            )
          : 0;
        const snapshotUnitPrice =
          typeof it.unitPriceWithOptions === 'number' &&
          it.unitPriceWithOptions > 0
            ? it.unitPriceWithOptions
            : undefined;
        const unitPrice = this.roundMoney(
          snapshotUnitPrice ?? (it.menuItem?.price ?? 0) + optionsTotal,
        );
        return {
          orderItemId: it.id as string,
          name: (it.menuItem?.name as string) ?? 'Item',
          unitPrice,
          quantity: it.quantity as number,
          paidQuantity: (it.paidQuantity as number) ?? 0,
          remainingQuantity:
            (it.quantity as number) - ((it.paidQuantity as number) ?? 0),
        };
      }),
    );

    return {
      billSubtotal,
      paidSubtotal,
      remaining: this.roundMoney(billSubtotal - paidSubtotal),
      hasLoyaltyDiscount,
      items,
    };
  }

  /**
   * M-PAY-5: amount-based balances for MANY sessions in two queries, instead of
   * computeSessionBalance's two-queries-per-session (the daily retention
   * cleanup previously called that in a loop over up to 100 sessions). Only the
   * amount gate is needed there — no per-item breakdown — and the formulas are
   * kept identical to computeSessionBalance so the two never diverge:
   *   paidSubtotal = Σ(succeeded amount − tip), remaining = bill − paid.
   */
  async computeSessionAmountBalances(
    tx: {
      order: { findMany: (args: any) => Promise<any[]> };
      payment: { findMany: (args: any) => Promise<any[]> };
    },
    sessionIds: string[],
  ): Promise<
    Map<
      string,
      { billSubtotal: number; paidSubtotal: number; remaining: number }
    >
  > {
    const result = new Map<
      string,
      { billSubtotal: number; paidSubtotal: number; remaining: number }
    >();
    if (sessionIds.length === 0) return result;

    const [orders, payments] = await Promise.all([
      tx.order.findMany({
        where: { tableSessionId: { in: sessionIds } },
        select: { tableSessionId: true, totalPrice: true },
      }),
      tx.payment.findMany({
        where: { tableSessionId: { in: sessionIds }, status: 'SUCCEEDED' },
        select: {
          tableSessionId: true,
          amount: true,
          tipAmount: true,
          status: true,
        },
      }),
    ]);

    const billBySession = new Map<string, number>();
    for (const o of orders) {
      billBySession.set(
        o.tableSessionId,
        (billBySession.get(o.tableSessionId) ?? 0) + (o.totalPrice ?? 0),
      );
    }

    const paidBySession = new Map<string, number>();
    for (const p of payments) {
      // Defensive re-filter (unit-test mocks ignore the where-clause), mirroring
      // computeSessionBalance — only succeeded payments reduce the balance.
      if (p.status !== 'SUCCEEDED') continue;
      paidBySession.set(
        p.tableSessionId,
        (paidBySession.get(p.tableSessionId) ?? 0) +
          ((p.amount ?? 0) - (p.tipAmount ?? 0)),
      );
    }

    for (const id of sessionIds) {
      const billSubtotal = this.roundMoney(billBySession.get(id) ?? 0);
      const paidSubtotal = this.roundMoney(paidBySession.get(id) ?? 0);
      result.set(id, {
        billSubtotal,
        paidSubtotal,
        remaining: this.roundMoney(billSubtotal - paidSubtotal),
      });
    }
    return result;
  }

  async assertNoPendingBillScopeConflict(
    tx: Prisma.TransactionClient,
    sessionId: string,
    candidateScope: BillPaymentScope,
    options: {
      ignorePaymentIds?: string[];
      ignoreCashRequestIds?: string[];
    } = {},
  ): Promise<void> {
    const ignorePaymentIds = new Set(options.ignorePaymentIds ?? []);
    const ignoreCashRequestIds = new Set(options.ignoreCashRequestIds ?? []);

    const pendingPayments = await tx.payment.findMany({
      where: {
        tableSessionId: sessionId,
        status: PaymentStatus.PENDING,
        ...(ignorePaymentIds.size > 0
          ? { id: { notIn: [...ignorePaymentIds] } }
          : {}),
      },
      select: {
        id: true,
        provider: true,
        status: true,
        providerPayload: true,
      },
    });

    for (const payment of pendingPayments) {
      if (ignorePaymentIds.has(payment.id)) continue;
      if (payment.status !== PaymentStatus.PENDING) continue;
      const pendingScope = billScopeFromPayment(payment);
      if (billScopesOverlap(candidateScope, pendingScope)) {
        throw new ConflictException(
          'Another payment for this bill is already pending. Please wait for it to finish or cancel it before starting a new one.',
        );
      }
    }

    const pendingCashRequests = await tx.cashPaymentRequest.findMany({
      where: {
        tableSessionId: sessionId,
        status: CashPaymentRequestStatus.PENDING,
        ...(ignoreCashRequestIds.size > 0
          ? { id: { notIn: [...ignoreCashRequestIds] } }
          : {}),
      },
      select: {
        id: true,
        status: true,
        scope: true,
        orderIds: true,
      },
    });

    for (const request of pendingCashRequests) {
      if (ignoreCashRequestIds.has(request.id)) continue;
      if (request.status !== CashPaymentRequestStatus.PENDING) continue;
      const pendingScope = billScopeFromCashRequest(request);
      if (billScopesOverlap(candidateScope, pendingScope)) {
        throw new ConflictException(
          'Another payment for this bill is already pending. Please wait for it to finish or cancel it before starting a new one.',
        );
      }
    }
  }

  async createPendingPaymentAfterScopeGuardTx(
    tx: Prisma.TransactionClient,
    sessionId: string,
    scope: CheckoutScope | null,
    data: Prisma.PaymentUncheckedCreateInput,
    options: {
      ignorePaymentIds?: string[];
    } = {},
  ) {
    await this.lockOpenSessionForSettlement(tx, sessionId);
    await this.assertNoPendingBillScopeConflict(
      tx,
      sessionId,
      billScopeFromCheckoutScope(scope),
      options,
    );
    return tx.payment.create({ data });
  }

  async createPendingPaymentAfterScopeGuard(
    sessionId: string,
    scope: CheckoutScope | null,
    data: Prisma.PaymentUncheckedCreateInput,
    options: {
      ignorePaymentIds?: string[];
    } = {},
  ) {
    return this.prisma.$transaction((tx) =>
      this.createPendingPaymentAfterScopeGuardTx(
        tx,
        sessionId,
        scope,
        data,
        options,
      ),
    );
  }

  getCashPaymentRequestScopeKey(
    scope: CashPaymentRequestScope,
    orderIds: string[],
  ): string {
    if (scope === CashPaymentRequestScope.FULL_TABLE) return 'FULL_TABLE';
    return createHash('sha256')
      .update(JSON.stringify([...orderIds].sort()))
      .digest('hex')
      .slice(0, 16);
  }

  formatCashPaymentRequest(request: any): CashPaymentRequestDto {
    return {
      id: request.id,
      restaurantId: request.restaurantId,
      tableSessionId: request.tableSessionId,
      tableId: request.tableId,
      tableName: request.table?.name ?? null,
      status: request.status,
      scope: request.scope,
      orderIds: request.orderIds ?? [],
      requestedAmount: this.roundMoney(request.requestedAmount ?? 0),
      currency: request.currency ?? 'EUR',
      paymentId: request.paymentId ?? null,
      resolvedById: request.resolvedById ?? null,
      resolvedAt: request.resolvedAt ?? null,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
    };
  }

  emitCashPaymentRequestEvent(
    eventName: 'cashPaymentRequest:created' | 'cashPaymentRequest:updated',
    request: any,
  ) {
    const payload = this.formatCashPaymentRequest(request);
    const tableSessionId = request.tableSessionId ?? null;
    this.events.emitToRestaurant(request.restaurantId, eventName, payload);
    if (tableSessionId) {
      this.events.emitToTableSession(tableSessionId, eventName, payload);
    }

    if (request.status === CashPaymentRequestStatus.PENDING && tableSessionId) {
      this.emitPendingBillPayment(this.formatPendingCashRequest(request));
    } else if (tableSessionId) {
      this.emitBillPaymentCleared(tableSessionId, request.id, 'CASH_REQUEST');
    }
  }

  billScopeToPayload(scope: BillPaymentScope): {
    scope: 'FULL_TABLE' | 'ORDER_ITEMS';
    orderIds: string[];
  } {
    return scope.kind === 'FULL_TABLE'
      ? { scope: 'FULL_TABLE', orderIds: [] }
      : {
          scope: 'ORDER_ITEMS',
          orderIds: normalizeScopeOrderIds(scope.orderIds),
        };
  }

  formatPendingPayment(payment: any): PendingBillPaymentDto {
    const scope = this.billScopeToPayload(billScopeFromPayment(payment));
    return {
      id: payment.id,
      tableSessionId: payment.tableSessionId,
      source: 'ONLINE_PAYMENT',
      provider: payment.provider as CheckoutProvider,
      status: PaymentStatus.PENDING,
      scope: scope.scope,
      orderIds: scope.orderIds,
      amount: this.roundMoney(payment.amount ?? 0),
      createdAt: payment.createdAt ?? new Date(),
    };
  }

  formatPendingCashRequest(request: any): PendingBillPaymentDto {
    return {
      id: request.id,
      tableSessionId: request.tableSessionId,
      source: 'CASH_REQUEST',
      provider: 'CASH',
      status: CashPaymentRequestStatus.PENDING,
      scope:
        request.scope === CashPaymentRequestScope.ORDER_ITEMS
          ? 'ORDER_ITEMS'
          : 'FULL_TABLE',
      orderIds: normalizeScopeOrderIds(request.orderIds ?? []),
      amount: this.roundMoney(request.requestedAmount ?? 0),
      createdAt: request.createdAt ?? new Date(),
    };
  }

  emitPendingBillPayment(payment: PendingBillPaymentDto) {
    this.events.emitToTableSession(
      payment.tableSessionId,
      'billPayment:pending',
      payment,
    );
  }

  emitBillPaymentCleared(
    tableSessionId: string,
    id: string,
    source: PendingBillPaymentDto['source'],
  ) {
    this.events.emitToTableSession(tableSessionId, 'billPayment:cleared', {
      id,
      tableSessionId,
      source,
    });
  }

  async getPendingBillPayment(
    sessionId: string,
  ): Promise<PendingBillPaymentDto | null> {
    const [payments, cashRequests] = await Promise.all([
      this.prisma.payment.findMany({
        where: { tableSessionId: sessionId, status: PaymentStatus.PENDING },
        select: {
          id: true,
          tableSessionId: true,
          provider: true,
          providerPayload: true,
          amount: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.cashPaymentRequest.findMany({
        where: {
          tableSessionId: sessionId,
          status: CashPaymentRequestStatus.PENDING,
        },
        select: {
          id: true,
          tableSessionId: true,
          scope: true,
          orderIds: true,
          requestedAmount: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const pending = [
      ...payments.map((payment) => this.formatPendingPayment(payment)),
      ...cashRequests.map((request) => this.formatPendingCashRequest(request)),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return (
      pending.find((payment) => payment.scope === 'FULL_TABLE') ??
      pending[0] ??
      null
    );
  }

  getOrderItemUnitPrice(item: any): number {
    if (
      typeof item.unitPriceWithOptions === 'number' &&
      item.unitPriceWithOptions > 0
    ) {
      return this.roundMoney(item.unitPriceWithOptions);
    }

    const optionsTotal = Array.isArray(item.selectedOptions)
      ? (item.selectedOptions as any[]).reduce(
          (sum, option) => sum + (option?.priceModifier || 0),
          0,
        )
      : 0;
    return this.roundMoney(
      (item.menuItem?.price ?? item.unitPrice ?? 0) + optionsTotal,
    );
  }

  async resolveCheckoutCharge(
    tx: {
      order: { findMany: (args: any) => Promise<any[]> };
      payment: { findMany: (args: any) => Promise<any[]> };
    },
    session: { id: string },
    tipPercent: number,
    platformFeePercent: number,
    scopeInput?: CheckoutScopeInput,
  ): Promise<CheckoutCharge> {
    const normalizedScope = normalizeCheckoutScope(scopeInput);

    const balance = await this.computeSessionBalance(tx, session.id);
    if (balance.remaining <= 0) {
      throw new ConflictException('This session has already been paid');
    }

    if (!normalizedScope) {
      return {
        ...this.calculatePartialTotals(
          balance.remaining,
          tipPercent,
          platformFeePercent,
        ),
        checkoutScope: null,
        checkoutScopeKey: null,
      };
    }

    if (balance.hasLoyaltyDiscount) {
      throw new BadRequestException(
        'Pay my orders is unavailable when loyalty discounts apply',
      );
    }

    const unpaidByItems = this.roundMoney(
      balance.items.reduce(
        (sum, item) => sum + item.unitPrice * item.remainingQuantity,
        0,
      ),
    );
    if (Math.abs(unpaidByItems - balance.remaining) > 0.01) {
      throw new BadRequestException(
        'Pay my orders is unavailable after partial amount payments',
      );
    }

    const orders = await tx.order.findMany({
      where: {
        tableSessionId: session.id,
        id: { in: normalizedScope.orderIds },
      },
      select: {
        id: true,
        pointsRedeemedForDiscount: true,
        pointsRedeemedForItems: true,
        items: {
          select: {
            id: true,
            quantity: true,
            unitPrice: true,
            unitPriceWithOptions: true,
            paidQuantity: true,
            selectedOptions: true,
            menuItem: { select: { price: true } },
          },
        },
      },
    });

    if (orders.length !== normalizedScope.orderIds.length) {
      throw new BadRequestException('Selected orders are no longer available');
    }

    if (
      orders.some(
        (order) =>
          (order.pointsRedeemedForDiscount ?? 0) > 0 ||
          (order.pointsRedeemedForItems ?? 0) > 0,
      )
    ) {
      throw new BadRequestException(
        'Pay my orders is unavailable when loyalty discounts apply',
      );
    }

    const allocations: CheckoutScopeAllocation[] = [];
    let chargeSubtotal = 0;
    for (const order of orders) {
      for (const item of order.items ?? []) {
        const paidQuantity = item.paidQuantity ?? 0;
        const remainingQuantity = item.quantity - paidQuantity;
        if (remainingQuantity <= 0) continue;

        const amount = this.roundMoney(
          this.getOrderItemUnitPrice(item) * remainingQuantity,
        );
        allocations.push({
          orderItemId: item.id,
          quantity: remainingQuantity,
          amount,
          snapshotPaid: paidQuantity,
        });
        chargeSubtotal += amount;
      }
    }

    chargeSubtotal = this.roundMoney(chargeSubtotal);
    if (chargeSubtotal <= 0) {
      throw new ConflictException('Selected orders are already paid');
    }
    if (chargeSubtotal > balance.remaining + 0.01) {
      throw new ConflictException(
        'Selected orders exceed the outstanding balance',
      );
    }

    const checkoutScope: CheckoutScope = {
      kind: 'ORDER_ITEMS',
      orderIds: normalizedScope.orderIds,
      allocations,
      chargeSubtotal,
    };

    return {
      ...this.calculatePartialTotals(
        chargeSubtotal,
        tipPercent,
        platformFeePercent,
      ),
      checkoutScope,
      checkoutScopeKey: getCheckoutScopeKey(checkoutScope),
    };
  }

  isPaymentClaimable(payment: any): boolean {
    return (
      payment.status === undefined ||
      ['PENDING', 'ABANDONED'].includes(payment.status)
    );
  }

  async claimSuccessfulPaymentForOpenSession(
    tx: any,
    payment: any,
    data: Record<string, any>,
  ): Promise<boolean> {
    if (!this.isPaymentClaimable(payment)) return false;

    // Underpay guard (#2): never release a session for a payment that no longer
    // covers the REMAINING balance. Orders can be added after a low PaymentIntent
    // was created, and POS split settlements may have already paid part of the
    // bill — confirming a stale/short intent must not flip the session to PAID
    // for a fraction of what's still owed. The remaining excludes this payment
    // (still PENDING here, so not counted as succeeded); the net compared is
    // amount − tip, since tips never reduce what's owed. Online checkout charges
    // the full remaining, so a normal full payment always clears it; only an
    // added-items / tampered / partial-online case falls short and we leave the
    // session OPEN (payment unclaimed) so staff collect the rest.
    const balance = await this.computeSessionBalance(
      tx,
      payment.tableSessionId,
    );
    const paymentNet = this.roundMoney(
      (payment.amount ?? 0) - (payment.tipAmount ?? 0),
    );
    if (paymentNet + 0.01 < balance.remaining) {
      this.logger.warn(
        'Refusing to mark session PAID: payment does not cover remaining bill',
        {
          paymentId: payment.id,
          tableSessionId: payment.tableSessionId,
          paymentNet,
          remaining: balance.remaining,
          provider: payment.provider,
        },
      );
      return false;
    }

    const sessionUpdate = await tx.tableSession.updateMany({
      where: {
        id: payment.tableSessionId,
        status: 'OPEN',
        payments: {
          some: {
            id: payment.id,
            status: { in: ['PENDING', 'ABANDONED'] },
          },
        },
      },
      data: { status: 'PAID', paidAt: new Date() },
    });
    if (sessionUpdate.count === 0) {
      this.logger.warn(
        'Ignoring successful payment callback because session is already closed',
        {
          paymentId: payment.id,
          tableSessionId: payment.tableSessionId,
          provider: payment.provider,
        },
      );
      return false;
    }

    const paymentUpdate = await tx.payment.updateMany({
      where: { id: payment.id, status: { in: ['PENDING', 'ABANDONED'] } },
      data,
    });
    if (paymentUpdate.count === 0) {
      throw new Error('Payment success claim lost race after session claim');
    }

    return true;
  }

  async claimSuccessfulPayment(
    tx: any,
    payment: any,
    data: Record<string, any>,
  ): Promise<PaymentClaimResult> {
    const checkoutScope = getCheckoutScopeFromPayload(payment.providerPayload);
    if (checkoutScope) {
      return this.claimSuccessfulScopedCheckoutPayment(
        tx,
        payment,
        data,
        checkoutScope,
      );
    }

    const claimed = await this.claimSuccessfulPaymentForOpenSession(
      tx,
      payment,
      data,
    );
    return { claimed, sessionPaid: claimed };
  }

  async claimSuccessfulScopedCheckoutPayment(
    tx: any,
    payment: any,
    data: Record<string, any>,
    checkoutScope: CheckoutScope,
  ): Promise<PaymentClaimResult> {
    if (!this.isPaymentClaimable(payment)) {
      return { claimed: false, sessionPaid: false };
    }

    const paymentNet = this.roundMoney(
      (payment.amount ?? 0) - (payment.tipAmount ?? 0),
    );
    if (Math.abs(paymentNet - checkoutScope.chargeSubtotal) > 0.01) {
      this.logger.warn('Refusing scoped payment claim: scope amount mismatch', {
        paymentId: payment.id,
        tableSessionId: payment.tableSessionId,
        paymentNet,
        scopeSubtotal: checkoutScope.chargeSubtotal,
      });
      return { claimed: false, sessionPaid: false };
    }

    const openSession = await tx.tableSession.findFirst({
      where: { id: payment.tableSessionId, status: 'OPEN' },
      select: { id: true },
    });
    if (!openSession) {
      this.logger.warn(
        'Ignoring scoped payment callback because session is already closed',
        {
          paymentId: payment.id,
          tableSessionId: payment.tableSessionId,
          provider: payment.provider,
        },
      );
      return { claimed: false, sessionPaid: false };
    }

    await this.lockOpenSessionForSettlement(tx, payment.tableSessionId);

    for (const allocation of checkoutScope.allocations) {
      const updated = await tx.orderItem.updateMany({
        where: {
          id: allocation.orderItemId,
          paidQuantity: allocation.snapshotPaid,
        },
        data: { paidQuantity: { increment: allocation.quantity } },
      });
      if (updated.count === 0) {
        this.logger.warn(
          'Refusing scoped payment claim: selected item units changed',
          {
            paymentId: payment.id,
            tableSessionId: payment.tableSessionId,
            orderItemId: allocation.orderItemId,
          },
        );
        throw new ConflictException('Selected items are already settled');
      }
    }

    const paymentUpdate = await tx.payment.updateMany({
      where: { id: payment.id, status: { in: ['PENDING', 'ABANDONED'] } },
      data: {
        ...data,
        splitMode: data.splitMode ?? SplitMode.ITEM,
      },
    });
    if (paymentUpdate.count === 0) {
      throw new Error('Payment success claim lost race after item claim');
    }

    await tx.paymentAllocation.createMany({
      data: checkoutScope.allocations.map((allocation) => ({
        paymentId: payment.id,
        orderItemId: allocation.orderItemId,
        quantity: allocation.quantity,
        amount: allocation.amount,
      })),
    });

    const balance = await this.computeSessionBalance(
      tx,
      payment.tableSessionId,
    );
    let sessionPaid = false;
    if (balance.remaining <= 0.01) {
      const flip = await tx.tableSession.updateMany({
        where: { id: payment.tableSessionId, status: 'OPEN' },
        data: { status: 'PAID', paidAt: new Date() },
      });
      sessionPaid = flip.count > 0;
    }

    return {
      claimed: true,
      sessionPaid,
      remaining: Math.max(0, balance.remaining),
      splitMode: SplitMode.ITEM,
    };
  }

  mergeProviderPayload(payload: unknown, patch: Record<string, unknown>) {
    const base =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {};
    return { ...base, ...patch };
  }

  async recordProviderEvent(
    tx: Prisma.TransactionClient,
    provider: PaymentProvider,
    eventKey: string,
    data: {
      paymentId?: string | null;
      restaurantId?: string | null;
      payload?: Record<string, unknown>;
    } = {},
  ): Promise<boolean> {
    try {
      await tx.paymentProviderEvent.create({
        data: {
          provider,
          eventKey,
          paymentId: data.paymentId ?? null,
          restaurantId: data.restaurantId ?? null,
          payload: data.payload as Prisma.InputJsonValue,
        },
      });
      return true;
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        return false;
      }
      throw error;
    }
  }

  async lockOpenSessionForSettlement(
    tx: Prisma.TransactionClient,
    sessionId: string,
  ): Promise<void> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM "table_session"
      WHERE id = ${sessionId}
        AND status = 'OPEN'::"TableSessionStatus"
      FOR UPDATE
    `;
    if (rows.length === 0) {
      throw new ConflictException('Session is no longer open');
    }
  }

  async lockPendingCashPaymentRequest(
    tx: Prisma.TransactionClient,
    requestId: string,
  ): Promise<void> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM "cash_payment_request"
      WHERE id = ${requestId}
        AND status = 'PENDING'::"CashPaymentRequestStatus"
      FOR UPDATE
    `;
    if (rows.length === 0) {
      throw new ConflictException('Cash payment request is already handled');
    }
  }

  async emitPaymentConfirmed(payment: any) {
    const tableSession =
      payment.tableSession ??
      (await this.prisma.tableSession.findFirst({
        where: { id: payment.tableSessionId },
        include: { table: { select: { name: true } } },
      }));
    if (!tableSession) return;

    const tableNumber =
      tableSession.table?.name ??
      (
        await this.prisma.restaurantTable.findUnique({
          where: { id: tableSession.tableId },
          select: { name: true },
        })
      )?.name ??
      null;

    const customerName =
      (
        await this.prisma.order.findFirst({
          where: { tableSessionId: payment.tableSessionId },
          orderBy: { createdAt: 'desc' },
          select: { customerName: true },
        })
      )?.customerName ?? null;

    const payload = {
      paymentId: payment.id,
      tableSessionId: payment.tableSessionId,
      amount: payment.amount,
      tipAmount: payment.tipAmount,
      tableNumber,
      customerName,
    };

    this.events.emitToRestaurant(
      tableSession.restaurantId,
      'payment:confirmed',
      payload,
    );
    this.events.emitToTableSession(
      payment.tableSessionId,
      'payment:confirmed',
      payload,
    );

    this.events.emitTableStatusChanged(
      tableSession.restaurantId,
      tableSession.tableId,
      payment.tableSessionId,
    );
  }

  async emitPaymentClaimEvents(payment: any, claim: PaymentClaimResult) {
    if (!claim.claimed) return;

    if (!claim.splitMode) {
      await this.emitPaymentConfirmed(payment);
      return;
    }

    const tableSession =
      payment.tableSession ??
      (await this.prisma.tableSession.findFirst({
        where: { id: payment.tableSessionId },
        include: { table: { select: { name: true } } },
      }));
    if (!tableSession) return;

    this.events.emitTableStatusChanged(
      tableSession.restaurantId,
      tableSession.tableId,
      payment.tableSessionId,
    );
    const billUpdatedPayload = {
      tableSessionId: payment.tableSessionId,
      tableId: tableSession.tableId,
      paymentId: payment.id,
      splitMode: claim.splitMode,
      remaining: Math.max(0, claim.remaining ?? 0),
      sessionPaid: claim.sessionPaid,
    };
    this.events.emitToRestaurant(
      tableSession.restaurantId,
      'bill:updated',
      billUpdatedPayload,
    );
    this.events.emitToTableSession(
      payment.tableSessionId,
      'bill:updated',
      billUpdatedPayload,
    );

    if (claim.sessionPaid) {
      await this.emitPaymentConfirmed(payment);
    }
  }
}
