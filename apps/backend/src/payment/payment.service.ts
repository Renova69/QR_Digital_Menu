import { Injectable } from '@nestjs/common';
import { PaymentHistoryQueryDto } from './dto/payment-history-query.dto';
import { SettlePartialDto } from './dto/settle-partial.dto';
import { CheckoutScopeInput } from './payment-scope.utils';
import { BoricaCardholderInput, CheckoutProvider } from './payment.types';
import { PaymentSessionService } from './session/payment-session.service';
import { PaymentSettlementService } from './session/payment-settlement.service';
import { PaymentReportingService } from './reporting/payment-reporting.service';
import { StripeCheckoutService } from './providers/stripe-checkout.service';
import { EpayCheckoutService } from './providers/epay-checkout.service';
import { MyposCheckoutService } from './providers/mypos-checkout.service';
import { BoricaCheckoutService } from './providers/borica-checkout.service';

@Injectable()
export class PaymentService {
  constructor(
    private readonly sessions: PaymentSessionService,
    private readonly settlement: PaymentSettlementService,
    private readonly reporting: PaymentReportingService,
    private readonly stripeCheckout: StripeCheckoutService,
    private readonly epayCheckout: EpayCheckoutService,
    private readonly myposCheckout: MyposCheckoutService,
    private readonly boricaCheckout: BoricaCheckoutService,
  ) {}

  cleanupAbandonedPaymentsAndStaleSessions() {
    return this.sessions.cleanupAbandonedPaymentsAndStaleSessions();
  }

  getOrCreateSession(tableId: string, restaurantId: string, sessionToken?: string) {
    return this.sessions.getOrCreateSession(tableId, restaurantId, sessionToken);
  }

  getSessionBill(token: string) {
    return this.sessions.getSessionBill(token);
  }

  createCashPaymentRequest(token: string, restaurantId: string, scopeInput?: CheckoutScopeInput) {
    return this.settlement.createCashPaymentRequest(token, restaurantId, scopeInput);
  }

  listCashPaymentRequests(restaurantId: string, userId: string, status?: string) {
    return this.settlement.listCashPaymentRequests(restaurantId, userId, status);
  }

  confirmCashPaymentRequest(requestId: string, userId: string) {
    return this.settlement.confirmCashPaymentRequest(requestId, userId);
  }

  cancelCashPaymentRequest(requestId: string, userId: string) {
    return this.settlement.cancelCashPaymentRequest(requestId, userId);
  }

  abandonCheckout(token: string) {
    return this.sessions.abandonCheckout(token);
  }

  createCheckout(
    token: string,
    provider: CheckoutProvider,
    tipPercent: number,
    boricaCardholder?: BoricaCardholderInput,
    checkoutScope?: CheckoutScopeInput,
  ) {
    if (provider === 'STRIPE') {
      return this.stripeCheckout.createPaymentIntent(token, tipPercent, checkoutScope).then((stripeCheckout) => ({
        provider: 'STRIPE' as const,
        ...stripeCheckout,
      }));
    }
    if (provider === 'EPAY') return this.epayCheckout.createEpayCheckout(token, tipPercent, checkoutScope);
    if (provider === 'MYPOS') return this.myposCheckout.createMyposCheckout(token, tipPercent, checkoutScope);
    if (provider === 'BORICA') return this.boricaCheckout.createBoricaCheckout(token, tipPercent, boricaCardholder, checkoutScope);
    return this.stripeCheckout.createPaymentIntent(token, tipPercent, checkoutScope).then((stripeCheckout) => ({
      provider: 'STRIPE' as const,
      ...stripeCheckout,
    }));
  }

  createPaymentIntent(token: string, tipPercent: number, checkoutScope?: CheckoutScopeInput) {
    return this.stripeCheckout.createPaymentIntent(token, tipPercent, checkoutScope);
  }

  handleBoricaCallback(body: Record<string, string>) {
    return this.boricaCheckout.handleBoricaCallback(body);
  }

  handleEpayNotification(body: { ENCODED?: string; CHECKSUM?: string; encoded?: string; checksum?: string }) {
    return this.epayCheckout.handleEpayNotification(body);
  }

  handleMyposNotification(body: Record<string, unknown>) {
    return this.myposCheckout.handleMyposNotification(body);
  }

  handleWebhookEvent(payload: Buffer, signature: string) {
    return this.stripeCheckout.handleWebhookEvent(payload, signature);
  }

  closeSession(token: string, restaurantId: string, userId: string) {
    return this.sessions.closeSession(token, restaurantId, userId);
  }

  closeSessionWithCard(token: string, restaurantId: string, userId: string) {
    return this.sessions.closeSessionWithCard(token, restaurantId, userId);
  }

  closeSessionWithCash(token: string, restaurantId: string, userId: string) {
    return this.sessions.closeSessionWithCash(token, restaurantId, userId);
  }

  settlePartial(token: string, restaurantId: string, userId: string, dto: SettlePartialDto) {
    return this.settlement.settlePartial(token, restaurantId, userId, dto);
  }

  forceOpenSession(tableId: string, restaurantId: string, userId: string) {
    return this.sessions.forceOpenSession(tableId, restaurantId, userId);
  }

  getTableSessions(restaurantId: string, page: number | undefined, limit: number | undefined, userId: string) {
    return this.reporting.getTableSessions(restaurantId, page, limit, userId);
  }

  getPaymentHistory(restaurantId: string, query: PaymentHistoryQueryDto, userId: string) {
    return this.reporting.getPaymentHistory(restaurantId, query, userId);
  }

  exportPayments(restaurantId: string, userId: string, range: { from?: string; to?: string }) {
    return this.reporting.exportPayments(restaurantId, userId, range);
  }

  getPaymentsOverview(restaurantId: string, userId: string, filters: { startDate?: string; endDate?: string } = {}) {
    return this.reporting.getPaymentsOverview(restaurantId, userId, filters);
  }

  getPaymentDetail(paymentId: string, userId: string) {
    return this.reporting.getPaymentDetail(paymentId, userId);
  }

  getPayoutsSnapshot(restaurantId: string, userId: string) {
    return this.reporting.getPayoutsSnapshot(restaurantId, userId);
  }

  getPaymentSettings(restaurantId: string, userId: string) {
    return this.reporting.getPaymentSettings(restaurantId, userId);
  }

  refundPayment(paymentId: string, userId: string, data: { amount?: number; reason?: string }) {
    return this.stripeCheckout.refundPayment(paymentId, userId, data);
  }
}
