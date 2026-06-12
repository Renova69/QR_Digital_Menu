import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StripeProvider } from './stripe.provider';
import {
  EpayNotification,
  EpayPage,
  EpayProvider,
} from './epay.provider';
import { BoricaCardholderInfo, BoricaProvider } from './borica.provider';
import { decryptSecret, encryptSecret } from './secret-crypto';
import { EventsGateway } from '../events/events.gateway';
import { FeatureService } from '../subscription/feature.service';
import { FeatureFlag } from '../subscription/feature-flag.enum';
import { PaymentStatus } from '@prisma/client';

type CheckoutProvider = 'STRIPE' | 'EPAY' | 'BORICA';

type BoricaCardholderInput = {
  cardholderName?: string | null;
  email?: string | null;
  phone?: string | null;
  billingAddress?: string | null;
};

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeProvider,
    private readonly epay: EpayProvider,
    private readonly borica: BoricaProvider,
    private readonly events: EventsGateway,
    private readonly featureService: FeatureService,
  ) {}

  private roundMoney(value: number) {
    return Math.round(value * 100) / 100;
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
  ): string {
    return `stripe:${sessionId}:${amountCents}:${platformFeeCents}:eur`;
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
    // covers its CURRENT bill. Orders can be added after a low PaymentIntent was
    // created; confirming that stale intent must not flip the whole (now larger)
    // session to PAID for a fraction of what's owed. payment.amount includes any
    // tip, so a normal full payment always covers the subtotal — only an
    // added-items / tampered-amount case falls short. When it does, we leave the
    // session OPEN (and the payment unclaimed) so staff collect the real total.
    const sessionOrders = await tx.order.findMany({
      where: { tableSessionId: payment.tableSessionId },
      select: { totalPrice: true },
    });
    const currentSubtotal = sessionOrders.reduce(
      (sum: number, o: { totalPrice: number }) => sum + o.totalPrice,
      0,
    );
    if (
      this.roundMoney(payment.amount ?? 0) + 0.01 <
      this.roundMoney(currentSubtotal)
    ) {
      this.logger.warn(
        'Refusing to mark session PAID: payment does not cover current bill',
        {
          paymentId: payment.id,
          tableSessionId: payment.tableSessionId,
          paidAmount: payment.amount,
          currentSubtotal,
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
    orders: any[];
    subtotal: number;
    restaurantId: string;
    tipsEnabled: boolean;
    tipOptions: number[];
    paymentProviders: CheckoutProvider[];
  }> {
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
        staff: { select: { name: true, email: true, role: true } },
      },
    });

    const subtotal = orders.reduce((sum: number, o: any) => sum + o.totalPrice, 0);

    const enrichedOrders = orders.map((order) => ({
      id: order.id,
      source: order.source,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      staffName: order.staff ? (order.staff.name ?? order.staff.email) : null,
      staffRole: order.staff?.role ?? null,
      totalPrice: order.totalPrice,
      items: order.items.map((oi: any) => ({
        name: oi.menuItem?.name ?? 'Unknown item',
        quantity: oi.quantity,
        unitPrice: oi.menuItem?.price ?? 0,
        selectedOptions: Array.isArray(oi.selectedOptions)
          ? oi.selectedOptions
          : [],
      })),
    }));

    return {
      orders: enrichedOrders,
      subtotal,
      restaurantId: session.restaurantId,
      tipsEnabled: session.restaurant.tipsEnabled,
      tipOptions: session.restaurant.tipOptions,
      paymentProviders: [
        ...(this.isStripeConfigured(session.restaurant) ? ['STRIPE' as const] : []),
        ...(this.isEpayConfigured(session.restaurant) ? ['EPAY' as const] : []),
        ...(this.isBoricaConfigured(session.restaurant) ? ['BORICA' as const] : []),
      ],
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

    for (const payment of pendingPayments) {
      if (payment.provider === 'STRIPE' && payment.stripePaymentIntentId) {
        try {
          await this.stripe.cancelPaymentIntent(payment.stripePaymentIntentId);
        } catch {
          this.logger.warn(
            `Could not cancel abandoned PaymentIntent ${payment.stripePaymentIntentId} for session ${session.id}`,
          );
          continue;
        }
      }

      await this.prisma.payment.updateMany({
        where: { id: payment.id, status: 'PENDING' },
        data: { status: 'ABANDONED', providerStatus: 'ABANDONED' },
      });
    }
  }

  async createCheckout(
    token: string,
    provider: CheckoutProvider,
    tipPercent: number,
    boricaCardholder?: BoricaCardholderInput,
  ) {
    if (provider === 'STRIPE') {
      const stripeCheckout = await this.createPaymentIntent(token, tipPercent);
      return { provider: 'STRIPE', ...stripeCheckout };
    }

    if (provider === 'EPAY') {
      return this.createEpayCheckout(token, tipPercent);
    }

    if (provider === 'BORICA') {
      return this.createBoricaCheckout(token, tipPercent, boricaCardholder);
    }

    throw new BadRequestException('Unsupported payment provider');
  }

  async createPaymentIntent(
    token: string,
    tipPercent: number,
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

    const orders = await this.prisma.order.findMany({
      where: { tableSessionId: session.id },
    });

    // platformFeePercent is a WHOLE-NUMBER percent (e.g. 5 = 5%), not a fraction
    // (#L1). fee_in_cents = total_euros × percent works only under that unit:
    //   €20 × 5 = 100 cents = €1.00 = 5% of €20.
    // If this is ever stored as a fraction (0.05), fees become 100× too small.
    const { tipAmount, total, platformFeeCents, platformFeeAmount } =
      this.calculateTotals(
        orders,
        normalizedTipPercent,
        restaurant.platformFeePercent ?? 0,
      );
    const amountCents = Math.round(total * 100);
    const stripeCheckoutKey = this.buildStripeCheckoutKey(
      session.id,
      amountCents,
      platformFeeCents,
    );

    // Guard against double capture (#H1). A session can accumulate multiple
    // intents (double-click, retried tab) and all could be confirmed. Reject if
    // already paid, and cancel any stale PENDING intent so only the newest one
    // is capturable. The session-status=OPEN guard above already blocks new
    // intents after the webhook flips the session to PAID; this closes the
    // remaining window where two intents exist before either confirms.
    const existingPayments = await this.prisma.payment.findMany({
      where: {
        tableSessionId: session.id,
        status: { in: ['PENDING', 'SUCCEEDED'] },
      },
    });
    if (existingPayments.some((p) => p.status === 'SUCCEEDED')) {
      throw new ConflictException('This session has already been paid');
    }

    // Issue 35: Idempotency — reuse an existing PENDING Stripe intent when the
    // cart amount hasn't changed. Prevents orphaned authorized holds on double-tap.
    const matchingIntent = existingPayments.find(
      (p) =>
        p.provider === 'STRIPE' &&
        p.status === 'PENDING' &&
        p.stripePaymentIntentId &&
        (!p.providerReference || p.providerReference === stripeCheckoutKey) &&
        Math.abs((p.amount ?? 0) - total) < 0.001,
    );
    if (matchingIntent?.stripePaymentIntentId) {
      try {
        const existing = await this.stripe.retrievePaymentIntent(
          matchingIntent.stripePaymentIntentId,
        );
        if (existing?.clientSecret) {
          return {
            clientSecret: existing.clientSecret,
            paymentId: matchingIntent.id,
            total,
            tipAmount,
          };
        }
      } catch {
        // Intent no longer retrievable — fall through to cancel + create new one.
      }
    }

    for (const stale of existingPayments) {
      if (stale.provider === 'EPAY' || stale.provider === 'BORICA') {
        // Hosted-redirect providers have no server-side cancel API. A processed
        // payment would have triggered a callback and moved out of PENDING before
        // the customer returned to the menu — still PENDING means abandoned.
        await this.prisma.payment.updateMany({
          where: { id: stale.id, status: 'PENDING' },
          data: { status: 'ABANDONED', providerStatus: 'ABANDONED' },
        });
        continue;
      }
      if (stale.stripePaymentIntentId) {
        try {
          await this.stripe.cancelPaymentIntent(stale.stripePaymentIntentId);
        } catch (err) {
          // Cancel fails if the intent already succeeded — treat as paid to
          // avoid a second charge rather than racing to create a new intent.
          this.logger.warn(
            `Could not cancel stale PaymentIntent ${stale.stripePaymentIntentId} for session ${session.id}`,
          );
          throw new ConflictException(
            'A payment for this session is already being processed',
          );
        }
      }
      await this.prisma.payment.updateMany({
        where: { id: stale.id, status: 'PENDING' },
        data: {
          status: 'ABANDONED',
          providerStatus: 'ABANDONED',
          providerReference: null,
        },
      });
    }

    let payment: { id: string };
    try {
      payment = await this.prisma.payment.create({
        data: {
          tableSessionId: session.id,
          restaurantId: session.restaurantId,
          amount: total,
          tipAmount,
          platformFeeAmount,
          currency: 'eur',
          status: 'PENDING',
          provider: 'STRIPE',
          providerReference: stripeCheckoutKey,
        },
      });
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
          metadata: { sessionId: session.id, paymentId: payment.id },
        });

      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { stripePaymentIntentId: paymentIntentId },
      });

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

  private async createEpayCheckout(token: string, tipPercent: number) {
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

    const orders = await this.prisma.order.findMany({
      where: { tableSessionId: session.id },
    });
    const { tipAmount, total, platformFeeAmount } = this.calculateTotals(
      orders,
      normalizedTipPercent,
      restaurant.platformFeePercent ?? 0,
    );

    const existingPayments = await this.prisma.payment.findMany({
      where: {
        tableSessionId: session.id,
        status: { in: ['PENDING', 'SUCCEEDED'] },
      },
    });
    if (existingPayments.some((p) => p.status === 'SUCCEEDED')) {
      throw new ConflictException('This session has already been paid');
    }

    // Abandon stale non-ePay PENDING payments — customer switched provider.
    // A payment that reached the gateway would have triggered a callback before
    // the customer returned to the menu, moving it out of PENDING. Still PENDING
    // here means the redirect was abandoned.
    for (const stale of existingPayments.filter(
      (p) => p.status === 'PENDING' && p.provider !== 'EPAY',
    )) {
      if (stale.stripePaymentIntentId) {
        await this.stripe.cancelPaymentIntent(stale.stripePaymentIntentId).catch(() => {});
      }
      await this.prisma.payment.updateMany({
        where: { id: stale.id, status: 'PENDING' },
        data: { status: 'ABANDONED', providerStatus: 'ABANDONED' },
      });
    }

    const pendingEpay = existingPayments.find(
      (p) => p.provider === 'EPAY' && p.status === 'PENDING',
    );
    if (pendingEpay) {
      const checkoutForm = (pendingEpay.providerPayload as any)?.checkoutForm;
      const storedExpiry: string | undefined =
        (pendingEpay.providerPayload as any)?.expiresAt;
      const notExpired = storedExpiry ? new Date(storedExpiry) > new Date() : false;
      const sameAmount =
        Math.abs((pendingEpay.amount ?? 0) - total) < 0.001 &&
        Math.abs((pendingEpay.tipAmount ?? 0) - tipAmount) < 0.001;

      if (checkoutForm && sameAmount && notExpired) {
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

      if (sameAmount && !notExpired) {
        // Invoice EXP_TIME has passed — mark stale record FAILED and create a fresh checkout.
        await this.prisma.payment.updateMany({
          where: { id: pendingEpay.id, status: 'PENDING' },
          data: { status: 'FAILED', providerStatus: 'EXPIRED' },
        });
      } else {
        // Amount changed (order updated) — abandon stale checkout and create fresh one.
        await this.prisma.payment.updateMany({
          where: { id: pendingEpay.id, status: 'PENDING' },
          data: { status: 'ABANDONED', providerStatus: 'ABANDONED' },
        });
      }
    }

    const secret = decryptSecret(restaurant.epaySecretEncrypted!);
    const expiresAt = this.getEpayExpirationDate();
    const invoice = this.createEpayInvoice();

    const payment = await this.prisma.payment.create({
      data: {
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
      },
    });

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
        providerPayload: {
          checkoutForm,
          expiresAt: expiresAt.toISOString(),
        } as any,
      },
    });

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

  private async createBoricaCheckout(
    token: string,
    tipPercent: number,
    cardholderInput?: BoricaCardholderInput,
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
    const { tipAmount, total, platformFeeAmount } = this.calculateTotals(
      orders,
      normalizedTipPercent,
      restaurant.platformFeePercent ?? 0,
    );

    const existingPayments = await this.prisma.payment.findMany({
      where: {
        tableSessionId: session.id,
        status: { in: ['PENDING', 'SUCCEEDED'] },
      },
    });
    if (existingPayments.some((p) => p.status === 'SUCCEEDED')) {
      throw new ConflictException('This session has already been paid');
    }

    // Abandon stale non-BORICA PENDING payments — customer switched provider.
    for (const stale of existingPayments.filter(
      (p) => p.status === 'PENDING' && p.provider !== 'BORICA',
    )) {
      if (stale.stripePaymentIntentId) {
        await this.stripe.cancelPaymentIntent(stale.stripePaymentIntentId).catch(() => {});
      }
      await this.prisma.payment.updateMany({
        where: { id: stale.id, status: 'PENDING' },
        data: { status: 'ABANDONED', providerStatus: 'ABANDONED' },
      });
    }

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
      (p) => p.provider === 'BORICA' && p.status === 'PENDING',
    );
    if (pendingBorica) {
      const age = Date.now() - new Date((pendingBorica as any).createdAt ?? 0).getTime();
      const checkoutForm = (pendingBorica.providerPayload as any)?.checkoutForm;
      const sameAmount =
        Math.abs((pendingBorica.amount ?? 0) - total) < 0.001 &&
        Math.abs((pendingBorica.tipAmount ?? 0) - tipAmount) < 0.001;
      if (checkoutForm && sameAmount && age < BORICA_PENDING_TTL_MS) {
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
              (checkedStatus.currency || '').toUpperCase() === 'EUR';
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
              const claimed = await this.prisma.$transaction((tx) =>
                this.claimSuccessfulPaymentForOpenSession(tx, pendingBorica, {
                  status: 'SUCCEEDED',
                  providerStatus: 'RECOVERED_VIA_STATUS_CHECK',
                }),
              );
              if (claimed) await this.emitPaymentConfirmed(pendingBorica as any);
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
        payment = await this.prisma.payment.create({
          data: {
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
            providerPayload: {
              checkoutForm: attemptForm,
              sessionToken: token,
              restaurantId: session.restaurantId,
              tableName: session.table?.name ?? null,
            } as any,
          },
        });
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
    if (result.rc !== '00' || result.action !== '0') {
      await this.prisma.payment.updateMany({
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

    const claimed = await this.prisma.$transaction((tx) =>
      this.claimSuccessfulPaymentForOpenSession(tx, payment, {
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
      }),
    );

    if (claimed) await this.emitPaymentConfirmed(payment);

    return this.buildPublicMenuReturnUrl(
      {
        restaurantId: payment.restaurantId,
        table: payment.tableSession?.table,
      },
      claimed || payment.status === 'SUCCEEDED'
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

  private async applyEpayNotification(payment: any, notification: EpayNotification) {
    const providerPayload = this.mergeProviderPayload(payment.providerPayload, {
      notification,
      notifiedAt: new Date().toISOString(),
    });

    if (notification.status === 'PAID') {
      const claimed = await this.prisma.$transaction((tx) =>
        this.claimSuccessfulPaymentForOpenSession(tx, payment, {
          status: 'SUCCEEDED',
          providerStatus: 'PAID',
          providerPayload: providerPayload as any,
        }),
      );

      if (claimed) await this.emitPaymentConfirmed(payment);
      return;
    }

    await this.prisma.payment.updateMany({
      where: { id: payment.id, status: 'PENDING' },
      data: {
        status: 'FAILED',
        providerStatus: notification.status,
        providerPayload: providerPayload as any,
      },
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

    this.events.emitToRestaurant(
      tableSession.restaurantId,
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
      tableSession.restaurantId,
      tableSession.tableId,
      payment.tableSessionId,
    );
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
      const claimed = await this.prisma.$transaction((tx) =>
        this.claimSuccessfulPaymentForOpenSession(tx, payment, {
          status: 'SUCCEEDED',
          stripePaymentIntentId: intent.id,
        }),
      );
      if (!claimed) return;

      const tableNumber =
        payment.tableSession?.table?.name ??
        (
          await this.prisma.restaurantTable.findUnique({
            where: { id: payment.tableSession.tableId },
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

      await this.prisma.payment.updateMany({
        where: { id: payment.id, status: 'PENDING' },
        data: { status: 'FAILED' },
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
      include: { orders: true },
    });
    if (!session) throw new NotFoundException('Session not found');

    const amount = session.orders.reduce((sum, o) => sum + o.totalPrice, 0);
    if (amount <= 0)
      throw new BadRequestException('Cannot close a session with no orders');

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
          provider,
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
    userId: string,
  ): Promise<{ session: any; token: string }> {
    await this.verifyPosOperatorAccess(restaurantId, userId);
    const table = await this.prisma.restaurantTable.findFirst({
      where: { id: tableId, restaurantId },
    });
    if (!table)
      throw new NotFoundException('Table not found for this restaurant');

    const { session, closedSession } = await this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.tableSession.findFirst({
          where: { tableId, restaurantId, status: 'OPEN' },
        });
        if (existing) {
          await tx.tableSession.update({
            where: { id: existing.id },
            data: { status: 'CLOSED_NO_PAYMENT' },
          });
        }
        const created = await tx.tableSession.create({
          data: { tableId, restaurantId },
        });
        return { session: created, closedSession: existing };
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
