import { StripeProvider } from './stripe.provider';

describe('StripeProvider', () => {
  let provider: StripeProvider;
  let mockStripe: any;

  beforeEach(() => {
    provider = new StripeProvider();
    mockStripe = {
      paymentIntents: {
        create: jest.fn().mockResolvedValue({
          client_secret: 'cs_test_secret',
          id: 'pi_test_123',
        }),
      },
      webhooks: {
        constructEvent: jest.fn().mockReturnValue({ type: 'payment_intent.succeeded' }),
      },
      accounts: {
        create: jest.fn().mockResolvedValue({ id: 'acct_new' }),
        retrieve: jest.fn().mockResolvedValue({ charges_enabled: true }),
      },
      accountLinks: {
        create: jest.fn().mockResolvedValue({ url: 'https://connect.stripe.com/onboard' }),
      },
    };
    (provider as any).stripe = mockStripe;
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

      expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith({
        amount: 2000,
        currency: 'eur',
        automatic_payment_methods: { enabled: true },
        application_fee_amount: 100,
        transfer_data: { destination: 'acct_123' },
        metadata: { sessionId: 's1', paymentId: 'p1' },
      }, {
        idempotencyKey: 'pay1',
      });
      expect(result).toEqual({ clientSecret: 'cs_test_secret', paymentIntentId: 'pi_test_123' });
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
      expect(mockStripe.accounts.create).toHaveBeenCalledWith({ type: 'express' });
      expect(result).toBe('acct_new');
    });
  });

  describe('createAccountLink', () => {
    it('creates an account link and returns the url', async () => {
      const result = await provider.createAccountLink('acct_123', 'https://refresh', 'https://return');
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
});
