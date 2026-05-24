import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { IPaymentProvider } from './payment-provider.interface';

@Injectable()
export class StripeProvider implements IPaymentProvider, OnModuleInit {
  private readonly stripe: InstanceType<typeof Stripe>;
  private readonly webhookSecret: string;
  private readonly logger = new Logger(StripeProvider.name);

  constructor() {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder', {
      apiVersion: '2026-04-22.dahlia',
    });
    this.webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
  }

  onModuleInit() {
    if (!process.env.STRIPE_SECRET_KEY) {
      this.logger.warn('STRIPE_SECRET_KEY is not set — Stripe calls will fail');
    }
    if (!this.webhookSecret || this.webhookSecret === 'NONE') {
      this.logger.warn('STRIPE_WEBHOOK_SECRET is not set — webhook signature verification will fail');
    }
  }

  async createPaymentIntent(params: {
    amountCents: number;
    currency: string;
    restaurantStripeAccountId: string;
    platformFeeCents: number;
    idempotencyKey: string;
    metadata: Record<string, string>;
  }): Promise<{ clientSecret: string; paymentIntentId: string }> {
    const intent = await this.stripe.paymentIntents.create({
      amount: params.amountCents,
      currency: params.currency,
      automatic_payment_methods: { enabled: true },
      application_fee_amount: params.platformFeeCents,
      transfer_data: { destination: params.restaurantStripeAccountId },
      metadata: params.metadata,
    }, {
      idempotencyKey: params.idempotencyKey,
    });
    return { clientSecret: intent.client_secret!, paymentIntentId: intent.id };
  }

  constructWebhookEvent(payload: Buffer, signature: string): any {
    if (!this.webhookSecret || this.webhookSecret === 'NONE') {
      // Dev mode: no signature verification — set STRIPE_WEBHOOK_SECRET via Stripe CLI for production
      return JSON.parse(payload.toString());
    }
    return this.stripe.webhooks.constructEvent(
      payload,
      signature,
      this.webhookSecret,
    );
  }

  async createExpressAccount(): Promise<string> {
    const account = await this.stripe.accounts.create({ type: 'express' });
    return account.id;
  }

  async createAccountLink(
    accountId: string,
    refreshUrl: string,
    returnUrl: string,
  ): Promise<string> {
    const link = await this.stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: 'account_onboarding',
    });
    return link.url;
  }

  async retrieveAccount(accountId: string): Promise<boolean> {
    const account = await this.stripe.accounts.retrieve(accountId);
    return account.charges_enabled;
  }

  async createRefund(params: {
    paymentIntentId: string;
    amountCents?: number;
    reason?: string;
  }): Promise<{ refundId: string; status: string | null }> {
    const refund = await this.stripe.refunds.create({
      payment_intent: params.paymentIntentId,
      ...(params.amountCents ? { amount: params.amountCents } : {}),
      ...(params.reason ? { metadata: { reason: params.reason } } : {}),
    });

    return { refundId: refund.id, status: refund.status ?? null };
  }
}
