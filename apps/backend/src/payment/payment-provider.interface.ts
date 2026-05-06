export interface IPaymentProvider {
  createPaymentIntent(params: {
    amountCents: number;
    currency: string;
    restaurantStripeAccountId: string;
    platformFeeCents: number;
    metadata: Record<string, string>;
  }): Promise<{ clientSecret: string; paymentIntentId: string }>;

  constructWebhookEvent(payload: Buffer, signature: string): any;
}
