import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BoricaCardholderInfo, BoricaProvider } from '../borica.provider';
import { PaymentCoreService } from '../core/payment-core.service';
import { PaymentProviderConfigService } from '../payment-provider-config.service';
import { PaymentProvider, Prisma } from '@prisma/client';
import { SplitMode } from '../dto/settle-partial.dto';
import {
  CheckoutScopeInput,
  billScopeFromCheckoutScope,
  checkoutScopePayload,
  normalizeCheckoutScope,
  paymentBillScopeEquals,
  paymentScopeMatches,
} from '../payment-scope.utils';
import { BoricaCardholderInput } from '../payment.types';

@Injectable()
export class BoricaCheckoutService {
  private readonly logger = new Logger(BoricaCheckoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly borica: BoricaProvider,
    private readonly core: PaymentCoreService,
    private readonly config: PaymentProviderConfigService,
  ) {}

  resolveBoricaCardholder(
    orders: Array<{
      customerName?: string | null;
      customerPhone?: string | null;
    }>,
    input?: BoricaCardholderInput,
  ): BoricaCardholderInfo {
    const fallbackOrder = orders.find((order) => order.customerName?.trim());
    const cardholderName = (
      input?.cardholderName?.trim() ||
      fallbackOrder?.customerName?.trim() ||
      ''
    ).slice(0, 45);
    const email = (input?.email ?? '').trim();
    const phone = (
      input?.phone?.trim() ||
      fallbackOrder?.customerPhone?.trim() ||
      ''
    ).slice(0, 32);
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

  async markBoricaStatusUnknown(
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

  isBoricaNonFinalStatus(result: { rc?: string | null }): boolean {
    return ['-17', '-25', '-31'].includes((result.rc ?? '').trim());
  }

  async createBoricaCheckout(
    token: string,
    tipPercent: number,
    cardholderInput?: BoricaCardholderInput,
    checkoutScope?: CheckoutScopeInput,
  ) {
    const normalizedTipPercent = this.core.normalizeTipPercent(tipPercent);
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

    if (!this.config.isBoricaConfigured(restaurant)) {
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
    } = await this.core.resolveCheckoutCharge(
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
    const candidateBillScope = billScopeFromCheckoutScope(
      resolvedCheckoutScope,
    );
    const ignoredPendingPaymentIds: string[] = [];

    // #10 — BACKEND_URL must be absolute. LIVE requires HTTPS; http://localhost allowed for DEMO only.
    const backendBase = (process.env.BACKEND_URL || '').replace(/\/+$/, '');
    const isLiveBorica = restaurant.boricaMode === 'LIVE';
    const backendIsHttps = /^https:\/\//i.test(backendBase);
    const backendIsLocalHttp =
      /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(backendBase);
    if (
      !backendBase ||
      (!backendIsHttps && !(backendIsLocalHttp && !isLiveBorica))
    ) {
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
        paymentBillScopeEquals(p, candidateBillScope),
    );
    if (pendingBorica) {
      const age =
        Date.now() - new Date((pendingBorica as any).createdAt ?? 0).getTime();
      const checkoutForm = (pendingBorica.providerPayload as any)?.checkoutForm;
      const sameAmount =
        Math.abs((pendingBorica.amount ?? 0) - total) < 0.001 &&
        Math.abs((pendingBorica.tipAmount ?? 0) - tipAmount) < 0.001;
      const sameScope = paymentScopeMatches(
        pendingBorica,
        resolvedCheckoutScope,
      );
      if (
        checkoutForm &&
        sameAmount &&
        sameScope &&
        age < BORICA_PENDING_TTL_MS
      ) {
        this.core.emitPendingBillPayment(
          this.core.formatPendingPayment({
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
          const staleKeypair = this.config.resolveBoricaKeypair(restaurant);
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
          const checkedStatus = statusResult as NonNullable<
            typeof statusResult
          >;
          if (!checkedStatus.verified) {
            await this.markBoricaStatusUnknown(
              pendingBorica.id,
              'BORICA TRTYPE=90 response signature could not be verified',
            );
          }
          if (
            checkedStatus.verified &&
            checkedStatus.rc === '00' &&
            checkedStatus.action === '0'
          ) {
            const reconcileOk =
              checkedStatus.order === pendingBorica.providerReference &&
              checkedStatus.terminal === staleKeypair.terminal &&
              Math.abs(
                parseFloat(checkedStatus.amount || '0') -
                  (pendingBorica.amount ?? 0),
              ) < 0.01 &&
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
                this.core.claimSuccessfulPayment(tx, pendingBorica, {
                  status: 'SUCCEEDED',
                  providerStatus: 'RECOVERED_VIA_STATUS_CHECK',
                }),
              );
              await this.core.emitPaymentClaimEvents(
                pendingBorica as any,
                claim,
              );
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
      this.core.emitBillPaymentCleared(
        session.id,
        pendingBorica.id,
        'ONLINE_PAYMENT',
      );
      ignoredPendingPaymentIds.push(pendingBorica.id);
    }

    const keypair = this.config.resolveBoricaKeypair(restaurant);
    // #9 — Always charge in EUR; the app totals are EUR and no FX conversion is implemented.
    const currency = 'EUR';
    const tableName = session.table?.name ?? '';
    const rawDesc = `QR Menu bill ${tableName}`.trim();
    // BORICA requires DESC 8–50 chars; pad to 8 if too short.
    const description = rawDesc.length >= 8 ? rawDesc : rawDesc.padEnd(8, ' ');
    const cardholder = this.resolveBoricaCardholder(orders, cardholderInput);

    // #8 — Sign BEFORE creating a DB row so a bad key never leaves an orphan PENDING row.
    // Also validates required fields at the API level before any DB write.
    const order = this.config.createEpayInvoice().slice(-6).padStart(6, '0');
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
      const attemptOrder =
        attempt === 0
          ? order
          : this.config.createEpayInvoice().slice(-6).padStart(6, '0');

      // For retries we must rebuild the form with the new ORDER so P_SIGN stays valid.
      let attemptForm = attempt === 0 ? checkoutForm : (null as any);
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
          throw new BadRequestException(
            `BORICA signing error on retry: ${msg}`,
          );
        }
      }

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
            currency: currency.toLowerCase(),
            status: 'PENDING',
            provider: 'BORICA',
            providerReference: attemptOrder,
            providerStatus: 'PENDING',
            providerPayload: this.core.mergeProviderPayload(
              checkoutScopePayload(resolvedCheckoutScope),
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
          this.logger.warn(
            `BORICA ORDER collision on attempt ${attempt + 1}, retrying`,
          );
          continue;
        }
        throw dbErr;
      }
    }

    this.core.emitPendingBillPayment(
      this.core.formatPendingPayment({
        id: payment!.id,
        tableSessionId: session.id,
        provider: 'BORICA',
        providerPayload: checkoutScopePayload(resolvedCheckoutScope),
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
      return this.config.buildPublicMenuReturnUrl(
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
        tableSession: {
          include: { table: { select: { name: true, publicToken: true } } },
        },
      },
    });

    if (!payment) {
      return `${this.config.getFrontendBaseUrl()}/?payment=borica-cancel`;
    }

    const certPem =
      payment.restaurant?.boricaMode === 'LIVE'
        ? (payment.restaurant.boricaPublicCert ?? '')
        : (process.env.BORICA_TEST_CERT ?? '');

    const result = this.borica.verifyResult(body, certPem);

    const cancelUrl = this.config.buildPublicMenuReturnUrl(
      {
        restaurantId: payment.restaurantId,
        table: payment.tableSession?.table,
      },
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
        const recorded = await this.core.recordProviderEvent(
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
            providerPayload: this.core.mergeProviderPayload(
              payment.providerPayload,
              {
                callbackBody: body,
                verifiedAt: new Date().toISOString(),
                verified: true,
                rc: result.rc,
                action: result.action,
              },
            ) as any,
          },
        });
      });
      return cancelUrl;
    }

    // #6 — Reconcile callback fields against stored payment before marking PAID.
    // This prevents a replayed or tampered callback from crediting the wrong amount.
    const callbackAmount = parseFloat(body.AMOUNT ?? body.amount ?? '0');
    const callbackCurrency = (
      body.CURRENCY ??
      body.currency ??
      ''
    ).toUpperCase();
    const callbackTerminal = body.TERMINAL ?? body.terminal ?? '';
    const callbackOrder = body.ORDER ?? body.order ?? '';
    const resolvedTerminal =
      payment.restaurant?.boricaMode === 'LIVE'
        ? (payment.restaurant.boricaTerminalId ?? '')
        : (process.env.BORICA_TEST_TID ?? 'V1800001');
    const amountOk = Math.abs(callbackAmount - (payment.amount ?? 0)) < 0.01;
    const currencyOk =
      callbackCurrency === (payment.currency ?? 'eur').toUpperCase();
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
      const recorded = await this.core.recordProviderEvent(
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

      return this.core.claimSuccessfulPayment(tx, payment, {
        status: 'SUCCEEDED',
        providerStatus: 'PAID',
        providerPayload: this.core.mergeProviderPayload(
          payment.providerPayload,
          {
            callbackBody: body,
            verifiedAt: new Date().toISOString(),
            verified: true,
            rc: result.rc,
            action: result.action,
            rrn: result.rrn,
            intRef: result.intRef,
            approval: result.approval,
          },
        ) as any,
      });
    });

    await this.core.emitPaymentClaimEvents(payment, claim);

    return this.config.buildPublicMenuReturnUrl(
      {
        restaurantId: payment.restaurantId,
        table: payment.tableSession?.table,
      },
      claim.claimed || payment.status === 'SUCCEEDED'
        ? 'borica-ok'
        : 'borica-cancel',
    );
  }
}
