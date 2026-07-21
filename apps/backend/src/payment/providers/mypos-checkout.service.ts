import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MyposProvider } from '../mypos.provider';
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
import { PAYMENT_AMOUNT_TOLERANCE } from '../payment.constants';

@Injectable()
export class MyposCheckoutService {
  private readonly logger = new Logger(MyposCheckoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mypos: MyposProvider,
    private readonly core: PaymentCoreService,
    private readonly config: PaymentProviderConfigService,
  ) {}

  async createMyposCheckout(
    token: string,
    tipPercent: number,
    checkoutScope?: CheckoutScopeInput,
  ) {
    const normalizedTipPercent = this.core.normalizeTipPercent(tipPercent);
    const session = await this.prisma.tableSession.findFirst({
      where: { token, status: 'OPEN' },
      include: {
        restaurant: true,
        table: { select: { name: true, publicToken: true } },
      },
    });

    if (!session) throw new NotFoundException('Session not found');

    const { restaurant } = session;
    if (!restaurant.paymentsEnabled) {
      throw new ForbiddenException(
        'Payments are not enabled for this restaurant',
      );
    }

    if (!this.config.isMyposConfigured(restaurant)) {
      throw new BadRequestException('myPOS is not configured');
    }

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

    const MYPOS_PENDING_TTL_MS = 15 * 60 * 1000;
    const pendingMypos = existingPayments.find(
      (p) =>
        p.provider === 'MYPOS' &&
        p.status === 'PENDING' &&
        paymentBillScopeEquals(p, candidateBillScope),
    );
    if (pendingMypos) {
      const age =
        Date.now() - new Date((pendingMypos as any).createdAt ?? 0).getTime();
      const checkoutForm = (pendingMypos.providerPayload as any)?.checkoutForm;
      const sameAmount =
        Math.abs((pendingMypos.amount ?? 0) - total) < 0.001 &&
        Math.abs((pendingMypos.tipAmount ?? 0) - tipAmount) < 0.001;
      const sameScope = paymentScopeMatches(
        pendingMypos,
        resolvedCheckoutScope,
      );
      if (
        checkoutForm &&
        sameAmount &&
        sameScope &&
        age < MYPOS_PENDING_TTL_MS
      ) {
        this.core.emitPendingBillPayment(
          this.core.formatPendingPayment({
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
        this.core.emitBillPaymentCleared(
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

    const config = this.config.resolveMyposConfig(restaurant);
    const currency = config.currency;
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
      const orderId = `${orderPrefix}${this.config.createEpayInvoice()}`;
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
          urlOk: this.config.buildPublicMenuReturnUrl(session, 'mypos-ok'),
          urlCancel: this.config.buildPublicMenuReturnUrl(
            session,
            'mypos-cancel',
          ),
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
            provider: 'MYPOS',
            providerReference: orderId,
            providerStatus: 'PENDING',
            providerPayload: this.core.mergeProviderPayload(
              checkoutScopePayload(resolvedCheckoutScope),
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
        if (
          attempt < MAX_ORDER_RETRIES &&
          this.core.isUniqueConstraintError(err)
        ) {
          this.logger.warn(
            `myPOS OrderID collision on attempt ${attempt + 1}, retrying`,
          );
          continue;
        }
        throw err;
      }
    }

    this.core.emitPendingBillPayment(
      this.core.formatPendingPayment({
        id: payment!.id,
        tableSessionId: session.id,
        provider: 'MYPOS',
        providerPayload: checkoutScopePayload(resolvedCheckoutScope),
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

  async handleMyposNotification(
    body: Record<string, unknown>,
  ): Promise<string> {
    const payload: Record<string, string> = {};
    for (const [key, value] of Object.entries(body ?? {})) {
      const payloadValue = Array.isArray(value) ? value[0] : value;
      payload[key] =
        payloadValue == null
          ? ''
          : typeof payloadValue === 'string' ||
              typeof payloadValue === 'number' ||
              typeof payloadValue === 'boolean' ||
              typeof payloadValue === 'bigint'
            ? String(payloadValue)
            : (JSON.stringify(payloadValue) ?? '');
    }

    const orderId = payload.OrderID ?? payload.orderid ?? payload.orderId ?? '';
    if (!orderId) return 'ERR=missing OrderID';

    const payment = await this.prisma.payment.findFirst({
      where: { providerReference: orderId, provider: 'MYPOS' },
      include: {
        restaurant: {
          select: {
            id: true,
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

    const config = this.config.resolveMyposConfig(payment.restaurant);
    const result = this.mypos.verifyNotification(payload, config.publicCertPem);

    if (!result.verified) {
      this.logger.warn('myPOS notify: signature verification failed', {
        orderId,
        paymentId: payment.id,
      });
      return 'ERR=invalid Signature';
    }

    if (result.method !== 'IPCPurchaseNotify') {
      return 'ERR=invalid IPCmethod';
    }

    const notificationAmount = parseFloat(result.amount || '0');
    const amountOk =
      Math.abs(notificationAmount - (payment.amount ?? 0)) <
      PAYMENT_AMOUNT_TOLERANCE;
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

    const providerPayload = this.core.mergeProviderPayload(
      payment.providerPayload,
      {
        notification: payload,
        notifiedAt: new Date().toISOString(),
        transactionRef: result.transactionRef || null,
        requestStan: result.requestStan || null,
        requestDateTime: result.requestDateTime || null,
      },
    );

    const eventKey = [
      orderId,
      result.transactionRef || '',
      result.requestStan || '',
      result.requestDateTime || '',
    ].join(':');

    // #M4: myPOS IPC purchase Status '0' is success; any other value is a
    // decline/reversal/error. A signature-valid non-success notification must be
    // recorded as FAILED, never claimed as a paid bill. (An absent Status is
    // treated as success to preserve behavior for notification variants that
    // omit it — signature + full reconciliation already gate this path.)
    if (result.status && result.status !== '0') {
      this.logger.warn('myPOS notify: non-success purchase status', {
        paymentId: payment.id,
        status: result.status,
      });
      await this.prisma.$transaction(async (tx) => {
        const recorded = await this.core.recordProviderEvent(
          tx,
          PaymentProvider.MYPOS,
          eventKey,
          {
            paymentId: payment.id,
            restaurantId: payment.restaurantId,
            payload: { orderId, status: result.status },
          },
        );
        if (!recorded) return;
        await tx.payment.updateMany({
          where: { id: payment.id, status: 'PENDING' },
          data: { status: 'FAILED', providerStatus: 'DECLINED' },
        });
      });
      return 'OK';
    }

    const claim = await this.prisma.$transaction(async (tx) => {
      const recorded = await this.core.recordProviderEvent(
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

      return this.core.claimSuccessfulPayment(tx, payment, {
        status: 'SUCCEEDED',
        providerStatus: 'PAID',
        providerPayload: providerPayload as any,
      });
    });

    await this.core.emitPaymentClaimEvents(payment, claim);

    return 'OK';
  }
}
