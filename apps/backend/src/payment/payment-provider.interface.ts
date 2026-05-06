export interface IPaymentProvider {
  createPaymentIntent(params: {
    amountCents: number;
    currency: string;
    restaurantStripeAccountId: string;
    platformFeeCents: number;
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
}
