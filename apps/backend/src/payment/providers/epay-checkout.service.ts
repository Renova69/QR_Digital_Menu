import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EpayNotification, EpayPage, EpayProvider } from '../epay.provider';
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
import { decryptSecret } from '../secret-crypto';

@Injectable()
export class EpayCheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly epay: EpayProvider,
    private readonly core: PaymentCoreService,
    private readonly config: PaymentProviderConfigService,
  ) {}

  async createEpayCheckout(
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

    if (!this.config.isEpayConfigured(restaurant)) {
      throw new BadRequestException('ePay.bg is not configured');
    }

    // Charge the REMAINING balance (POS partials may have settled some already).
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

    const pendingEpay = existingPayments.find(
      (p) =>
        p.provider === 'EPAY' &&
        p.status === 'PENDING' &&
        paymentBillScopeEquals(p, candidateBillScope),
    );
    if (pendingEpay) {
      const checkoutForm = (pendingEpay.providerPayload as any)?.checkoutForm;
      const storedExpiry: string | undefined = (
        pendingEpay.providerPayload as any
      )?.expiresAt;
      const notExpired = storedExpiry
        ? new Date(storedExpiry) > new Date()
        : false;
      const sameAmount =
        Math.abs((pendingEpay.amount ?? 0) - total) < 0.001 &&
        Math.abs((pendingEpay.tipAmount ?? 0) - tipAmount) < 0.001;
      const sameScope = paymentScopeMatches(pendingEpay, resolvedCheckoutScope);

      if (checkoutForm && sameAmount && sameScope && notExpired) {
        this.core.emitPendingBillPayment(
          this.core.formatPendingPayment({
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
        this.core.emitBillPaymentCleared(
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
    const expiresAt = this.config.getEpayExpirationDate();
    const invoice = this.config.createEpayInvoice();

    const payment = await this.core.createPendingPaymentAfterScopeGuard(
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
        providerPayload: checkoutScopePayload(resolvedCheckoutScope) as any,
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
      urlOk: this.config.buildPublicMenuReturnUrl(session, 'epay-ok'),
      urlCancel: this.config.buildPublicMenuReturnUrl(session, 'epay-cancel'),
      lang: 'bg',
    });

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        providerPayload: this.core.mergeProviderPayload(
          checkoutScopePayload(resolvedCheckoutScope),
          {
            checkoutForm,
            expiresAt: expiresAt.toISOString(),
          },
        ) as any,
      },
    });

    this.core.emitPendingBillPayment(
      this.core.formatPendingPayment({
        id: payment.id,
        tableSessionId: session.id,
        provider: 'EPAY',
        providerPayload: checkoutScopePayload(resolvedCheckoutScope),
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

  async applyEpayNotification(payment: any, notification: EpayNotification) {
    const eventKey = [
      notification.invoice,
      notification.status,
      notification.stan ?? '',
      notification.bcode ?? '',
    ].join(':');
    const providerPayload = this.core.mergeProviderPayload(
      payment.providerPayload,
      {
        notification,
        notifiedAt: new Date().toISOString(),
      },
    );

    if (notification.status === 'PAID') {
      const claim = await this.prisma.$transaction(async (tx) => {
        const recorded = await this.core.recordProviderEvent(
          tx,
          PaymentProvider.EPAY,
          eventKey,
          {
            paymentId: payment.id,
            restaurantId: payment.restaurantId,
            payload: {
              status: notification.status,
              invoice: notification.invoice,
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
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      const recorded = await this.core.recordProviderEvent(
        tx,
        PaymentProvider.EPAY,
        eventKey,
        {
          paymentId: payment.id,
          restaurantId: payment.restaurantId,
          payload: {
            status: notification.status,
            invoice: notification.invoice,
          },
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
}
