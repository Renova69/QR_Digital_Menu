import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
  Logger,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { StripeProvider } from './stripe.provider';
import {
  EpayNotification,
  EpayPage,
  EpayProvider,
} from './epay.provider';
import { BoricaCardholderInfo, BoricaProvider } from './borica.provider';
import {
  MYPOS_TEST_CLIENT_NUMBER,
  MYPOS_TEST_KEY_INDEX,
  MYPOS_TEST_PRIVATE_KEY,
  MYPOS_TEST_PUBLIC_CERT,
  MYPOS_TEST_STORE_ID,
  MyposProvider,
} from './mypos.provider';
import { decryptSecret, encryptSecret } from './secret-crypto';
import { EventsGateway } from '../events/events.gateway';
import { FeatureService } from '../subscription/feature.service';
import { FeatureFlag } from '../subscription/feature-flag.enum';
import {
  CashPaymentRequestScope,
  CashPaymentRequestStatus,
  PaymentStatus,
  PaymentProvider,
  Prisma,
} from '@prisma/client';
import { SettlePartialDto, SplitMode } from './dto/settle-partial.dto';

type CheckoutProvider = 'STRIPE' | 'EPAY' | 'BORICA' | 'MYPOS';

type CheckoutScopeInput = {
  orderIds?: string[];
};

type CheckoutScopeAllocation = {
  orderItemId: string;
  quantity: number;
  amount: number;
  snapshotPaid: number;
};

type CheckoutScope = {
  kind: 'ORDER_ITEMS';
  orderIds: string[];
  allocations: CheckoutScopeAllocation[];
  chargeSubtotal: number;
};

type BillPaymentScope =
  | { kind: 'FULL_TABLE' }
  | { kind: 'ORDER_ITEMS'; orderIds: string[] };

type CheckoutCharge = {
  subtotal: number;
  tipAmount: number;
  total: number;
  platformFeeCents: number;
  platformFeeAmount: number;
  checkoutScope: CheckoutScope | null;
  checkoutScopeKey: string | null;
};

type PaymentClaimResult = {
  claimed: boolean;
  sessionPaid: boolean;
  remaining?: number;
  splitMode?: SplitMode;
};

