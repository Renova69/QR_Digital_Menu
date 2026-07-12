import { StripeProvider } from './stripe.provider';
import Stripe from 'stripe';

describe('StripeProvider', () => {
  let provider: StripeProvider;
  let mockStripe: {
    paymentIntents: {
      create: jest.Mock;
      retrieve: jest.Mock;
    };
    webhooks: {
      constructEvent: jest.Mock;
    };
    accounts: {
      create: jest.Mock;
      retrieve: jest.Mock;
    };
    accountLinks: {
      create: jest.Mock;
    };
    refunds: {
      create: jest.Mock;
    };
  };

  beforeEach(() => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';
    provider = new StripeProvider();
    mockStripe = {
      paymentIntents: {
        create: jest.fn().mockResolvedValue({
          client_secret: 'cs_test_secret',
          id: 'pi_test_123',
        }),
        retrieve: jest.fn().mockResolvedValue({
          client_secret: 'cs_reused_secret',
          status: 'requires_payment_method',
        }),
      },
      webhooks: {
        constructEvent: jest
          .fn()
          .mockReturnValue({ type: 'payment_intent.succeeded' }),
      },
      accounts: {
        create: jest.fn().mockResolvedValue({ id: 'acct_new' }),
        retrieve: jest.fn().mockResolvedValue({ charges_enabled: true }),
      },
      accountLinks: {
        create: jest
          .fn()
          .mockResolvedValue({ url: 'https://connect.stripe.com/onboard' }),
      },
      refunds: {
        create: jest
          .fn()
          .mockResolvedValue({ id: 're_test', status: 'pending' }),
      },
    };
    Object.defineProperty(provider, 'stripe', { value: mockStripe });
  });

  describe('createPaymentIntent', () => {
    it('creates a PaymentIntent with correct params and returns clientSecret + paymentIntentId', async () => {
      const result = await provider.createPaymentIntent({
        amountCents: 2000,
        currency: 'eur',
        restaurantStripeAccountId: 'acct_123',
        platformFeeCents: 100,
        idempotencyKey: 'pay1',
        metadata: { sessionId: 's1', paymentId: 'p1' },
      });

      expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(
        {
          amount: 2000,
          currency: 'eur',
          automatic_payment_methods: { enabled: true },
          application_fee_amount: 100,
          transfer_data: { destination: 'acct_123' },
          metadata: { sessionId: 's1', paymentId: 'p1' },
        },
        {
          idempotencyKey: 'pay1',
        },
      );
      expect(result).toEqual({
        clientSecret: 'cs_test_secret',
        paymentIntentId: 'pi_test_123',
      });
    });
  });

  describe('retrievePaymentIntent', () => {
    it('returns the client secret when Stripe returns the intent', async () => {
      const result = await provider.retrievePaymentIntent('pi_existing');

      expect(mockStripe.paymentIntents.retrieve).toHaveBeenCalledWith(
        'pi_existing',
      );
      expect(result).toEqual({
        clientSecret: 'cs_reused_secret',
        status: 'requires_payment_method',
      });
    });

    it('returns null only when Stripe reports the intent is missing', async () => {
      mockStripe.paymentIntents.retrieve.mockRejectedValue({
        code: 'resource_missing',
        statusCode: 404,
      });

      await expect(
        provider.retrievePaymentIntent('pi_missing'),
      ).resolves.toBeNull();
    });

    it('rethrows transient Stripe retrieve errors', async () => {
      const stripeError = new Error('stripe timeout');
      mockStripe.paymentIntents.retrieve.mockRejectedValue(stripeError);

      await expect(
        provider.retrievePaymentIntent('pi_existing'),
      ).rejects.toThrow('stripe timeout');
    });
  });

  describe('createRefund', () => {
    it('persists immutable application correlation metadata on Stripe', async () => {
      const result = await provider.createRefund({
        paymentIntentId: 'pi_123',
        amountCents: 2400,
        reason: 'guest request',
        refundAttemptId: 'ra_123',
        idempotencyKey: 'refund_pay_123',
      });

      expect(mockStripe.refunds.create).toHaveBeenCalledWith(
        {
          payment_intent: 'pi_123',
          amount: 2400,
          reason: 'requested_by_customer',
          metadata: {
            refundAttemptId: 'ra_123',
            reason: 'guest request',
          },
        },
        { idempotencyKey: 'refund_pay_123' },
      );
      expect(result).toEqual({ refundId: 're_test', status: 'pending' });
    });
  });

  describe('constructWebhookEvent', () => {
    it('delegates to stripe.webhooks.constructEvent and returns the event', () => {
      const payload = Buffer.from('{}');
      const sig = 'sig_test';
      const result = provider.constructWebhookEvent(payload, sig);
      expect(mockStripe.webhooks.constructEvent).toHaveBeenCalledWith(
        payload,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET || '',
      );
      expect(result.type).toBe('payment_intent.succeeded');
    });
  });

  describe('createExpressAccount', () => {
    it('creates a Stripe Express account and returns the id', async () => {
      const result = await provider.createExpressAccount();
      expect(mockStripe.accounts.create).toHaveBeenCalledWith({
        type: 'express',
      });
      expect(result).toBe('acct_new');
    });
  });

  describe('createAccountLink', () => {
    it('creates an account link and returns the url', async () => {
      const result = await provider.createAccountLink(
        'acct_123',
        'https://refresh',
        'https://return',
      );
      expect(mockStripe.accountLinks.create).toHaveBeenCalledWith({
        account: 'acct_123',
        refresh_url: 'https://refresh',
        return_url: 'https://return',
        type: 'account_onboarding',
      });
      expect(result).toBe('https://connect.stripe.com/onboard');
    });
  });

  describe('retrieveAccount', () => {
    it('retrieves a Stripe account and returns charges_enabled', async () => {
      const result = await provider.retrieveAccount('acct_123');
      expect(mockStripe.accounts.retrieve).toHaveBeenCalledWith('acct_123');
      expect(result).toBe(true);
    });
  });

  describe('onModuleInit', () => {
    it('warns when STRIPE_SECRET_KEY is not set', () => {
      const saved = process.env.STRIPE_SECRET_KEY;
      delete process.env.STRIPE_SECRET_KEY;
      const p = new StripeProvider();
      const warnSpy = jest
        .spyOn(p['logger'], 'warn')
        .mockImplementation(() => {});
      p.onModuleInit();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('STRIPE_SECRET_KEY'),
      );
      process.env.STRIPE_SECRET_KEY = saved;
    });

    it('warns when STRIPE_WEBHOOK_SECRET is "NONE"', () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_set';
      process.env.STRIPE_WEBHOOK_SECRET = 'NONE';
      const p = new StripeProvider();
      const warnSpy = jest
        .spyOn(p['logger'], 'warn')
        .mockImplementation(() => {});
      p.onModuleInit();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('STRIPE_WEBHOOK_SECRET'),
      );
    });

    it('warns when STRIPE_WEBHOOK_SECRET is empty', () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_set';
      process.env.STRIPE_WEBHOOK_SECRET = '';
      const p = new StripeProvider();
      const warnSpy = jest
        .spyOn(p['logger'], 'warn')
        .mockImplementation(() => {});
      p.onModuleInit();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('STRIPE_WEBHOOK_SECRET'),
      );
    });
  });

  describe('onModuleInit (production hard-fail #H2)', () => {
    const savedEnv = { ...process.env };
    afterEach(() => {
      process.env.NODE_ENV = savedEnv.NODE_ENV;
      process.env.STRIPE_SECRET_KEY = savedEnv.STRIPE_SECRET_KEY;
      process.env.STRIPE_WEBHOOK_SECRET = savedEnv.STRIPE_WEBHOOK_SECRET;
    });

    it('throws when STRIPE_WEBHOOK_SECRET is missing in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.STRIPE_SECRET_KEY = 'sk_live_set';
      process.env.STRIPE_WEBHOOK_SECRET = '';
      const p = new StripeProvider();
      expect(() => p.onModuleInit()).toThrow(/STRIPE_WEBHOOK_SECRET/);
    });

    it('throws when STRIPE_SECRET_KEY is missing in production', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.STRIPE_SECRET_KEY;
      process.env.STRIPE_WEBHOOK_SECRET = 'whsec_live';
      const p = new StripeProvider();
      expect(() => p.onModuleInit()).toThrow(/STRIPE_SECRET_KEY/);
    });
  });

  describe('constructWebhookEvent (production refuses unverified #H2)', () => {
    const savedEnv = { ...process.env };
    afterEach(() => {
      process.env.NODE_ENV = savedEnv.NODE_ENV;
      process.env.STRIPE_WEBHOOK_SECRET = savedEnv.STRIPE_WEBHOOK_SECRET;
    });

    it('throws instead of JSON-parsing when no secret in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.STRIPE_WEBHOOK_SECRET = '';
      const p = new StripeProvider();
      expect(() => p.constructWebhookEvent(Buffer.from('{}'), 'sig')).toThrow(
        /unverified/,
      );
    });
  });

  describe('constructWebhookEvent (dev mode)', () => {
    it('parses payload as JSON when webhookSecret is empty (no Stripe verification)', () => {
      process.env.STRIPE_WEBHOOK_SECRET = '';
      const devProvider = new StripeProvider();
      const payload = Buffer.from(JSON.stringify({ type: 'test_event' }));

      const result = devProvider.constructWebhookEvent(payload, 'any-sig');

      expect(result).toEqual({ type: 'test_event' });
    });
  });
});
