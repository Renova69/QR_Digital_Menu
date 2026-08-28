import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { IPaymentProvider } from './payment-provider.interface';
import { createStripeHttpClient } from '../common/http/stripe-http-client';

export type StripeWebhookEvent = ReturnType<
  InstanceType<typeof Stripe>['webhooks']['constructEvent']
>;

@Injectable()
export class StripeProvider implements IPaymentProvider, OnModuleInit {
  private readonly stripe: InstanceType<typeof Stripe>;
  private readonly webhookSecret: string;
  private readonly logger = new Logger(StripeProvider.name);

  constructor() {
    this.stripe = new Stripe(
      process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder',
      {
        apiVersion: '2026-05-27.dahlia',
        // P1-4: the SDK defaults to an 80s timeout with 2 retries, so a
        // degraded Stripe could hold a Cloud Run request slot for four
        // minutes. Money calls still need room to answer, hence 15s rather
        // than something tighter, but one retry rather than two keeps the
        // background worst case bounded at ~30s. Foreground attempts also
        // share the shorter overall request deadline via the HTTP adapter.
        timeout: 15_000,
        maxNetworkRetries: 1,
        httpClient: createStripeHttpClient(),
      },
    );
    this.webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
  }

  private get hasWebhookSecret() {
    return !!this.webhookSecret && this.webhookSecret !== 'NONE';
  }

  onModuleInit() {
    const isProduction = process.env.NODE_ENV === 'production';

    if (!process.env.STRIPE_SECRET_KEY) {
      if (isProduction) {
        throw new Error(
          'STRIPE_SECRET_KEY must be set in production. Refusing to start.',
        );
      }
      this.logger.warn('STRIPE_SECRET_KEY is not set — Stripe calls will fail');
    }

    if (!this.hasWebhookSecret) {
      if (isProduction) {
        // Without signature verification, anyone reaching the webhook endpoint
        // could forge payment_intent.succeeded and mark sessions paid (#H2).
        throw new Error(
          'STRIPE_WEBHOOK_SECRET must be set in production. Refusing to start with unverified webhooks.',
        );
      }
      this.logger.warn(
        'STRIPE_WEBHOOK_SECRET is not set — webhook signature verification will fail',
      );
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
    const intent = await this.stripe.paymentIntents.create(
      {
        amount: params.amountCents,
        currency: params.currency,
        automatic_payment_methods: { enabled: true },
        application_fee_amount: params.platformFeeCents,
        transfer_data: { destination: params.restaurantStripeAccountId },
        metadata: params.metadata,
      },
      {
        idempotencyKey: params.idempotencyKey,
      },
    );
    return { clientSecret: intent.client_secret!, paymentIntentId: intent.id };
  }

  async cancelPaymentIntent(
    paymentIntentId: string,
    cancellationReason:
      | 'abandoned'
      | 'duplicate'
      | 'fraudulent'
      | 'requested_by_customer' = 'abandoned',
  ): Promise<void> {
    await this.stripe.paymentIntents.cancel(paymentIntentId, {
      cancellation_reason: cancellationReason,
    });
  }

  private isResourceMissingError(err: unknown): boolean {
    const stripeError = err as {
      code?: string;
      statusCode?: number;
      raw?: { code?: string; statusCode?: number };
    };
    return (
      stripeError?.code === 'resource_missing' ||
      stripeError?.raw?.code === 'resource_missing' ||
      stripeError?.statusCode === 404 ||
      stripeError?.raw?.statusCode === 404
    );
  }

  async retrievePaymentIntent(
    paymentIntentId: string,
  ): Promise<{ clientSecret: string | null; status: string | null } | null> {
    try {
      const intent = await this.stripe.paymentIntents.retrieve(paymentIntentId);
      return {
        clientSecret: intent.client_secret ?? null,
        status: intent.status ?? null,
      };
    } catch (err) {
      if (this.isResourceMissingError(err)) {
        this.logger.warn(
          `PaymentIntent ${paymentIntentId} was not found in Stripe`,
        );
        return null;
      }

      this.logger.warn(
        `Failed to retrieve PaymentIntent ${paymentIntentId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      throw err;
    }
  }

  constructWebhookEvent(
    payload: Buffer,
    signature: string,
  ): StripeWebhookEvent {
    if (!this.hasWebhookSecret) {
      // Production boot is blocked when the secret is missing (see onModuleInit),
      // so this unverified branch can only run in dev/test. Never trust an
      // unsigned webhook in production.
      if (process.env.NODE_ENV === 'production') {
        throw new Error(
          'Refusing to process unverified Stripe webhook in production',
        );
      }
      // Dev mode: no signature verification — set STRIPE_WEBHOOK_SECRET via Stripe CLI for production
      return JSON.parse(payload.toString()) as StripeWebhookEvent;
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
    refundAttemptId: string;
    idempotencyKey?: string;
  }): Promise<{ refundId: string; status: string | null }> {
    const refund = await this.stripe.refunds.create(
      {
        payment_intent: params.paymentIntentId,
        ...(params.amountCents ? { amount: params.amountCents } : {}),
        // M-PAY-4: Stripe's typed `reason` (duplicate/fraudulent/requested_by_customer)
        // feeds its dispute/fraud tooling — free text in metadata alone doesn't.
        // This dashboard flow doesn't yet support restaurant-chosen classification,
        // so every refund here is an ordinary restaurant-initiated refund.
        reason: 'requested_by_customer',
        // F-PAY-1: the application attempt id is the immutable webhook
        // correlation key. A PaymentIntent can have multiple/manual/partial
        // refunds, so the intent id alone is never enough to identify which
        // application attempt an event belongs to.
        metadata: {
          refundAttemptId: params.refundAttemptId,
          ...(params.reason ? { reason: params.reason } : {}),
        },
      },
      // F-PAY-1: idempotency key so a client retry after a lost/timed-out
      // response reconciles to the same refund instead of creating a second
      // one — the underlying failure mode this endpoint must not risk.
      params.idempotencyKey
        ? { idempotencyKey: params.idempotencyKey }
        : undefined,
    );

    return { refundId: refund.id, status: refund.status ?? null };
  }

  /**
   * F-PAY-1 reconciliation: fetch the authoritative status of one specific
   * refund by its id. Used by the reconciliation cron when a refund attempt is
   * stuck PENDING but we already recorded the provider refund id — we ask
   * Stripe about that exact refund rather than guessing among the intent's
   * refunds. Returns null if the refund no longer exists at Stripe.
   */
  async retrieveRefund(
    refundId: string,
  ): Promise<{ refundId: string; status: string | null } | null> {
    try {
      const refund = await this.stripe.refunds.retrieve(refundId);
      return { refundId: refund.id, status: refund.status ?? null };
    } catch (err) {
      if (this.isResourceMissingError(err)) {
        this.logger.warn(`Refund ${refundId} was not found in Stripe`);
        return null;
      }
      throw err;
    }
  }
}
