import type Stripe from 'stripe';

export interface IPaymentProvider {
  createPaymentIntent(params: {
    amountCents: number;
    currency: string;
    restaurantStripeAccountId: string;
    platformFeeCents: number;
    idempotencyKey: string;
    metadata: Record<string, string>;
  }): Promise<{ clientSecret: string; paymentIntentId: string }>;

  constructWebhookEvent(payload: Buffer, signature: string): any;

  createExpressAccount(): Promise<string>;

  createAccountLink(
    accountId: string,
    refreshUrl: string,
    returnUrl: string,
  ): Promise<string>;

  retrieveAccount(accountId: string): Promise<boolean>;

  createRefund(params: {
    paymentIntentId: string;
    amountCents?: number;
    reason?: string;
  }): Promise<{ refundId: string; status: string | null }>;
}
