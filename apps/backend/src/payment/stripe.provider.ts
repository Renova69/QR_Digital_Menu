import { Injectable } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const StripeLib = require('stripe');
import { IPaymentProvider } from './payment-provider.interface';

@Injectable()
export class StripeProvider implements IPaymentProvider {
  private readonly stripe: any;

  constructor() {
    this.stripe = new StripeLib(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');
  }

  async createPaymentIntent(params: {
    amountCents: number;
    currency: string;
    restaurantStripeAccountId: string;
    platformFeeCents: number;
    metadata: Record<string, string>;
  }): Promise<{ clientSecret: string; paymentIntentId: string }> {
    const intent = await this.stripe.paymentIntents.create({
      amount: params.amountCents,
      currency: params.currency,
      automatic_payment_methods: { enabled: true },
      application_fee_amount: params.platformFeeCents,
      transfer_data: { destination: params.restaurantStripeAccountId },
      metadata: params.metadata,
    });
    return { clientSecret: intent.client_secret!, paymentIntentId: intent.id };
  }

  constructWebhookEvent(payload: Buffer, signature: string): any {
    return this.stripe.webhooks.constructEvent(
      payload,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET,
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
}