type CashPaymentRequestDto = {
  id: string;
  restaurantId: string;
  tableSessionId: string;
  tableId: string;
  tableName: string | null;
  status: CashPaymentRequestStatus;
  scope: CashPaymentRequestScope;
  orderIds: string[];
  requestedAmount: number;
  currency: string;
  paymentId: string | null;
  resolvedById: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type PendingBillPaymentDto = {
  id: string;
  tableSessionId: string;
  source: 'ONLINE_PAYMENT' | 'CASH_REQUEST';
  provider: CheckoutProvider | 'CASH';
  status: 'PENDING';
  scope: 'FULL_TABLE' | 'ORDER_ITEMS';
  orderIds: string[];
  amount: number;
  createdAt: Date;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const ABANDONED_PAYMENT_RETENTION_DAYS = 90;
const STALE_OPEN_SESSION_HOURS = 36;

type BoricaCardholderInput = {
  cardholderName?: string | null;
  email?: string | null;
  phone?: string | null;
  billingAddress?: string | null;
};

type MyposConfig = {
  mode: 'DEMO' | 'LIVE';
  clientNumber: string;
  storeId: string;
  keyIndex: string;
  privateKeyPem: string;
  publicCertPem: string;
  currency: string;
};

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeProvider,
    private readonly epay: EpayProvider,
    private readonly borica: BoricaProvider,
    private readonly mypos: MyposProvider,
    private readonly events: EventsGateway,
    private readonly featureService: FeatureService,
  ) {}

  private roundMoney(value: number) {
    return Math.round(value * 100) / 100;
  }

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

    const staleSessions = await this.prisma.tableSession.findMany({
      where: {
        status: 'OPEN',
        createdAt: { lt: staleSessionCutoff },
        payments: { none: { status: PaymentStatus.PENDING } },
      },
      select: { id: true, restaurantId: true, tableId: true },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });

    let closedNoPayment = 0;
    let markedPaid = 0;
    let partialLeftOpen = 0;

    for (const session of staleSessions) {
      const balance = await this.computeSessionBalance(this.prisma, session.id);
      if (balance.paidSubtotal > 0 && balance.remaining > 0.01) {
        partialLeftOpen++;
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

  private async verifyRestaurantAccess(restaurantId: string, userId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        id: true,
        ownerId: true,
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
      return restaurant;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { restaurantId: true, role: true },
    });

    if (user?.role === 'SUPER_ADMIN') return restaurant;

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
  private async verifyPosOperatorAccess(restaurantId: string, userId: string) {
    const [restaurant, user] = await Promise.all([
      this.prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { ownerId: true },
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { restaurantId: true, role: true },
      }),
    ]);
    if (!restaurant) throw new NotFoundException('Restaurant not found');
    if (user?.role === 'SUPER_ADMIN') return;
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

  private async verifyRestaurantStaffAccess(restaurantId: string, userId: string) {
    const [restaurant, user] = await Promise.all([
      this.prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { id: true, ownerId: true },
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { restaurantId: true, role: true },
      }),
    ]);

    if (!restaurant) throw new NotFoundException('Restaurant not found');
    if (user?.role === 'SUPER_ADMIN') return { restaurant, user };
    if (restaurant.ownerId === userId) return { restaurant, user };
    if (user?.restaurantId === restaurantId) return { restaurant, user };

    throw new ForbiddenException(
      'You do not have permission to access these requests',
    );
  }

  private async verifyCashPaymentOperatorAccess(
    restaurantId: string,
    userId: string,
  ) {
    const context = await this.verifyRestaurantStaffAccess(restaurantId, userId);
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

  private paymentStatusLabel(status: string) {
    return status === 'SUCCEEDED'
      ? 'Succeeded'
      : status.charAt(0) + status.slice(1).toLowerCase();
  }

  private mapPayment(payment: any) {
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

    let session: any;
    try {
      session = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.tableSession.findFirst({
          where: { tableId, restaurantId, status: 'OPEN' },
        });
        if (existing) return existing;
        return tx.tableSession.create({
          data: { tableId, restaurantId },
        });
      });
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) throw error;

      const existing = await this.prisma.tableSession.findFirst({
        where: { tableId, restaurantId, status: 'OPEN' },
      });
      if (!existing) throw error;
      session = existing;
    }
    return { session, token: session.token };
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return !!(
      error &&
      typeof error === 'object' &&
      (error as { code?: string }).code === 'P2002'
    );
  }

  private buildStripeCheckoutKey(
    sessionId: string,
    amountCents: number,
    platformFeeCents: number,
    checkoutScopeKey?: string | null,
  ): string {
    const base = `stripe:${sessionId}:${amountCents}:${platformFeeCents}:eur`;
    return checkoutScopeKey ? `${base}:${checkoutScopeKey}` : base;
  }

  private normalizeTipPercent(tipPercent: number | undefined): number {
    const normalized = Number(tipPercent ?? 0);
    if (
      !Number.isFinite(normalized) ||
      normalized < 0 ||
      normalized > 100
    ) {
      throw new BadRequestException('tipPercent must be between 0 and 100');
    }
    return normalized;
  }

  private calculateTotals(
    orders: Array<{ totalPrice: number }>,
    tipPercent: number,
    platformFeePercent: number,
  ) {
    const subtotal = orders.reduce((sum, order) => sum + order.totalPrice, 0);
    return this.calculatePartialTotals(subtotal, tipPercent, platformFeePercent);
  }

  /**
   * Totals for an arbitrary chargeable subtotal — used by full-bill checkout
   * (subtotal = remaining balance) and split settlement. tipAmount and the
   * platform fee are derived from this subtotal only, never the whole bill.
   */
  private calculatePartialTotals(
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
  private async computeSessionBalance(
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
      (((o.items as any[]) ?? []) as any[]).map((it) => {
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
          remainingQuantity: (it.quantity as number) - ((it.paidQuantity as number) ?? 0),
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

  private normalizeCheckoutScope(
    scope?: CheckoutScopeInput,
  ): { orderIds: string[] } | null {
    if (!scope?.orderIds) return null;
    if (!Array.isArray(scope.orderIds)) {
      throw new BadRequestException('orderIds must be an array');
    }

    const orderIds = Array.from(
      new Set(
        scope.orderIds
          .map((id) => (typeof id === 'string' ? id.trim() : ''))
          .filter(Boolean),
      ),
    );

    if (orderIds.length === 0) {
      throw new BadRequestException('Select at least one order to pay');
    }
    if (orderIds.length > 50) {
      throw new BadRequestException('Too many orders selected');
    }

    return { orderIds };
  }

  private getCheckoutScopeKey(scope: CheckoutScope | null): string | null {
    if (!scope) return null;
    return createHash('sha256')
      .update(JSON.stringify({
        kind: scope.kind,
        orderIds: scope.orderIds,
        allocations: scope.allocations.map((a) => ({
          orderItemId: a.orderItemId,
          quantity: a.quantity,
          amount: a.amount,
          snapshotPaid: a.snapshotPaid,
        })),
        chargeSubtotal: scope.chargeSubtotal,
      }))
      .digest('hex')
      .slice(0, 16);
  }

  private getCheckoutScopeFromPayload(payload: unknown): CheckoutScope | null {
    const base =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as Record<string, any>)
        : null;
    const scope = base?.checkoutScope;
    if (
      !scope ||
      scope.kind !== 'ORDER_ITEMS' ||
      !Array.isArray(scope.orderIds) ||
      !Array.isArray(scope.allocations)
    ) {
      return null;
    }

    const allocations = scope.allocations
      .map((a: any) => ({
        orderItemId: typeof a.orderItemId === 'string' ? a.orderItemId : '',
        quantity: Number(a.quantity),
        amount: Number(a.amount),
        snapshotPaid: Number(a.snapshotPaid),
      }))
      .filter(
        (a: CheckoutScopeAllocation) =>
          a.orderItemId &&
          Number.isInteger(a.quantity) &&
          a.quantity > 0 &&
          Number.isFinite(a.amount) &&
          a.amount > 0 &&
          Number.isInteger(a.snapshotPaid) &&
          a.snapshotPaid >= 0,
      );

    if (allocations.length === 0) return null;

    return {
      kind: 'ORDER_ITEMS',
      orderIds: scope.orderIds
        .filter((id: unknown) => typeof id === 'string' && id.trim())
        .map((id: string) => id.trim()),
      allocations,
      chargeSubtotal: this.roundMoney(Number(scope.chargeSubtotal) || 0),
    };
  }

  private paymentScopeMatches(payment: any, scope: CheckoutScope | null): boolean {
    const stored = this.getCheckoutScopeFromPayload(payment.providerPayload);
    if (!stored && !scope) return true;
    if (!stored || !scope) return false;
    return this.getCheckoutScopeKey(stored) === this.getCheckoutScopeKey(scope);
  }

  private checkoutScopePayload(scope: CheckoutScope | null) {
    return scope ? ({ checkoutScope: scope } as Record<string, unknown>) : undefined;
  }

  private billScopeFromCheckoutScope(scope: CheckoutScope | null): BillPaymentScope {
    return scope
      ? { kind: 'ORDER_ITEMS', orderIds: this.normalizeScopeOrderIds(scope.orderIds) }
      : { kind: 'FULL_TABLE' };
  }

  private billScopeFromCashRequest(request: {
    scope: CashPaymentRequestScope;
    orderIds?: string[] | null;
  }): BillPaymentScope {
    return request.scope === CashPaymentRequestScope.ORDER_ITEMS
      ? {
          kind: 'ORDER_ITEMS',
          orderIds: this.normalizeScopeOrderIds(request.orderIds ?? []),
        }
      : { kind: 'FULL_TABLE' };
  }

  private billScopeFromPayment(payment: any): BillPaymentScope {
    return this.billScopeFromCheckoutScope(
      this.getCheckoutScopeFromPayload(payment.providerPayload),
    );
  }

  private normalizeScopeOrderIds(orderIds: string[]): string[] {
    return Array.from(
      new Set(
        orderIds
          .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
          .map((id) => id.trim()),
      ),
    ).sort();
  }

  private billScopesEqual(a: BillPaymentScope, b: BillPaymentScope): boolean {
    if (a.kind !== b.kind) return false;
    if (a.kind === 'FULL_TABLE') return true;
    if (b.kind === 'FULL_TABLE') return true;
    const aIds = this.normalizeScopeOrderIds(a.orderIds);
    const bIds = this.normalizeScopeOrderIds(b.orderIds);
    return aIds.length === bIds.length && aIds.every((id, index) => id === bIds[index]);
  }

  private billScopesOverlap(a: BillPaymentScope, b: BillPaymentScope): boolean {
    if (a.kind === 'FULL_TABLE' || b.kind === 'FULL_TABLE') return true;
    const bIds = new Set(this.normalizeScopeOrderIds(b.orderIds));
    return this.normalizeScopeOrderIds(a.orderIds).some((id) => bIds.has(id));
  }

  private paymentBillScopeEquals(payment: any, scope: BillPaymentScope): boolean {
    return this.billScopesEqual(this.billScopeFromPayment(payment), scope);
  }

  private async assertNoPendingBillScopeConflict(
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
        ...(ignorePaymentIds.size > 0 ? { id: { notIn: [...ignorePaymentIds] } } : {}),
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
      const pendingScope = this.billScopeFromPayment(payment);
      if (this.billScopesOverlap(candidateScope, pendingScope)) {
        throw new ConflictException(
          'Another payment for this bill is already pending. Please wait for it to finish or cancel it before starting a new one.',
        );
      }
    }

    const pendingCashRequests = await tx.cashPaymentRequest.findMany({
      where: {
        tableSessionId: sessionId,
        status: CashPaymentRequestStatus.PENDING,
        ...(ignoreCashRequestIds.size > 0 ? { id: { notIn: [...ignoreCashRequestIds] } } : {}),
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
      const pendingScope = this.billScopeFromCashRequest(request);
      if (this.billScopesOverlap(candidateScope, pendingScope)) {
        throw new ConflictException(
          'Another payment for this bill is already pending. Please wait for it to finish or cancel it before starting a new one.',
        );
      }
    }
  }

  private async createPendingPaymentAfterScopeGuard(
    sessionId: string,
    scope: CheckoutScope | null,
    data: Prisma.PaymentUncheckedCreateInput,
    options: {
      ignorePaymentIds?: string[];
    } = {},
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockOpenSessionForSettlement(tx, sessionId);
      await this.assertNoPendingBillScopeConflict(
        tx,
        sessionId,
        this.billScopeFromCheckoutScope(scope),
        options,
      );
      return tx.payment.create({ data });
    });
  }

  private getCashPaymentRequestScopeKey(
    scope: CashPaymentRequestScope,
    orderIds: string[],
  ): string {
    if (scope === CashPaymentRequestScope.FULL_TABLE) return 'FULL_TABLE';
    return createHash('sha256')
      .update(JSON.stringify([...orderIds].sort()))
      .digest('hex')
      .slice(0, 16);
  }

  private formatCashPaymentRequest(request: any): CashPaymentRequestDto {
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

  private emitCashPaymentRequestEvent(
    eventName: 'cashPaymentRequest:created' | 'cashPaymentRequest:updated',
    request: any,
  ) {
    const payload = this.formatCashPaymentRequest(request);
    this.events.emitToRestaurant(
      request.restaurantId,
      eventName,
      payload,
    );
    this.events.emitToTableSession(request.tableSessionId, eventName, payload);

    if (request.status === CashPaymentRequestStatus.PENDING) {
      this.emitPendingBillPayment(this.formatPendingCashRequest(request));
    } else {
      this.emitBillPaymentCleared(
        request.tableSessionId,
        request.id,
        'CASH_REQUEST',
      );
    }
  }

  private billScopeToPayload(scope: BillPaymentScope): {
    scope: 'FULL_TABLE' | 'ORDER_ITEMS';
    orderIds: string[];
  } {
    return scope.kind === 'FULL_TABLE'
      ? { scope: 'FULL_TABLE', orderIds: [] }
      : { scope: 'ORDER_ITEMS', orderIds: this.normalizeScopeOrderIds(scope.orderIds) };
  }

  private formatPendingPayment(payment: any): PendingBillPaymentDto {
    const scope = this.billScopeToPayload(this.billScopeFromPayment(payment));
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

  private formatPendingCashRequest(request: any): PendingBillPaymentDto {
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
      orderIds: this.normalizeScopeOrderIds(request.orderIds ?? []),
      amount: this.roundMoney(request.requestedAmount ?? 0),
      createdAt: request.createdAt ?? new Date(),
    };
  }

  private emitPendingBillPayment(payment: PendingBillPaymentDto) {
    this.events.emitToTableSession(
      payment.tableSessionId,
      'billPayment:pending',
      payment,
    );
  }

  private emitBillPaymentCleared(
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

  private async getPendingBillPayment(
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

    return pending.find((payment) => payment.scope === 'FULL_TABLE') ?? pending[0] ?? null;
  }

  private getOrderItemUnitPrice(item: any): number {
    if (typeof item.unitPriceWithOptions === 'number' && item.unitPriceWithOptions > 0) {
      return this.roundMoney(item.unitPriceWithOptions);
    }

    const optionsTotal = Array.isArray(item.selectedOptions)
      ? (item.selectedOptions as any[]).reduce(
          (sum, option) => sum + (option?.priceModifier || 0),
          0,
        )
      : 0;
    return this.roundMoney((item.menuItem?.price ?? item.unitPrice ?? 0) + optionsTotal);
  }

  private async resolveCheckoutCharge(
    tx: {
      order: { findMany: (args: any) => Promise<any[]> };
      payment: { findMany: (args: any) => Promise<any[]> };
    },
    session: { id: string },
    tipPercent: number,
    platformFeePercent: number,
    scopeInput?: CheckoutScopeInput,
  ): Promise<CheckoutCharge> {
    const normalizedScope = this.normalizeCheckoutScope(scopeInput);

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
      throw new ConflictException('Selected orders exceed the outstanding balance');
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
      checkoutScopeKey: this.getCheckoutScopeKey(checkoutScope),
    };
  }

  private isPaymentClaimable(payment: any): boolean {
    return (
      payment.status === undefined ||
      ['PENDING', 'ABANDONED'].includes(payment.status)
    );
  }

  private async claimSuccessfulPaymentForOpenSession(
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
    const balance = await this.computeSessionBalance(tx, payment.tableSessionId);
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

  private async claimSuccessfulPayment(
    tx: any,
    payment: any,
    data: Record<string, any>,
  ): Promise<PaymentClaimResult> {
    const checkoutScope = this.getCheckoutScopeFromPayload(payment.providerPayload);
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

  private async claimSuccessfulScopedCheckoutPayment(
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

    const balance = await this.computeSessionBalance(tx, payment.tableSessionId);
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

  private isStripeConfigured(restaurant: any): boolean {
    return !!(
      this.featureService.restaurantHasFeature(
        restaurant,
        FeatureFlag.PAYMENTS_STRIPE,
      ) &&
      restaurant.paymentsEnabled &&
      restaurant.stripeOnboarded &&
      restaurant.stripeAccountId
    );
  }

  private isEpayConfigured(restaurant: any): boolean {
    return !!(
      this.featureService.restaurantHasFeature(
        restaurant,
        FeatureFlag.PAYMENTS_EPAY,
      ) &&
      restaurant.paymentsEnabled &&
      restaurant.epayEnabled &&
      restaurant.epayClientId &&
      restaurant.epayMerchantEmail &&
      restaurant.epaySecretEncrypted
    );
  }

  private isBoricaConfigured(restaurant: any): boolean {
    if (
      !this.featureService.restaurantHasFeature(
        restaurant,
        FeatureFlag.PAYMENTS_BORICA,
      ) ||
      !restaurant.paymentsEnabled ||
      !restaurant.boricaEnabled
    ) {
      return false;
    }

    if (restaurant.boricaMode === 'LIVE') {
      return !!(
        restaurant.boricaTerminalId &&
        restaurant.boricaMerchantId &&
        restaurant.boricaPrivateKeyEncrypted &&
        restaurant.boricaPublicCert
      );
    }

    // DEMO mode: fall back to platform-level sandbox keypair from env
    return !!(
      process.env.BORICA_TEST_TID &&
      process.env.BORICA_TEST_MID &&
      process.env.BORICA_TEST_PRIVATE_KEY &&
      process.env.BORICA_TEST_CERT
    );
  }

  private isMyposConfigured(restaurant: any): boolean {
    if (
      !this.featureService.restaurantHasFeature(
        restaurant,
        FeatureFlag.PAYMENTS_MYPOS,
      ) ||
      !restaurant.paymentsEnabled ||
      !restaurant.myposEnabled
    ) {
      return false;
    }

    if (restaurant.myposMode === 'LIVE') {
      return !!(
        restaurant.myposClientNumber &&
        restaurant.myposStoreId &&
        restaurant.myposKeyIndex &&
        restaurant.myposPrivateKeyEncrypted &&
        restaurant.myposPublicCert
      );
    }

    return true;
  }

  private resolveBoricaKeypair(restaurant: any): {
    terminal: string;
    merchant: string;
    merchantName: string;
    privateKeyPem: string;
    certPem: string;
  } {
    if (restaurant.boricaMode === 'LIVE') {
      return {
        terminal: restaurant.boricaTerminalId!,
        merchant: restaurant.boricaMerchantId!,
        merchantName: restaurant.boricaMerchantName ?? restaurant.name ?? '',
        privateKeyPem: decryptSecret(restaurant.boricaPrivateKeyEncrypted),
        certPem: restaurant.boricaPublicCert!,
      };
    }
    // DEMO: use platform-level bundled sandbox keypair
    return {
      terminal: process.env.BORICA_TEST_TID || 'V1800001',
      merchant: process.env.BORICA_TEST_MID || '1600000001',
      merchantName: restaurant.boricaMerchantName ?? restaurant.name ?? 'Test',
      privateKeyPem: process.env.BORICA_TEST_PRIVATE_KEY!,
      certPem: process.env.BORICA_TEST_CERT!,
    };
  }

  private resolveMyposConfig(restaurant: any): MyposConfig {
    const mode = restaurant.myposMode === 'LIVE' ? 'LIVE' : 'DEMO';

    if (mode === 'LIVE') {
      return {
        mode,
        clientNumber: restaurant.myposClientNumber!,
        storeId: restaurant.myposStoreId!,
        keyIndex: restaurant.myposKeyIndex!,
        privateKeyPem: decryptSecret(restaurant.myposPrivateKeyEncrypted),
        publicCertPem: restaurant.myposPublicCert!,
        currency: (restaurant.myposCurrency || 'EUR').toUpperCase(),
      };
    }

    return {
      mode,
      clientNumber:
        restaurant.myposClientNumber ||
        process.env.MYPOS_TEST_CLIENT_NUMBER ||
        MYPOS_TEST_CLIENT_NUMBER,
      storeId:
        restaurant.myposStoreId ||
        process.env.MYPOS_TEST_STORE_ID ||
        MYPOS_TEST_STORE_ID,
      keyIndex:
        restaurant.myposKeyIndex ||
        process.env.MYPOS_TEST_KEY_INDEX ||
        MYPOS_TEST_KEY_INDEX,
      privateKeyPem: restaurant.myposPrivateKeyEncrypted
        ? decryptSecret(restaurant.myposPrivateKeyEncrypted)
        : process.env.MYPOS_TEST_PRIVATE_KEY || MYPOS_TEST_PRIVATE_KEY,
      publicCertPem:
        restaurant.myposPublicCert ||
        process.env.MYPOS_TEST_PUBLIC_CERT ||
        MYPOS_TEST_PUBLIC_CERT,
      currency: (restaurant.myposCurrency || 'EUR').toUpperCase(),
    };
  }

  private getFrontendBaseUrl(): string {
    return (process.env.FRONTEND_URL || 'http://localhost:3001').replace(
      /\/+$/,
      '',
    );
  }

  private buildPublicMenuReturnUrl(
    session: { restaurantId: string; table?: { name?: string | null } | null },
    outcome: string,
  ): string {
    const url = new URL(
      `${this.getFrontendBaseUrl()}/menu/public/${session.restaurantId}`,
    );
    if (session.table?.name) url.searchParams.set('table', session.table.name);
    url.searchParams.set('payment', outcome);
    return url.toString();
  }

  private createEpayInvoice(): string {
    const suffix = Math.floor(Math.random() * 1_000_000)
      .toString()
      .padStart(6, '0');
    return `${Date.now()}${suffix}`;
  }

  private getEpayExpirationDate(): Date {
    const minutes = Math.max(
      5,
      Math.min(24 * 60, Number(process.env.EPAY_EXPIRATION_MINUTES || 30)),
    );
    return new Date(Date.now() + minutes * 60 * 1000);
  }

  private mergeProviderPayload(payload: unknown, patch: Record<string, unknown>) {
    const base =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {};
    return { ...base, ...patch };
  }

  private async recordProviderEvent(
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

  private async lockOpenSessionForSettlement(
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

  private async lockPendingCashPaymentRequest(
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

  private resolveBoricaCardholder(
    orders: Array<{ customerName?: string | null; customerPhone?: string | null }>,
    input?: BoricaCardholderInput,
  ): BoricaCardholderInfo {
    const fallbackOrder = orders.find((order) => order.customerName?.trim());
    const cardholderName =
      (input?.cardholderName?.trim() || fallbackOrder?.customerName?.trim() || '').slice(0, 45);
    const email = (input?.email ?? '').trim();
    const phone = (input?.phone?.trim() || fallbackOrder?.customerPhone?.trim() || '').slice(0, 32);
    const billingAddress = (input?.billingAddress ?? '').trim().slice(0, 50);

    if (!cardholderName || !email || !billingAddress) {
      throw new BadRequestException(
        'BORICA requires cardholder name, email, and billing address',
      );
    }

    if (!/^[A-Za-z0-9 .,'-]{1,45}$/.test(cardholderName)) {
      throw new BadRequestException(
        'BORICA cardholder name must use Latin letters',
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('BORICA cardholder email is invalid');
    }

    return {
      cardholderName,
      email,
      phone,
      billingAddress,
    };
  }

  private async markBoricaStatusUnknown(
    paymentId: string,
    reason: string,
    details?: Record<string, unknown>,
  ): Promise<never> {
    this.logger.warn(reason, { paymentId, ...(details ?? {}) });
    await this.prisma.payment.updateMany({
      where: { id: paymentId, status: 'PENDING' },
      data: { providerStatus: 'STATUS_UNKNOWN' },
    });
    throw new ServiceUnavailableException('BORICA_STATUS_UNKNOWN');
  }

  private isBoricaNonFinalStatus(result: { rc?: string | null }): boolean {
    return ['-17', '-25', '-31'].includes((result.rc ?? '').trim());
  }

  async getSessionBill(token: string): Promise<{
    sessionId: string;
    tableId: string;
    tableName: string | null;
    orders: any[];
    subtotal: number;
    paidSubtotal: number;
    remaining: number;
    splitItemsAvailable: boolean;
    restaurantId: string;
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
            menuItem: { select: { name: true, price: true } },
          },
        },
        staff: { select: { name: true, email: true, role: true } },
      },
    });

    const subtotal = orders.reduce((sum: number, o: any) => sum + o.totalPrice, 0);
    const balance = await this.computeSessionBalance(this.prisma, session.id);
    const pendingPayment = await this.getPendingBillPayment(session.id);

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
          name: oi.menuItem?.name ?? 'Unknown item',
          quantity: oi.quantity,
          paidQuantity: oi.paidQuantity ?? 0,
          unitPrice:
            typeof oi.unitPrice === 'number' && oi.unitPrice > 0
              ? oi.unitPrice
              : oi.menuItem?.price ?? 0,
          unitPriceWithOptions:
            typeof oi.unitPriceWithOptions === 'number' &&
            oi.unitPriceWithOptions > 0
              ? oi.unitPriceWithOptions
              : this.roundMoney((oi.menuItem?.price ?? 0) + optionsTotal),
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
      tipsEnabled: session.restaurant.tipsEnabled,
      tipOptions: session.restaurant.tipOptions,
      paymentProviders: [
        ...(this.isStripeConfigured(session.restaurant) ? ['STRIPE' as const] : []),
        ...(this.isEpayConfigured(session.restaurant) ? ['EPAY' as const] : []),
        ...(this.isBoricaConfigured(session.restaurant) ? ['BORICA' as const] : []),
        ...(this.isMyposConfigured(session.restaurant) ? ['MYPOS' as const] : []),
      ],
      pendingPayment,
    };
  }

  async createCashPaymentRequest(
    token: string,
    restaurantId: string,
    scopeInput?: CheckoutScopeInput,
  ): Promise<CashPaymentRequestDto> {
    const session = await this.prisma.tableSession.findFirst({
      where: { token, restaurantId, status: 'OPEN' },
      include: {
        restaurant: { select: { tier: true, forceTier: true } },
        table: { select: { name: true } },
      },
    });
    if (!session) throw new NotFoundException('Session not found');

    if (
      !this.featureService.restaurantHasFeature(
        session.restaurant,
        FeatureFlag.ORDERS_CALL_WAITER,
      )
    ) {
      throw new ForbiddenException({
        code: 'FEATURE_LOCKED',
        message: 'Cash collection requests are not available on this plan',
      });
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await this.lockOpenSessionForSettlement(tx, session.id);

      const normalizedScope = this.normalizeCheckoutScope(scopeInput);
      const charge = await this.resolveCheckoutCharge(
        tx,
        session,
        0,
        0,
        normalizedScope ?? undefined,
      );
      const scope = normalizedScope
        ? CashPaymentRequestScope.ORDER_ITEMS
        : CashPaymentRequestScope.FULL_TABLE;
      const orderIds = normalizedScope?.orderIds ?? [];
      const scopeKey = this.getCashPaymentRequestScopeKey(scope, orderIds);
      const billScope =
        scope === CashPaymentRequestScope.ORDER_ITEMS
          ? ({ kind: 'ORDER_ITEMS', orderIds } as BillPaymentScope)
          : ({ kind: 'FULL_TABLE' } as BillPaymentScope);

      const existing = await tx.cashPaymentRequest.findFirst({
        where: {
          tableSessionId: session.id,
          status: CashPaymentRequestStatus.PENDING,
          scopeKey,
        },
        include: { table: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      });

      await this.assertNoPendingBillScopeConflict(tx, session.id, billScope, {
        ignoreCashRequestIds: existing ? [existing.id] : [],
      });

      if (existing) {
        const request = await tx.cashPaymentRequest.update({
          where: { id: existing.id },
          data: {
            requestedAmount: charge.subtotal,
            orderIds,
            scope,
          },
          include: { table: { select: { name: true } } },
        });
        return {
          eventName: 'cashPaymentRequest:updated' as const,
          request,
        };
      }

      const request = await tx.cashPaymentRequest.create({
        data: {
          restaurantId,
          tableSessionId: session.id,
          tableId: session.tableId,
          scope,
          scopeKey,
          orderIds,
          requestedAmount: charge.subtotal,
          currency: 'EUR',
        },
        include: { table: { select: { name: true } } },
      });
      return {
        eventName: 'cashPaymentRequest:created' as const,
        request,
      };
    });

    this.emitCashPaymentRequestEvent(result.eventName, result.request);
    return this.formatCashPaymentRequest(result.request);
  }

  async listCashPaymentRequests(
    restaurantId: string,
    userId: string,
    status?: string,
  ): Promise<CashPaymentRequestDto[]> {
    await this.verifyRestaurantStaffAccess(restaurantId, userId);

    const normalizedStatus = status?.trim().toUpperCase();
    const whereStatus =
      normalizedStatus && normalizedStatus !== 'ALL'
        ? (normalizedStatus as CashPaymentRequestStatus)
        : undefined;
    if (
      whereStatus &&
      !Object.values(CashPaymentRequestStatus).includes(whereStatus)
    ) {
      throw new BadRequestException('Unknown cash payment request status');
    }

    const requests = await this.prisma.cashPaymentRequest.findMany({
      where: {
        restaurantId,
        ...(whereStatus ? { status: whereStatus } : {}),
      },
      include: { table: { select: { name: true } } },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 100,
    });

    return requests.map((request) => this.formatCashPaymentRequest(request));
  }

  async confirmCashPaymentRequest(
    requestId: string,
    userId: string,
  ): Promise<CashPaymentRequestDto> {
    const existing = await this.prisma.cashPaymentRequest.findUnique({
      where: { id: requestId },
      select: {
        id: true,
        restaurantId: true,
        tableSessionId: true,
        status: true,
        tableSession: { select: { token: true } },
      },
    });
    if (!existing) throw new NotFoundException('Cash payment request not found');
    await this.verifyCashPaymentOperatorAccess(existing.restaurantId, userId);
    if (existing.status !== CashPaymentRequestStatus.PENDING) {
      throw new ConflictException('Cash payment request is already handled');
    }

    await this.abandonCheckoutOrThrowIfPending(
      existing.tableSession.token,
      existing.tableSessionId,
    );

    const result = await this.prisma.$transaction(async (tx) => {
      await this.lockPendingCashPaymentRequest(tx, requestId);
      const request = await tx.cashPaymentRequest.findUnique({
        where: { id: requestId },
        include: {
          table: { select: { name: true } },
          tableSession: true,
        },
      });
      if (!request) throw new NotFoundException('Cash payment request not found');
      if (request.status !== CashPaymentRequestStatus.PENDING) {
        throw new ConflictException('Cash payment request is already handled');
      }

      const session = await tx.tableSession.findFirst({
        where: { id: request.tableSessionId, status: 'OPEN' },
      });
      if (!session) throw new ConflictException('Session is no longer open');
      await this.lockOpenSessionForSettlement(tx, session.id);

      const pendingPayment = await tx.payment.findFirst({
        where: { tableSessionId: session.id, status: 'PENDING' },
        select: { id: true },
      });
      if (pendingPayment) {
        throw new ConflictException(
          'A payment for this session is still being processed. Please wait or retry.',
        );
      }

      let chargeSubtotal: number;
      let checkoutScope: CheckoutScope | null = null;
      if (request.scope === CashPaymentRequestScope.ORDER_ITEMS) {
        const charge = await this.resolveCheckoutCharge(tx, session, 0, 0, {
          orderIds: request.orderIds,
        });
        chargeSubtotal = charge.subtotal;
        checkoutScope = charge.checkoutScope;
      } else {
        const balance = await this.computeSessionBalance(tx, session.id);
        if (balance.remaining <= 0) {
          throw new ConflictException('This session has already been paid');
        }
        chargeSubtotal = balance.remaining;
      }

      const payment = await tx.payment.create({
        data: {
          tableSessionId: session.id,
          restaurantId: request.restaurantId,
          amount: chargeSubtotal,
          tipAmount: 0,
          platformFeeAmount: 0,
          currency: 'eur',
          status: 'SUCCEEDED',
          provider: PaymentProvider.CASH,
          splitMode: checkoutScope ? SplitMode.ITEM : undefined,
          providerPayload: {
            cashPaymentRequestId: request.id,
            cashPaymentScope: request.scope,
          } as Prisma.InputJsonValue,
        },
      });

      if (checkoutScope) {
        for (const allocation of checkoutScope.allocations) {
          const updated = await tx.orderItem.updateMany({
            where: {
              id: allocation.orderItemId,
              paidQuantity: allocation.snapshotPaid,
            },
            data: { paidQuantity: { increment: allocation.quantity } },
          });
          if (updated.count === 0) {
            throw new ConflictException(
              'Items changed during settlement - please retry',
            );
          }
        }
        await tx.paymentAllocation.createMany({
          data: checkoutScope.allocations.map((allocation) => ({
            paymentId: payment.id,
            orderItemId: allocation.orderItemId,
            quantity: allocation.quantity,
            amount: allocation.amount,
          })),
        });
      }

      const balanceAfter = await this.computeSessionBalance(tx, session.id);
      let sessionPaid = false;
      if (balanceAfter.remaining <= 0.01) {
        const flip = await tx.tableSession.updateMany({
          where: { id: session.id, status: 'OPEN' },
          data: { status: 'PAID', paidAt: new Date() },
        });
        sessionPaid = flip.count > 0;
      }

      const updatedRequest = await tx.cashPaymentRequest.update({
        where: { id: request.id },
        data: {
          status: CashPaymentRequestStatus.PAID,
          requestedAmount: chargeSubtotal,
          paymentId: payment.id,
          resolvedById: userId,
          resolvedAt: new Date(),
        },
        include: { table: { select: { name: true } } },
      });

      return {
        request: updatedRequest,
        tableId: session.tableId,
        sessionId: session.id,
        paymentId: payment.id,
        amount: chargeSubtotal,
        remaining: Math.max(0, balanceAfter.remaining),
        sessionPaid,
        splitMode: checkoutScope ? SplitMode.ITEM : null,
      };
    });

    this.emitCashPaymentRequestEvent(
      'cashPaymentRequest:updated',
      result.request,
    );
    this.events.emitTableStatusChanged(
      result.request.restaurantId,
      result.tableId,
      result.sessionId,
    );
    this.events.emitToRestaurant(result.request.restaurantId, 'bill:updated', {
      tableSessionId: result.sessionId,
      tableId: result.tableId,
      paymentId: result.paymentId,
      splitMode: result.splitMode,
      remaining: result.remaining,
      sessionPaid: result.sessionPaid,
    });
    this.events.emitToTableSession(result.sessionId, 'bill:updated', {
      tableSessionId: result.sessionId,
      tableId: result.tableId,
      paymentId: result.paymentId,
      splitMode: result.splitMode,
      remaining: result.remaining,
      sessionPaid: result.sessionPaid,
    });
    if (result.sessionPaid) {
      await this.emitPaymentConfirmed({
        id: result.paymentId,
        tableSessionId: result.sessionId,
        amount: result.amount,
        tipAmount: 0,
      });
    }

    return this.formatCashPaymentRequest(result.request);
  }

  async cancelCashPaymentRequest(
    requestId: string,
    userId: string,
  ): Promise<CashPaymentRequestDto> {
    const existing = await this.prisma.cashPaymentRequest.findUnique({
      where: { id: requestId },
      select: { restaurantId: true, status: true },
    });
    if (!existing) throw new NotFoundException('Cash payment request not found');
    await this.verifyCashPaymentOperatorAccess(existing.restaurantId, userId);
    if (existing.status !== CashPaymentRequestStatus.PENDING) {
      throw new ConflictException('Cash payment request is already handled');
    }

    const request = await this.prisma.cashPaymentRequest.update({
      where: { id: requestId },
      data: {
        status: CashPaymentRequestStatus.CANCELLED,
        resolvedById: userId,
        resolvedAt: new Date(),
      },
      include: { table: { select: { name: true } } },
    });
    this.emitCashPaymentRequestEvent('cashPaymentRequest:updated', request);
    return this.formatCashPaymentRequest(request);
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
        this.emitBillPaymentCleared(
          session.id,
          paymentId,
          'ONLINE_PAYMENT',
        );
      }
    }
  }

  private async abandonCheckoutOrThrowIfPending(
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

  async createCheckout(
    token: string,
    provider: CheckoutProvider,
    tipPercent: number,
    boricaCardholder?: BoricaCardholderInput,
    checkoutScope?: CheckoutScopeInput,
  ) {
    if (provider === 'STRIPE') {
      const stripeCheckout = await this.createPaymentIntent(
        token,
        tipPercent,
        checkoutScope,
      );
      return { provider: 'STRIPE', ...stripeCheckout };
    }

    if (provider === 'EPAY') {
      return this.createEpayCheckout(token, tipPercent, checkoutScope);
    }

    if (provider === 'BORICA') {
      return this.createBoricaCheckout(
        token,
        tipPercent,
        boricaCardholder,
        checkoutScope,
      );
    }

    if (provider === 'MYPOS') {
      return this.createMyposCheckout(token, tipPercent, checkoutScope);
    }

    throw new BadRequestException('Unsupported payment provider');
  }

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

    const normalizedTipPercent = this.normalizeTipPercent(tipPercent);

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
    } = await this.resolveCheckoutCharge(
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
    const stripeCheckoutKey = this.buildStripeCheckoutKey(
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
        this.paymentScopeMatches(p, resolvedCheckoutScope) &&
        (!p.providerReference || p.providerReference === stripeCheckoutKey) &&
        Math.abs((p.amount ?? 0) - total) < 0.001,
    );
    const ignoredPendingPaymentIds: string[] = [];
    if (matchingIntent?.stripePaymentIntentId) {
      const existing = await this.stripe.retrievePaymentIntent(
        matchingIntent.stripePaymentIntentId,
      );
      if (existing?.clientSecret) {
        this.emitPendingBillPayment(
          this.formatPendingPayment({
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
      this.emitBillPaymentCleared(
        session.id,
        matchingIntent.id,
        'ONLINE_PAYMENT',
      );
      ignoredPendingPaymentIds.push(matchingIntent.id);
    }

    let payment: { id: string };
    try {
      payment = await this.createPendingPaymentAfterScopeGuard(
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
          providerPayload: this.checkoutScopePayload(resolvedCheckoutScope) as any,
          splitMode: resolvedCheckoutScope ? SplitMode.ITEM : undefined,
        },
        { ignorePaymentIds: ignoredPendingPaymentIds },
      );
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) throw error;
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

      this.emitPendingBillPayment(
        this.formatPendingPayment({
          id: payment.id,
          tableSessionId: session.id,
          provider: 'STRIPE',
          providerPayload: this.checkoutScopePayload(resolvedCheckoutScope),
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

  private async createEpayCheckout(
    token: string,
    tipPercent: number,
    checkoutScope?: CheckoutScopeInput,
  ) {
    const normalizedTipPercent = this.normalizeTipPercent(tipPercent);
    const session = await this.prisma.tableSession.findFirst({
      where: { token, status: 'OPEN' },
      include: {
        restaurant: true,
        table: { select: { name: true } },
      },
    });

    if (!session) throw new NotFoundException('Session not found');

    const { restaurant } = session;
    if (!restaurant.paymentsEnabled) {
      throw new ForbiddenException(
        'Payments are not enabled for this restaurant',
      );
    }

    if (!this.isEpayConfigured(restaurant)) {
      throw new BadRequestException('ePay.bg is not configured');
    }

    // Charge the REMAINING balance (POS partials may have settled some already).
    const {
      tipAmount,
      total,
      platformFeeAmount,
      checkoutScope: resolvedCheckoutScope,
    } = await this.resolveCheckoutCharge(
      this.prisma,
      session,
      normalizedTipPercent,
      restaurant.platformFeePercent ?? 0,
      checkoutScope,
    );

    const existingPayments = await this.prisma.payment.findMany({
      where: {
        tableSessionId: session.id,
        status: { in: ['PENDING'] },
      },
    });
    const candidateBillScope = this.billScopeFromCheckoutScope(
      resolvedCheckoutScope,
    );
    const ignoredPendingPaymentIds: string[] = [];

    const pendingEpay = existingPayments.find(
      (p) =>
        p.provider === 'EPAY' &&
        p.status === 'PENDING' &&
        this.paymentBillScopeEquals(p, candidateBillScope),
    );
    if (pendingEpay) {
      const checkoutForm = (pendingEpay.providerPayload as any)?.checkoutForm;
      const storedExpiry: string | undefined =
        (pendingEpay.providerPayload as any)?.expiresAt;
      const notExpired = storedExpiry ? new Date(storedExpiry) > new Date() : false;
      const sameAmount =
        Math.abs((pendingEpay.amount ?? 0) - total) < 0.001 &&
        Math.abs((pendingEpay.tipAmount ?? 0) - tipAmount) < 0.001;
      const sameScope = this.paymentScopeMatches(
        pendingEpay,
        resolvedCheckoutScope,
      );

      if (checkoutForm && sameAmount && sameScope && notExpired) {
        this.emitPendingBillPayment(
          this.formatPendingPayment({
            ...pendingEpay,
            tableSessionId: session.id,
          }),
        );
        return {
          provider: 'EPAY' as const,
          paymentId: pendingEpay.id,
          total: pendingEpay.amount,
          tipAmount: pendingEpay.tipAmount,
          action: checkoutForm.action,
          method: checkoutForm.method,
          fields: checkoutForm.fields,
        };
      }

      if (!notExpired) {
        // Invoice EXP_TIME has passed — mark stale record FAILED and create a fresh checkout.
        await this.prisma.payment.updateMany({
          where: { id: pendingEpay.id, status: 'PENDING' },
          data: { status: 'FAILED', providerStatus: 'EXPIRED' },
        });
        this.emitBillPaymentCleared(
          session.id,
          pendingEpay.id,
          'ONLINE_PAYMENT',
        );
        ignoredPendingPaymentIds.push(pendingEpay.id);
      } else {
        throw new ConflictException(
          'Another payment for this bill is already pending. Please wait for it to finish or cancel it before starting a new one.',
        );
      }
    }

    const secret = decryptSecret(restaurant.epaySecretEncrypted!);
    const expiresAt = this.getEpayExpirationDate();
    const invoice = this.createEpayInvoice();

    const payment = await this.createPendingPaymentAfterScopeGuard(
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
        provider: 'EPAY',
        providerReference: invoice,
        providerStatus: 'PENDING',
        providerPayload: this.checkoutScopePayload(resolvedCheckoutScope) as any,
        splitMode: resolvedCheckoutScope ? SplitMode.ITEM : undefined,
      },
      { ignorePaymentIds: ignoredPendingPaymentIds },
    );

    const checkoutForm = this.epay.createCheckoutForm({
      mode: restaurant.epayMode === 'LIVE' ? 'LIVE' : 'DEMO',
      page: (restaurant.epayPage || 'credit_paydirect') as EpayPage,
      min: restaurant.epayClientId!,
      email: restaurant.epayMerchantEmail!,
      secret,
      invoice,
      amount: total,
      currency: 'EUR',
      expiresAt,
      description: `QR Menu bill ${session.table?.name ?? ''}`.trim(),
      urlOk: this.buildPublicMenuReturnUrl(session, 'epay-ok'),
      urlCancel: this.buildPublicMenuReturnUrl(session, 'epay-cancel'),
      lang: 'bg',
    });

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        providerPayload: this.mergeProviderPayload(
          this.checkoutScopePayload(resolvedCheckoutScope),
          {
            checkoutForm,
            expiresAt: expiresAt.toISOString(),
          },
        ) as any,
      },
    });

    this.emitPendingBillPayment(
      this.formatPendingPayment({
        id: payment.id,
        tableSessionId: session.id,
        provider: 'EPAY',
        providerPayload: this.checkoutScopePayload(resolvedCheckoutScope),
        amount: total,
        createdAt: new Date(),
      }),
    );

    return {
      provider: 'EPAY' as const,
      paymentId: payment.id,
      total,
      tipAmount,
      action: checkoutForm.action,
      method: checkoutForm.method,
      fields: checkoutForm.fields,
    };
  }

  private async createMyposCheckout(
    token: string,
    tipPercent: number,
    checkoutScope?: CheckoutScopeInput,
  ) {
    const normalizedTipPercent = this.normalizeTipPercent(tipPercent);
    const session = await this.prisma.tableSession.findFirst({
      where: { token, status: 'OPEN' },
      include: {
        restaurant: true,
        table: { select: { name: true } },
      },
    });

    if (!session) throw new NotFoundException('Session not found');

    const { restaurant } = session;
    if (!restaurant.paymentsEnabled) {
      throw new ForbiddenException(
        'Payments are not enabled for this restaurant',
      );
    }

    if (!this.isMyposConfigured(restaurant)) {
      throw new BadRequestException('myPOS is not configured');
    }

    const {
      tipAmount,
      total,
      platformFeeAmount,
      checkoutScope: resolvedCheckoutScope,
    } = await this.resolveCheckoutCharge(
      this.prisma,
      session,
      normalizedTipPercent,
      restaurant.platformFeePercent ?? 0,
      checkoutScope,
    );

    const existingPayments = await this.prisma.payment.findMany({
      where: {
        tableSessionId: session.id,
        status: { in: ['PENDING'] },
      },
    });
    const candidateBillScope = this.billScopeFromCheckoutScope(
      resolvedCheckoutScope,
    );
    const ignoredPendingPaymentIds: string[] = [];

    const MYPOS_PENDING_TTL_MS = 15 * 60 * 1000;
    const pendingMypos = existingPayments.find(
      (p) =>
        p.provider === 'MYPOS' &&
        p.status === 'PENDING' &&
        this.paymentBillScopeEquals(p, candidateBillScope),
    );
    if (pendingMypos) {
      const age =
        Date.now() - new Date((pendingMypos as any).createdAt ?? 0).getTime();
      const checkoutForm = (pendingMypos.providerPayload as any)?.checkoutForm;
      const sameAmount =
        Math.abs((pendingMypos.amount ?? 0) - total) < 0.001 &&
        Math.abs((pendingMypos.tipAmount ?? 0) - tipAmount) < 0.001;
      const sameScope = this.paymentScopeMatches(
        pendingMypos,
        resolvedCheckoutScope,
      );
      if (checkoutForm && sameAmount && sameScope && age < MYPOS_PENDING_TTL_MS) {
        this.emitPendingBillPayment(
          this.formatPendingPayment({
            ...pendingMypos,
            tableSessionId: session.id,
          }),
        );
        return {
          provider: 'MYPOS' as const,
          paymentId: pendingMypos.id,
          total: pendingMypos.amount,
          tipAmount: pendingMypos.tipAmount,
          action: checkoutForm.action,
          method: checkoutForm.method,
          fields: checkoutForm.fields,
        };
      }

      if (!checkoutForm || age >= MYPOS_PENDING_TTL_MS) {
        await this.prisma.payment.updateMany({
          where: { id: pendingMypos.id, status: 'PENDING' },
          data: { status: 'FAILED', providerStatus: 'EXPIRED' },
        });
        this.emitBillPaymentCleared(
          session.id,
          pendingMypos.id,
          'ONLINE_PAYMENT',
        );
        ignoredPendingPaymentIds.push(pendingMypos.id);
      } else {
        throw new ConflictException(
          'Another payment for this bill is already pending. Please wait for it to finish or cancel it before starting a new one.',
        );
      }
    }

    const backendBase = (process.env.BACKEND_URL || '').replace(/\/+$/, '');
    const isLiveMypos = restaurant.myposMode === 'LIVE';
    const backendIsHttps = /^https:\/\//i.test(backendBase);
    const backendIsLocalHttp =
      /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(backendBase);
    if (
      !backendBase ||
      (!backendIsHttps && !(backendIsLocalHttp && !isLiveMypos))
    ) {
      throw new BadRequestException(
        'myPOS is not configured correctly: BACKEND_URL must be an absolute HTTPS URL',
      );
    }
    if (isLiveMypos) {
      try {
        const parsed = new URL(backendBase);
        if (parsed.port) {
          throw new Error('port not allowed');
        }
      } catch {
        throw new BadRequestException(
          'myPOS is not configured correctly: URL_Notify must be HTTPS and must not include a port',
        );
      }
    }

    const config = this.resolveMyposConfig(restaurant);
    const currency = 'EUR';
    const tableName = session.table?.name ?? '';
    const description = `QR Menu bill ${tableName}`.trim() || 'QR Menu bill';
    const notifyUrl = `${backendBase}/api/v1/payments/mypos/notify`;
    const orderPrefix = 'MP';
    let checkoutForm: ReturnType<MyposProvider['createCheckoutForm']> | null =
      null;
    let payment: Awaited<ReturnType<typeof this.prisma.payment.create>> | null =
      null;
    const MAX_ORDER_RETRIES = 5;

    for (let attempt = 0; attempt <= MAX_ORDER_RETRIES; attempt++) {
      const orderId = `${orderPrefix}${this.createEpayInvoice()}`;
      try {
        checkoutForm = this.mypos.createCheckoutForm({
          mode: config.mode,
          clientNumber: config.clientNumber,
          storeId: config.storeId,
          keyIndex: config.keyIndex,
          privateKeyPem: config.privateKeyPem,
          orderId,
          amount: total,
          currency,
          description,
          urlOk: this.buildPublicMenuReturnUrl(session, 'mypos-ok'),
          urlCancel: this.buildPublicMenuReturnUrl(session, 'mypos-cancel'),
          urlNotify: notifyUrl,
          language: 'BG',
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        throw new BadRequestException(
          `myPOS is not configured correctly: ${message}`,
        );
      }

      try {
        payment = await this.createPendingPaymentAfterScopeGuard(
          session.id,
          resolvedCheckoutScope,
          {
            tableSessionId: session.id,
            restaurantId: session.restaurantId,
            amount: total,
            tipAmount,
            platformFeeAmount,
            currency: currency.toLowerCase(),
            status: 'PENDING',
            provider: 'MYPOS',
            providerReference: orderId,
            providerStatus: 'PENDING',
            providerPayload: this.mergeProviderPayload(
              this.checkoutScopePayload(resolvedCheckoutScope),
              {
                checkoutForm,
                sessionToken: token,
                restaurantId: session.restaurantId,
                tableName: session.table?.name ?? null,
                notifyUrl,
                mode: config.mode,
              },
            ) as any,
            splitMode: resolvedCheckoutScope ? SplitMode.ITEM : undefined,
          },
          { ignorePaymentIds: ignoredPendingPaymentIds },
        );
        break;
      } catch (err: unknown) {
        if (attempt < MAX_ORDER_RETRIES && (err as any)?.code === 'P2002') {
          this.logger.warn(
            `myPOS OrderID collision on attempt ${attempt + 1}, retrying`,
          );
          continue;
        }
        throw err;
      }
    }

    this.emitPendingBillPayment(
      this.formatPendingPayment({
        id: payment!.id,
        tableSessionId: session.id,
        provider: 'MYPOS',
        providerPayload: this.checkoutScopePayload(resolvedCheckoutScope),
        amount: total,
        createdAt: new Date(),
      }),
    );

    return {
      provider: 'MYPOS' as const,
      paymentId: payment!.id,
      total,
      tipAmount,
      action: checkoutForm!.action,
      method: checkoutForm!.method,
      fields: checkoutForm!.fields,
    };
  }

  private async createBoricaCheckout(
    token: string,
    tipPercent: number,
    cardholderInput?: BoricaCardholderInput,
    checkoutScope?: CheckoutScopeInput,
  ) {
    const normalizedTipPercent = this.normalizeTipPercent(tipPercent);
    const session = await this.prisma.tableSession.findFirst({
      where: { token, status: 'OPEN' },
      include: {
        restaurant: true,
        table: { select: { name: true } },
      },
    });

    if (!session) throw new NotFoundException('Session not found');

    const { restaurant } = session;
    if (!restaurant.paymentsEnabled) {
      throw new ForbiddenException(
        'Payments are not enabled for this restaurant',
      );
    }

    if (!this.isBoricaConfigured(restaurant)) {
      throw new BadRequestException('BORICA is not configured');
    }

    const orders = await this.prisma.order.findMany({
      where: { tableSessionId: session.id },
    });
    const {
      tipAmount,
      total,
      platformFeeAmount,
      checkoutScope: resolvedCheckoutScope,
    } = await this.resolveCheckoutCharge(
      this.prisma,
      session,
      normalizedTipPercent,
      restaurant.platformFeePercent ?? 0,
      checkoutScope,
    );

    const existingPayments = await this.prisma.payment.findMany({
      where: {
        tableSessionId: session.id,
        status: { in: ['PENDING'] },
      },
    });
    const candidateBillScope = this.billScopeFromCheckoutScope(
      resolvedCheckoutScope,
    );
    const ignoredPendingPaymentIds: string[] = [];

    // #10 — BACKEND_URL must be absolute. LIVE requires HTTPS; http://localhost allowed for DEMO only.
    const backendBase = (process.env.BACKEND_URL || '').replace(/\/+$/, '');
    const isLiveBorica = restaurant.boricaMode === 'LIVE';
    const backendIsHttps = /^https:\/\//i.test(backendBase);
    const backendIsLocalHttp = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(backendBase);
    if (!backendBase || (!backendIsHttps && !(backendIsLocalHttp && !isLiveBorica))) {
      throw new BadRequestException(
        'BORICA is not configured correctly: BACKEND_URL must be an absolute HTTPS URL',
      );
    }
    const callbackUrl = `${backendBase}/api/v1/payments/borica/callback`;

    // #7 — Stale pending TTL: reuse only if same amount AND created within the last 15 min.
    const BORICA_PENDING_TTL_MS = 15 * 60 * 1000;
    const pendingBorica = existingPayments.find(
      (p) =>
        p.provider === 'BORICA' &&
        p.status === 'PENDING' &&
        this.paymentBillScopeEquals(p, candidateBillScope),
    );
    if (pendingBorica) {
      const age = Date.now() - new Date((pendingBorica as any).createdAt ?? 0).getTime();
      const checkoutForm = (pendingBorica.providerPayload as any)?.checkoutForm;
      const sameAmount =
        Math.abs((pendingBorica.amount ?? 0) - total) < 0.001 &&
        Math.abs((pendingBorica.tipAmount ?? 0) - tipAmount) < 0.001;
      const sameScope = this.paymentScopeMatches(
        pendingBorica,
        resolvedCheckoutScope,
      );
      if (checkoutForm && sameAmount && sameScope && age < BORICA_PENDING_TTL_MS) {
        this.emitPendingBillPayment(
          this.formatPendingPayment({
            ...pendingBorica,
            tableSessionId: session.id,
          }),
        );
        return {
          provider: 'BORICA' as const,
          paymentId: pendingBorica.id,
          total: pendingBorica.amount,
          tipAmount: pendingBorica.tipAmount,
          action: checkoutForm.action,
          method: checkoutForm.method,
          fields: checkoutForm.fields,
        };
      }
      // Stale or amount changed — check BORICA via TRTYPE=90 before expiring.
      if (pendingBorica.providerReference) {
        try {
          const staleKeypair = this.resolveBoricaKeypair(restaurant);
          const statusResult = await this.borica.queryTransactionStatus(
            {
              terminal: staleKeypair.terminal,
              order: pendingBorica.providerReference,
              privateKeyPem: staleKeypair.privateKeyPem,
              certPem: staleKeypair.certPem,
            },
            restaurant.boricaMode === 'LIVE' ? 'LIVE' : 'DEMO',
          );
          if (statusResult === null) {
            await this.markBoricaStatusUnknown(
              pendingBorica.id,
              'BORICA TRTYPE=90 returned unknown status',
            );
          }
          const checkedStatus = statusResult as NonNullable<typeof statusResult>;
          if (!checkedStatus.verified) {
            await this.markBoricaStatusUnknown(
              pendingBorica.id,
              'BORICA TRTYPE=90 response signature could not be verified',
            );
          }
          if (checkedStatus.verified && checkedStatus.rc === '00' && checkedStatus.action === '0') {
            const reconcileOk =
              checkedStatus.order === pendingBorica.providerReference &&
              checkedStatus.terminal === staleKeypair.terminal &&
              Math.abs(parseFloat(checkedStatus.amount || '0') - (pendingBorica.amount ?? 0)) < 0.01 &&
              (checkedStatus.currency || 'EUR').toUpperCase() === 'EUR';
            if (!reconcileOk) {
              await this.markBoricaStatusUnknown(
                pendingBorica.id,
                'BORICA TRTYPE=90 recovery: reconciliation mismatch',
                {
                  statusOrder: checkedStatus.order,
                  expectedOrder: pendingBorica.providerReference,
                  statusTerminal: checkedStatus.terminal,
                  expectedTerminal: staleKeypair.terminal,
                  statusAmount: checkedStatus.amount,
                  statusCurrency: checkedStatus.currency,
                },
              );
            } else {
              const claim = await this.prisma.$transaction((tx) =>
                this.claimSuccessfulPayment(tx, pendingBorica, {
                  status: 'SUCCEEDED',
                  providerStatus: 'RECOVERED_VIA_STATUS_CHECK',
                }),
              );
              await this.emitPaymentClaimEvents(pendingBorica as any, claim);
              throw new ConflictException('ALREADY_PAID');
            }
          }
          if (this.isBoricaNonFinalStatus(checkedStatus)) {
            await this.markBoricaStatusUnknown(
              pendingBorica.id,
              'BORICA TRTYPE=90 returned non-final status',
              { rc: checkedStatus.rc, action: checkedStatus.action },
            );
          }
        } catch (e: unknown) {
          if ((e as any)?.status === 409 || (e as any)?.status === 503) throw e;
          await this.markBoricaStatusUnknown(
            pendingBorica.id,
            'BORICA TRTYPE=90 status check failed',
          );
        }
      }

      await this.prisma.payment.updateMany({
        where: { id: pendingBorica.id, status: 'PENDING' },
        data: { status: 'FAILED', providerStatus: 'EXPIRED' },
      });
      this.emitBillPaymentCleared(
        session.id,
        pendingBorica.id,
        'ONLINE_PAYMENT',
      );
      ignoredPendingPaymentIds.push(pendingBorica.id);
    }

    const keypair = this.resolveBoricaKeypair(restaurant);
    // #9 — Always charge in EUR; the app totals are EUR and no FX conversion is implemented.
    const currency = 'EUR';
    const tableName = session.table?.name ?? '';
    const rawDesc = `QR Menu bill ${tableName}`.trim();
    // BORICA requires DESC 8–50 chars; pad to 8 if too short.
    const description = rawDesc.length >= 8 ? rawDesc : rawDesc.padEnd(8, ' ');
    const cardholder = this.resolveBoricaCardholder(orders, cardholderInput);

    // #8 — Sign BEFORE creating a DB row so a bad key never leaves an orphan PENDING row.
    // Also validates required fields at the API level before any DB write.
    const order = this.createEpayInvoice().slice(-6).padStart(6, '0');
    let checkoutForm: ReturnType<BoricaProvider['buildSaleForm']>;
    try {
      checkoutForm = this.borica.buildSaleForm({
        mode: restaurant.boricaMode === 'LIVE' ? 'LIVE' : 'DEMO',
        terminal: keypair.terminal,
        merchant: keypair.merchant,
        merchantName: keypair.merchantName,
        email: cardholder.email,
        cardholder,
        order,
        amount: total,
        currency,
        description,
        backref: callbackUrl,
        lang: 'BG',
        privateKeyPem: keypair.privateKeyPem,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new BadRequestException(
        `BORICA is not configured correctly: ${msg}`,
      );
    }

    // #5 — ORDER is a 6-digit string under a global unique index; retry on P2002 collision.
    let payment: Awaited<ReturnType<typeof this.prisma.payment.create>>;
    const MAX_ORDER_RETRIES = 5;
    for (let attempt = 0; attempt <= MAX_ORDER_RETRIES; attempt++) {
      const attemptOrder = attempt === 0
        ? order
        : this.createEpayInvoice().slice(-6).padStart(6, '0');

      // For retries we must rebuild the form with the new ORDER so P_SIGN stays valid.
      let attemptForm = attempt === 0 ? checkoutForm : null as any;
      if (attempt > 0) {
        try {
          attemptForm = this.borica.buildSaleForm({
            mode: restaurant.boricaMode === 'LIVE' ? 'LIVE' : 'DEMO',
            terminal: keypair.terminal,
            merchant: keypair.merchant,
            merchantName: keypair.merchantName,
            email: cardholder.email,
            cardholder,
            order: attemptOrder,
            amount: total,
            currency,
            description,
            backref: callbackUrl,
            lang: 'BG',
            privateKeyPem: keypair.privateKeyPem,
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          throw new BadRequestException(`BORICA signing error on retry: ${msg}`);
        }
      }

      try {
        payment = await this.createPendingPaymentAfterScopeGuard(
          session.id,
          resolvedCheckoutScope,
          {
            tableSessionId: session.id,
            restaurantId: session.restaurantId,
            amount: total,
            tipAmount,
            platformFeeAmount,
            currency: currency.toLowerCase(),
            status: 'PENDING',
            provider: 'BORICA',
            providerReference: attemptOrder,
            providerStatus: 'PENDING',
            providerPayload: this.mergeProviderPayload(
              this.checkoutScopePayload(resolvedCheckoutScope),
              {
                checkoutForm: attemptForm,
                sessionToken: token,
                restaurantId: session.restaurantId,
                tableName: session.table?.name ?? null,
              },
            ) as any,
            splitMode: resolvedCheckoutScope ? SplitMode.ITEM : undefined,
          },
          { ignorePaymentIds: ignoredPendingPaymentIds },
        );
        if (attempt > 0) checkoutForm = attemptForm;
        break;
      } catch (dbErr: unknown) {
        if (attempt < MAX_ORDER_RETRIES && (dbErr as any)?.code === 'P2002') {
          this.logger.warn(`BORICA ORDER collision on attempt ${attempt + 1}, retrying`);
          continue;
        }
        throw dbErr;
      }
    }

    this.emitPendingBillPayment(
      this.formatPendingPayment({
        id: payment!.id,
        tableSessionId: session.id,
        provider: 'BORICA',
        providerPayload: this.checkoutScopePayload(resolvedCheckoutScope),
        amount: total,
        createdAt: new Date(),
      }),
    );

    return {
      provider: 'BORICA' as const,
      paymentId: payment!.id,
      total,
      tipAmount,
      action: checkoutForm.action,
      method: checkoutForm.method,
      fields: checkoutForm.fields,
    };
  }

  async handleBoricaCallback(body: Record<string, string>): Promise<string> {
    const order = body.ORDER ?? body.order ?? '';
    if (!order) {
      return this.buildPublicMenuReturnUrl(
        { restaurantId: '' },
        'borica-cancel',
      );
    }

    const payment = await this.prisma.payment.findFirst({
      where: { providerReference: order, provider: 'BORICA' },
      include: {
        restaurant: {
          select: {
            boricaMode: true,
            boricaPrivateKeyEncrypted: true,
            boricaPublicCert: true,
            boricaTerminalId: true,
            boricaMerchantId: true,
            boricaMerchantName: true,
          },
        },
        tableSession: { include: { table: { select: { name: true } } } },
      },
    });

    if (!payment) {
      return `${this.getFrontendBaseUrl()}/?payment=borica-cancel`;
    }

    const certPem =
      payment.restaurant?.boricaMode === 'LIVE'
        ? payment.restaurant.boricaPublicCert ?? ''
        : process.env.BORICA_TEST_CERT ?? '';

    const result = this.borica.verifyResult(body, certPem);

    const cancelUrl = this.buildPublicMenuReturnUrl(
      { restaurantId: payment.restaurantId, table: payment.tableSession?.table },
      'borica-cancel',
    );

    // #4 — Never mutate payment state for an unverified callback.
    // An invalid signature could be a replay/DoS; leaving the row PENDING is safe.
    if (!result.verified) {
      this.logger.warn('BORICA callback: P_SIGN verification failed', {
        order,
        paymentId: payment.id,
      });
      return cancelUrl;
    }

    // Verified but BORICA reports a decline or cancellation → mark FAILED.
    const boricaEventKey = [
      order,
      result.rc || '',
      result.action || '',
      result.rrn || '',
      result.intRef || '',
      result.approval || '',
    ].join(':');

    if (result.rc !== '00' || result.action !== '0') {
      await this.prisma.$transaction(async (tx) => {
        const recorded = await this.recordProviderEvent(
          tx,
          PaymentProvider.BORICA,
          boricaEventKey,
          {
            paymentId: payment.id,
            restaurantId: payment.restaurantId,
            payload: { order, rc: result.rc, action: result.action },
          },
        );
        if (!recorded) return;

        await tx.payment.updateMany({
          where: { id: payment.id, status: 'PENDING' },
          data: {
            status: 'FAILED',
            providerStatus: result.rc || 'DECLINED',
            providerPayload: this.mergeProviderPayload(payment.providerPayload, {
              callbackBody: body,
              verifiedAt: new Date().toISOString(),
              verified: true,
              rc: result.rc,
              action: result.action,
            }) as any,
          },
        });
      });
      return cancelUrl;
    }

    // #6 — Reconcile callback fields against stored payment before marking PAID.
    // This prevents a replayed or tampered callback from crediting the wrong amount.
    const callbackAmount = parseFloat(body.AMOUNT ?? body.amount ?? '0');
    const callbackCurrency = (body.CURRENCY ?? body.currency ?? '').toUpperCase();
    const callbackTerminal = body.TERMINAL ?? body.terminal ?? '';
    const callbackOrder = body.ORDER ?? body.order ?? '';
    const resolvedTerminal =
      payment.restaurant?.boricaMode === 'LIVE'
        ? (payment.restaurant.boricaTerminalId ?? '')
        : (process.env.BORICA_TEST_TID ?? 'V1800001');
    const amountOk = Math.abs(callbackAmount - (payment.amount ?? 0)) < 0.01;
    const currencyOk = callbackCurrency === (payment.currency ?? 'eur').toUpperCase();
    const terminalOk = callbackTerminal === resolvedTerminal;
    const orderOk = callbackOrder === payment.providerReference;
    if (!amountOk || !currencyOk || !terminalOk || !orderOk) {
      this.logger.warn('BORICA callback: reconciliation mismatch', {
        paymentId: payment.id,
        amountOk,
        currencyOk,
        terminalOk,
        orderOk,
        callbackAmount,
        storedAmount: payment.amount,
        callbackCurrency,
        storedCurrency: payment.currency,
        callbackTerminal,
        resolvedTerminal,
        callbackOrder,
        storedOrder: payment.providerReference,
      });
      return cancelUrl;
    }

    const claim = await this.prisma.$transaction(async (tx) => {
      const recorded = await this.recordProviderEvent(
        tx,
        PaymentProvider.BORICA,
        boricaEventKey,
        {
          paymentId: payment.id,
          restaurantId: payment.restaurantId,
          payload: {
            order,
            rc: result.rc,
            action: result.action,
            rrn: result.rrn || null,
            intRef: result.intRef || null,
          },
        },
      );
      if (!recorded) return { claimed: false, sessionPaid: false };

      return this.claimSuccessfulPayment(tx, payment, {
        status: 'SUCCEEDED',
        providerStatus: 'PAID',
        providerPayload: this.mergeProviderPayload(payment.providerPayload, {
          callbackBody: body,
          verifiedAt: new Date().toISOString(),
          verified: true,
          rc: result.rc,
          action: result.action,
          rrn: result.rrn,
          intRef: result.intRef,
          approval: result.approval,
        }) as any,
      });
    });

    await this.emitPaymentClaimEvents(payment, claim);

    return this.buildPublicMenuReturnUrl(
      {
        restaurantId: payment.restaurantId,
        table: payment.tableSession?.table,
      },
      claim.claimed || payment.status === 'SUCCEEDED'
        ? 'borica-ok'
        : 'borica-cancel',
    );
  }

  async handleEpayNotification(body: {
    ENCODED?: string;
    CHECKSUM?: string;
    encoded?: string;
    checksum?: string;
  }): Promise<string> {
    const encoded = body.ENCODED ?? body.encoded;
    const checksum = body.CHECKSUM ?? body.checksum;
    if (!encoded || !checksum) {
      return 'ERR=missing ENCODED or CHECKSUM';
    }

    let notifications: EpayNotification[];
    try {
      notifications = this.epay.parseNotifications(encoded);
    } catch {
      return 'ERR=invalid ENCODED';
    }
    if (notifications.length === 0) return 'ERR=invalid ENCODED';

    const invoices = notifications.map((notification) => notification.invoice);
    const payments = await this.prisma.payment.findMany({
      where: { providerReference: { in: invoices } },
      include: {
        restaurant: { select: { epaySecretEncrypted: true } },
        tableSession: {
          include: { table: { select: { name: true } } },
        },
      },
    });

    const paymentsByInvoice = new Map(
      payments.map((payment) => [payment.providerReference, payment]),
    );
    const knownPayment = payments[0];
    if (!knownPayment) {
      return this.epay.formatNotificationResponses(
        notifications.map((notification) => ({
          invoice: notification.invoice,
          status: 'NO',
        })),
      );
    }

    if (payments.some((p) => p.restaurantId !== knownPayment.restaurantId)) {
      return 'ERR=mixed merchant notification';
    }

    const encryptedSecret = knownPayment.restaurant?.epaySecretEncrypted;
    if (!encryptedSecret) return 'ERR=missing ePay secret';

    const secret = decryptSecret(encryptedSecret);
    if (!this.epay.verifyChecksum(encoded, checksum, secret)) {
      return 'ERR=invalid CHECKSUM';
    }

    const responses: Array<{ invoice: string; status: 'OK' | 'NO' }> = [];
    for (const notification of notifications) {
      const payment = paymentsByInvoice.get(notification.invoice);
      if (!payment) {
        responses.push({ invoice: notification.invoice, status: 'NO' });
        continue;
      }

      await this.applyEpayNotification(payment, notification);
      responses.push({ invoice: notification.invoice, status: 'OK' });
    }

    return this.epay.formatNotificationResponses(responses);
  }

  async handleMyposNotification(body: Record<string, unknown>): Promise<string> {
    const payload: Record<string, string> = {};
    for (const [key, value] of Object.entries(body ?? {})) {
      payload[key] = Array.isArray(value)
        ? String(value[0] ?? '')
        : String(value ?? '');
    }

    const orderId = payload.OrderID ?? payload.orderid ?? payload.orderId ?? '';
    if (!orderId) return 'ERR=missing OrderID';

    const payment = await this.prisma.payment.findFirst({
      where: { providerReference: orderId, provider: 'MYPOS' },
      include: {
        restaurant: {
          select: {
            myposMode: true,
            myposClientNumber: true,
            myposStoreId: true,
            myposKeyIndex: true,
            myposPrivateKeyEncrypted: true,
            myposPublicCert: true,
            myposCurrency: true,
          },
        },
        tableSession: { include: { table: { select: { name: true } } } },
      },
    });

    if (!payment) return 'ERR=unknown OrderID';

    const config = this.resolveMyposConfig(payment.restaurant);
    const result = this.mypos.verifyNotification(payload, config.publicCertPem);

    if (!result.verified) {
      this.logger.warn('myPOS notify: signature verification failed', {
        orderId,
        paymentId: payment.id,
      });
      return 'ERR=invalid Signature';
    }

    if (result.method && result.method !== 'IPCPurchaseNotify') {
      return 'ERR=invalid IPCmethod';
    }

    const notificationAmount = parseFloat(result.amount || '0');
    const amountOk = Math.abs(notificationAmount - (payment.amount ?? 0)) < 0.01;
    const currencyOk =
      (result.currency || '').toUpperCase() ===
      (payment.currency ?? 'eur').toUpperCase();
    const storeOk = result.storeId === config.storeId;
    const orderOk = result.orderId === payment.providerReference;
    if (!amountOk || !currencyOk || !storeOk || !orderOk) {
      this.logger.warn('myPOS notify: reconciliation mismatch', {
        paymentId: payment.id,
        amountOk,
        currencyOk,
        storeOk,
        orderOk,
        notificationAmount,
        storedAmount: payment.amount,
        notificationCurrency: result.currency,
        storedCurrency: payment.currency,
        notificationStoreId: result.storeId,
        expectedStoreId: config.storeId,
        notificationOrderId: result.orderId,
        storedOrderId: payment.providerReference,
      });
      return 'ERR=reconciliation';
    }

    const providerPayload = this.mergeProviderPayload(payment.providerPayload, {
      notification: payload,
      notifiedAt: new Date().toISOString(),
      transactionRef: result.transactionRef || null,
      requestStan: result.requestStan || null,
      requestDateTime: result.requestDateTime || null,
    });

    const eventKey = [
      orderId,
      result.transactionRef || '',
      result.requestStan || '',
      result.requestDateTime || '',
    ].join(':');

    const claim = await this.prisma.$transaction(async (tx) => {
      const recorded = await this.recordProviderEvent(
        tx,
        PaymentProvider.MYPOS,
        eventKey,
        {
          paymentId: payment.id,
          restaurantId: payment.restaurantId,
          payload: {
            orderId,
            transactionRef: result.transactionRef || null,
            requestStan: result.requestStan || null,
          },
        },
      );
      if (!recorded) return { claimed: false, sessionPaid: false };

      return this.claimSuccessfulPayment(tx, payment, {
        status: 'SUCCEEDED',
        providerStatus: 'PAID',
        providerPayload: providerPayload as any,
      });
    });

    await this.emitPaymentClaimEvents(payment, claim);

    return 'OK';
  }

  private async applyEpayNotification(payment: any, notification: EpayNotification) {
    const eventKey = [
      notification.invoice,
      notification.status,
      notification.stan ?? '',
      notification.bcode ?? '',
    ].join(':');
    const providerPayload = this.mergeProviderPayload(payment.providerPayload, {
      notification,
      notifiedAt: new Date().toISOString(),
    });

    if (notification.status === 'PAID') {
      const claim = await this.prisma.$transaction(async (tx) => {
        const recorded = await this.recordProviderEvent(
          tx,
          PaymentProvider.EPAY,
          eventKey,
          {
            paymentId: payment.id,
            restaurantId: payment.restaurantId,
            payload: { status: notification.status, invoice: notification.invoice },
          },
        );
        if (!recorded) return { claimed: false, sessionPaid: false };

        return this.claimSuccessfulPayment(tx, payment, {
          status: 'SUCCEEDED',
          providerStatus: 'PAID',
          providerPayload: providerPayload as any,
        });
      });

      await this.emitPaymentClaimEvents(payment, claim);
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      const recorded = await this.recordProviderEvent(
        tx,
        PaymentProvider.EPAY,
        eventKey,
        {
          paymentId: payment.id,
          restaurantId: payment.restaurantId,
          payload: { status: notification.status, invoice: notification.invoice },
        },
      );
      if (!recorded) return;

      await tx.payment.updateMany({
        where: { id: payment.id, status: 'PENDING' },
        data: {
          status: 'FAILED',
          providerStatus: notification.status,
          providerPayload: providerPayload as any,
        },
      });
    });
  }

  private async emitPaymentConfirmed(payment: any) {
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

  private async emitPaymentClaimEvents(
    payment: any,
    claim: PaymentClaimResult,
  ) {
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
        const recorded = await this.recordProviderEvent(
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

        return this.claimSuccessfulPayment(tx, payment, {
          status: 'SUCCEEDED',
          stripePaymentIntentId: intent.id,
        });
      });
      await this.emitPaymentClaimEvents(payment, claim);
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
        const recorded = await this.recordProviderEvent(
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
  }

  async closeSession(
    token: string,
    restaurantId: string,
    userId: string,
  ): Promise<void> {
    await this.verifyPosOperatorAccess(restaurantId, userId);
    const session = await this.prisma.tableSession.findFirst({
      where: { token, restaurantId, status: 'OPEN' },
    });
    if (!session) throw new NotFoundException('Session not found');

    // Cancel any pending online payments before closing the session.
    // Without this, a customer who started a Stripe checkout while the waiter
    // force-closes would still be charged, but the system would never
    // acknowledge the payment — money stuck in limbo (#C1).
    await this.abandonCheckoutOrThrowIfPending(token, session.id);

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
  private async closeSessionWithProvider(
    token: string,
    restaurantId: string,
    userId: string,
    provider: 'MYPOS' | 'CASH',
  ): Promise<{ amount: number }> {
    await this.verifyPosOperatorAccess(restaurantId, userId);
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
      const balance = await this.computeSessionBalance(tx, session.id);
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

  /**
   * Split-bill partial settlement from the POS (in-person, CASH/MYPOS only).
   * Records a SUCCEEDED partial payment for a subset of the bill and leaves the
   * session OPEN until the running remaining balance reaches zero, at which point
   * it flips to PAID. Three modes:
   *   ITEM   — pay for selected order-item units (tags paidQuantity + allocations)
   *   EVEN   — pay one share of remaining / splitCount
   *   CUSTOM — pay an arbitrary amount (clamped to remaining)
   * The PAID gate is amount-based; allocations are advisory (picker + receipts +
   * refund reversal). Online self-pay split uses scoped provider checkout
   * metadata; this endpoint remains POS-only.
   */
  async settlePartial(
    token: string,
    restaurantId: string,
    userId: string,
    dto: SettlePartialDto,
  ): Promise<{ amount: number; remaining: number; sessionPaid: boolean }> {
    await this.verifyPosOperatorAccess(restaurantId, userId);

    const openSession = await this.prisma.tableSession.findFirst({
      where: { token, restaurantId, status: 'OPEN' },
      select: { id: true },
    });
    if (!openSession) throw new NotFoundException('Session not found');

    // Cancel any pending online payments before recording a POS settlement.
    // Without this, a concurrent Stripe checkout could succeed after the waiter
    // settles, collecting more than the bill total (#POS-C3).
    await this.abandonCheckoutOrThrowIfPending(token, openSession.id);

    const tipPercent = this.normalizeTipPercent(dto.tipPercent);

    const result = await this.prisma.$transaction(async (tx) => {
      const session = await tx.tableSession.findFirst({
        where: { token, restaurantId, status: 'OPEN' },
      });
      if (!session) throw new NotFoundException('Session not found');
      await this.lockOpenSessionForSettlement(tx, session.id);

      const pendingPayment = await tx.payment.findFirst({
        where: { tableSessionId: session.id, status: 'PENDING' },
        select: { id: true },
      });
      if (pendingPayment) {
        throw new ConflictException(
          'A payment for this session is still being processed. Please wait or retry.',
        );
      }

      const balance = await this.computeSessionBalance(tx, session.id);
      if (balance.remaining <= 0) {
        throw new ConflictException('This session is already fully paid');
      }

      let chargeSubtotal: number;
      const allocations: Array<{
        orderItemId: string;
        quantity: number;
        amount: number;
        snapshotPaid: number;
      }> = [];

      if (dto.mode === SplitMode.ITEM) {
        if (!dto.allocations?.length) {
          throw new BadRequestException('Select at least one item to split');
        }
        if (balance.hasLoyaltyDiscount) {
          throw new BadRequestException(
            'Item split is unavailable when loyalty discounts apply — use even or custom split',
          );
        }
        const itemById = new Map(balance.items.map((i) => [i.orderItemId, i]));
        // Collapse duplicate orderItemId entries so availability is checked once.
        const requested = new Map<string, number>();
        for (const a of dto.allocations) {
          requested.set(
            a.orderItemId,
            (requested.get(a.orderItemId) ?? 0) + a.quantity,
          );
        }
        let sum = 0;
        for (const [orderItemId, quantity] of requested) {
          const it = itemById.get(orderItemId);
          if (!it) throw new BadRequestException('Unknown item in selection');
          if (quantity > it.remainingQuantity) {
            throw new ConflictException('Some selected items are already settled');
          }
          const amount = this.roundMoney(it.unitPrice * quantity);
          allocations.push({
            orderItemId,
            quantity,
            amount,
            snapshotPaid: it.paidQuantity,
          });
          sum += amount;
        }
        chargeSubtotal = this.roundMoney(sum);
      } else if (dto.mode === SplitMode.EVEN) {
        // One share of the REMAINING balance: remaining / peopleLeft. The POS
        // sends `splitCount` = people still to pay and decrements it after each
        // even payment, so shares stay equal AND the final payment lands exactly
        // (remaining / 1), leaving no rounding dust. Clamped to remaining below.
        const splitCount = dto.splitCount ?? 1;
        chargeSubtotal = this.roundMoney(balance.remaining / splitCount);
      } else {
        if (!dto.amount || dto.amount <= 0) {
          throw new BadRequestException('Enter an amount to settle');
        }
        chargeSubtotal = this.roundMoney(dto.amount);
      }

      // Never collect more than the outstanding balance.
      chargeSubtotal = Math.min(chargeSubtotal, balance.remaining);
      if (chargeSubtotal <= 0) {
        throw new BadRequestException('Nothing left to settle');
      }

      const tipAmount = this.roundMoney((chargeSubtotal * tipPercent) / 100);
      const total = this.roundMoney(chargeSubtotal + tipAmount);

      const payment = await tx.payment.create({
        data: {
          tableSessionId: session.id,
          restaurantId,
          amount: total,
          tipAmount,
          // In-person CASH/MYPOS — no platform fee, matching the full-close path.
          platformFeeAmount: 0,
          currency: 'eur',
          status: 'SUCCEEDED',
          provider: dto.provider as PaymentProvider,
          splitMode: dto.mode,
        },
      });

      if (allocations.length > 0) {
        for (const a of allocations) {
          // Optimistic per-unit lock: increment only if paidQuantity is unchanged
          // since the snapshot. A concurrent settlement of the same units changes
          // it, count===0, and we abort the whole transaction (no double-pay).
          const upd = await tx.orderItem.updateMany({
            where: { id: a.orderItemId, paidQuantity: a.snapshotPaid },
            data: { paidQuantity: { increment: a.quantity } },
          });
          if (upd.count === 0) {
            throw new ConflictException(
              'Items changed during settlement — please retry',
            );
          }
        }
        await tx.paymentAllocation.createMany({
          data: allocations.map((a) => ({
            paymentId: payment.id,
            orderItemId: a.orderItemId,
            quantity: a.quantity,
            amount: a.amount,
          })),
        });
      }

      const newRemaining = this.roundMoney(balance.remaining - chargeSubtotal);
      let sessionPaid = false;
      if (newRemaining <= 0.01) {
        const flip = await tx.tableSession.updateMany({
          where: { id: session.id, status: 'OPEN' },
          data: { status: 'PAID', paidAt: new Date() },
        });
        sessionPaid = flip.count > 0;
      }

      return {
        sessionId: session.id,
        tableId: session.tableId,
        amount: total,
        remaining: Math.max(0, newRemaining),
        sessionPaid,
        paymentId: payment.id,
        tipAmount,
        splitMode: dto.mode,
      };
    });

    // Emit after commit so rolled-back work never fires socket events (#H4).
    this.events.emitTableStatusChanged(
      restaurantId,
      result.tableId,
      result.sessionId,
    );
    const billUpdatedPayload = {
      tableSessionId: result.sessionId,
      tableId: result.tableId,
      paymentId: result.paymentId,
      splitMode: result.splitMode,
      remaining: result.remaining,
      sessionPaid: result.sessionPaid,
    };
    this.events.emitToRestaurant(
      restaurantId,
      'bill:updated',
      billUpdatedPayload,
    );
    this.events.emitToTableSession(
      result.sessionId,
      'bill:updated',
      billUpdatedPayload,
    );
    if (result.sessionPaid) {
      const tableNumber =
        (
          await this.prisma.restaurantTable.findUnique({
            where: { id: result.tableId },
            select: { name: true },
          })
        )?.name ?? null;
      const customerName =
        (
          await this.prisma.order.findFirst({
            where: { tableSessionId: result.sessionId },
            orderBy: { createdAt: 'desc' },
            select: { customerName: true },
          })
        )?.customerName ?? null;
      const paymentConfirmedPayload = {
        paymentId: result.paymentId,
        tableSessionId: result.sessionId,
        amount: result.amount,
        tipAmount: result.tipAmount,
        tableNumber,
        customerName,
      };
      this.events.emitToRestaurant(
        restaurantId,
        'payment:confirmed',
        paymentConfirmedPayload,
      );
      this.events.emitToTableSession(
        result.sessionId,
        'payment:confirmed',
        paymentConfirmedPayload,
      );
    }

    return {
      amount: result.amount,
      remaining: result.remaining,
      sessionPaid: result.sessionPaid,
    };
  }

  async forceOpenSession(
    tableId: string,
    restaurantId: string,
    userId: string,
  ): Promise<{ session: any; token: string }> {
    await this.verifyPosOperatorAccess(restaurantId, userId);
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
          await tx.tableSession.update({
            where: { id: existingInTx.id },
            data: { status: 'CLOSED_NO_PAYMENT' },
          });
        }
        const created = await tx.tableSession.create({
          data: { tableId, restaurantId },
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

  async getTableSessions(
    restaurantId: string,
    page: number | undefined,
    limit: number | undefined,
    userId: string,
  ): Promise<{
    data: any[];
    meta: { total: number; page: number; limit: number };
  }> {
    // Access check is mandatory — the guard belongs to the method, not the
    // caller, so a future internal caller can't accidentally skip it (#L2).
    await this.verifyRestaurantAccess(restaurantId, userId);

    const take = limit ?? 50;
    const skip = page ? (page - 1) * take : 0;

    const where = { restaurantId, status: { in: ['OPEN', 'PAID'] as any } };
    const [data, total] = await Promise.all([
      this.prisma.tableSession.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.tableSession.count({ where }),
    ]);

    return {
      data,
      meta: { total, page: page ?? 1, limit: take },
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
    userId: string,
  ): Promise<{
    data: any[];
    meta: { total: number; page: number; limit: number };
  }> {
    // Mandatory access check (#L2) — see getTableSessions.
    await this.verifyRestaurantAccess(restaurantId, userId);

    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, 50);
    const skip = (page - 1) * limit;

    const where: any = { restaurantId };
    if (filters.status) {
      where.status = filters.status;
    } else {
      where.status = { not: 'ABANDONED' };
    }
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
      data: data.map((payment) => this.mapPayment(payment)),
      meta: { total, page, limit },
    };
  }

  async exportPayments(
    restaurantId: string,
    userId: string,
    filters: { from?: string; to?: string },
  ): Promise<any[]> {
    await this.verifyRestaurantAccess(restaurantId, userId);

    const where: any = { restaurantId, status: { not: 'ABANDONED' } };
    if (filters.from || filters.to) {
      where.createdAt = {};
      if (filters.from) where.createdAt.gte = new Date(filters.from);
      if (filters.to) where.createdAt.lte = new Date(filters.to);
    }

    const data = await this.prisma.payment.findMany({
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
    });

    return data.map((payment) => this.mapPayment(payment));
  }

  async getPaymentsOverview(
    restaurantId: string,
    userId: string,
    filters: { startDate?: string; endDate?: string } = {},
  ) {
    const restaurant = await this.verifyRestaurantAccess(restaurantId, userId);
    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (filters.startDate) dateFilter.gte = new Date(filters.startDate);
    if (filters.endDate) {
      const end = new Date(filters.endDate);
      end.setHours(23, 59, 59, 999);
      dateFilter.lte = end;
    }

    const where = {
      restaurantId,
      ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {}),
    };
    const visibleWhere = { ...where, status: { not: PaymentStatus.ABANDONED } };

    const [
      collected,
      tips,
      fees,
      refunds,
      successfulCount,
      refundCount,
      statusCounts,
      methodTotals,
      latestPayment,
    ] = await Promise.all([
      this.prisma.payment.aggregate({
        _sum: { amount: true },
        where: { ...where, status: 'SUCCEEDED' },
      }),
      this.prisma.payment.aggregate({
        _sum: { tipAmount: true },
        where: { ...where, status: 'SUCCEEDED' },
      }),
      this.prisma.payment.aggregate({
        _sum: { platformFeeAmount: true },
        where: { ...where, status: 'SUCCEEDED' },
      }),
      this.prisma.payment.aggregate({
        _sum: { amount: true },
        where: { ...where, status: 'REFUNDED' },
      }),
      this.prisma.payment.count({ where: { ...where, status: 'SUCCEEDED' } }),
      this.prisma.payment.count({ where: { ...where, status: 'REFUNDED' } }),
      this.prisma.payment.groupBy({
        by: ['status'],
        _count: true,
        where: visibleWhere,
      }),
      this.prisma.payment.groupBy({
        by: ['provider'],
        _sum: { amount: true, platformFeeAmount: true },
        _count: true,
        where: { ...where, status: 'SUCCEEDED' },
      }),
      this.prisma.payment.findFirst({
        where: visibleWhere,
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, currency: true },
      }),
    ]);

    const totalCollected = this.roundMoney(collected._sum.amount ?? 0);
    const platformFees = this.roundMoney(fees._sum.platformFeeAmount ?? 0);

    return {
      account: {
        paymentsEnabled: restaurant.paymentsEnabled,
        stripeOnboarded: restaurant.stripeOnboarded,
        stripeAccountId: restaurant.stripeAccountId,
        epayEnabled: restaurant.epayEnabled,
        epayMode: restaurant.epayMode,
        epayClientId: restaurant.epayClientId,
        epayMerchantEmail: restaurant.epayMerchantEmail,
        epayPage: restaurant.epayPage,
        epaySecretConfigured: !!restaurant.epaySecretEncrypted,
        boricaEnabled: restaurant.boricaEnabled,
        boricaMode: restaurant.boricaMode,
        boricaTerminalId: restaurant.boricaTerminalId,
        boricaMerchantId: restaurant.boricaMerchantId,
        boricaMerchantName: restaurant.boricaMerchantName,
        boricaPublicCert: restaurant.boricaPublicCert,
        boricaCurrency: restaurant.boricaCurrency,
        boricaPrivateKeyConfigured: !!restaurant.boricaPrivateKeyEncrypted,
        myposEnabled: restaurant.myposEnabled,
        myposMode: restaurant.myposMode,
        myposClientNumber: restaurant.myposClientNumber,
        myposStoreId: restaurant.myposStoreId,
        myposKeyIndex: restaurant.myposKeyIndex,
        myposPublicCert: restaurant.myposPublicCert,
        myposCurrency: restaurant.myposCurrency,
        myposPrivateKeyConfigured: !!restaurant.myposPrivateKeyEncrypted,
        platformFeePercent: restaurant.platformFeePercent,
        tipsEnabled: restaurant.tipsEnabled,
        tipOptions: restaurant.tipOptions,
      },
      metrics: {
        totalCollected,
        averageTransaction: successfulCount
          ? this.roundMoney(totalCollected / successfulCount)
          : 0,
        tipsCollected: this.roundMoney(tips._sum.tipAmount ?? 0),
        platformFees,
        refundsIssued: this.roundMoney(refunds._sum.amount ?? 0),
        netCollected: this.roundMoney(totalCollected - platformFees),
        successfulTransactions: successfulCount,
        refundsCount: refundCount,
      },
      statusCounts: (statusCounts as Array<{ status: string; _count: number }>).map((item) => ({
        status: item.status,
        count: item._count,
      })),
      methodTotals: methodTotals.map(
        (item: {
          provider: string;
          _sum: { amount: number | null; platformFeeAmount: number | null };
          _count: number;
        }) => ({
          method: item.provider,
          amount: this.roundMoney(item._sum.amount ?? 0),
          fees: this.roundMoney(item._sum.platformFeeAmount ?? 0),
          count: item._count,
        }),
      ),
      currency: latestPayment?.currency ?? 'eur',
      latestPaymentAt: latestPayment?.createdAt ?? null,
    };
  }

  async getPaymentDetail(paymentId: string, userId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        tableSession: {
          include: {
            table: { select: { id: true, name: true } },
            orders: {
              orderBy: { createdAt: 'asc' },
              include: {
                items: {
                  include: {
                    menuItem: { select: { name: true, price: true } },
                  },
                },
                staff: { select: { name: true, email: true, role: true } },
              },
            },
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    await this.verifyRestaurantAccess(payment.restaurantId, userId);

    const mapped = this.mapPayment(payment);
    const orders = (payment.tableSession?.orders ?? []).map((order) => ({
      id: order.id,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      totalPrice: order.totalPrice,
      status: order.status,
      specialRequests: order.specialRequests,
      createdAt: order.createdAt,
      source: order.source,
      staffName: order.staff ? (order.staff.name ?? order.staff.email) : null,
      staffRole: order.staff?.role ?? null,
      items: order.items.map((item: any) => ({
        name: item.menuItem?.name ?? 'Unknown item',
        quantity: item.quantity,
        unitPrice: item.menuItem?.price ?? 0,
        options: Array.isArray(item.selectedOptions)
          ? (item.selectedOptions as any[])
              .map((option: any) => option?.choiceName)
              .filter(Boolean)
          : [],
      })),
    }));

    return {
      ...mapped,
      table: payment.tableSession?.table ?? null,
      orders,
      breakdown: {
        subtotal: this.roundMoney(payment.amount - payment.tipAmount),
        tip: payment.tipAmount,
        totalCharged: payment.amount,
        platformFee: payment.platformFeeAmount,
        net: mapped.netAmount,
      },
      timeline: [
        {
          label: `Payment ${mapped.statusLabel.toLowerCase()}`,
          at: payment.updatedAt,
        },
        { label: 'Payment record created', at: payment.createdAt },
        ...(payment.tableSession?.createdAt
          ? [
              {
                label: 'Table session opened',
                at: payment.tableSession.createdAt,
              },
            ]
          : []),
      ],
    };
  }

  async getPayoutsSnapshot(restaurantId: string, userId: string) {
    const overview = await this.getPaymentsOverview(restaurantId, userId);
    return {
      estimatedBalance: overview.metrics.netCollected,
      platformFees: overview.metrics.platformFees,
      totalCollected: overview.metrics.totalCollected,
      methodTotals: overview.methodTotals,
      stripeAccountId: overview.account.stripeAccountId,
      stripeOnboarded: overview.account.stripeOnboarded,
      note: 'Live payout timing and bank account details are managed by the selected payment provider.',
    };
  }

  async getPaymentSettings(restaurantId: string, userId: string) {
    const restaurant = await this.verifyRestaurantAccess(restaurantId, userId);
    return {
      paymentsEnabled: restaurant.paymentsEnabled,
      stripeOnboarded: restaurant.stripeOnboarded,
      stripeAccountId: restaurant.stripeAccountId,
      epayEnabled: restaurant.epayEnabled,
      epayMode: restaurant.epayMode,
      epayClientId: restaurant.epayClientId,
      epayMerchantEmail: restaurant.epayMerchantEmail,
      epayPage: restaurant.epayPage,
      epaySecretConfigured: !!restaurant.epaySecretEncrypted,
      boricaEnabled: restaurant.boricaEnabled,
      boricaMode: restaurant.boricaMode,
      boricaTerminalId: restaurant.boricaTerminalId,
      boricaMerchantId: restaurant.boricaMerchantId,
      boricaMerchantName: restaurant.boricaMerchantName,
      boricaPublicCert: restaurant.boricaPublicCert,
      boricaCurrency: restaurant.boricaCurrency,
      boricaPrivateKeyConfigured: !!restaurant.boricaPrivateKeyEncrypted,
      myposEnabled: restaurant.myposEnabled,
      myposMode: restaurant.myposMode,
      myposClientNumber: restaurant.myposClientNumber,
      myposStoreId: restaurant.myposStoreId,
      myposKeyIndex: restaurant.myposKeyIndex,
      myposPublicCert: restaurant.myposPublicCert,
      myposCurrency: restaurant.myposCurrency,
      myposPrivateKeyConfigured: !!restaurant.myposPrivateKeyEncrypted,
      platformFeePercent: restaurant.platformFeePercent,
      tipsEnabled: restaurant.tipsEnabled,
      tipOptions: restaurant.tipOptions,
    };
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
          select: { orderItemId: true, quantity: true },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    await this.verifyRestaurantAccess(payment.restaurantId, userId);

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
    const { count } = await this.prisma.payment.updateMany({
      where: { id: paymentId, status: 'SUCCEEDED' },
      data: { status: 'REFUNDED' },
    });

    if (count === 0) {
      throw new ConflictException(
        'Payment has already been refunded or is not in a refundable state',
      );
    }

    let refund: { refundId: string; status: string | null } | null = null;
    if (payment.provider === 'STRIPE') {
      if (!payment.stripePaymentIntentId) {
        await this.prisma.payment
          .updateMany({
            where: { id: paymentId, status: 'REFUNDED' },
            data: { status: 'SUCCEEDED' },
          })
          .catch(() => {});
        throw new BadRequestException('Stripe payment intent is missing');
      }
      try {
        refund = await this.stripe.createRefund({
          paymentIntentId: payment.stripePaymentIntentId,
          amountCents: Math.round(payment.amount * 100),
          reason: data.reason,
        });
      } catch (err) {
        // Best-effort rollback — restore succeeded so a retry is possible.
        // Status guard avoids clobbering a record that genuinely reached
        // REFUNDED through a concurrent path (#M1).
        await this.prisma.payment
          .updateMany({
            where: { id: paymentId, status: 'REFUNDED' },
            data: { status: 'SUCCEEDED' },
          })
          .catch(() => {});
        this.logger.error(
          `Stripe refund failed for ${paymentId}, status rolled back`,
          err,
        );
        throw err;
      }
    }

    const allocations = payment.allocations ?? [];
    if (allocations.length > 0) {
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

    this.events.emitToRestaurant(payment.restaurantId, 'payment:refunded', {
      paymentId: payment.id,
      tableSessionId: payment.tableSessionId,
      amount: payment.amount,
      tableNumber: payment.tableSession?.table?.name ?? null,
      refundId: refund?.refundId ?? null,
    });

    return {
      payment: this.mapPayment(updated!),
      refund,
    };
  }
}
