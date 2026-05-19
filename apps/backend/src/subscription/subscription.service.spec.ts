// mock-prefixed variables are allowed in jest.mock factory closures (Jest hoisting exception)
const mockConstructEvent = jest.fn();
const mockCheckoutCreate = jest.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/pay/test' });
const mockCustomersCreate = jest.fn().mockResolvedValue({ id: 'cus_new' });
const mockPortalCreate = jest.fn().mockResolvedValue({ url: 'https://billing.stripe.com/portal/test' });

jest.mock('stripe', () =>
  jest.fn().mockImplementation(() => ({
    customers: { create: mockCustomersCreate },
    checkout: { sessions: { create: mockCheckoutCreate } },
    billingPortal: { sessions: { create: mockPortalCreate } },
    webhooks: { constructEvent: mockConstructEvent },
  })),
);

jest.mock('../prisma/prisma.service', () => ({ PrismaService: jest.fn() }));

import { Test, TestingModule } from '@nestjs/testing';
import { SubscriptionService } from './subscription.service';
import { PrismaService } from '../prisma/prisma.service';

describe('SubscriptionService', () => {
  let service: SubscriptionService;
  let prisma: {
    restaurant: {
      findUniqueOrThrow: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    user: { findUniqueOrThrow: jest.Mock };
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    prisma = {
      restaurant: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ stripeCustomerId: 'cus_test' }),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      user: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ email: 'owner@test.com' }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<SubscriptionService>(SubscriptionService);
  });

  // ─── createCheckoutSession ───────────────────────────────────────────────────
  // NOTE: PRICE_MAP is evaluated at module load time from process.env.
  // In test environment all STRIPE_PRICE_* vars are unset → all entries are ''.
  // Consequently createCheckoutSession always throws for any tier in CI — we
  // only test the guard branch here; success paths require module isolation.

  describe('createCheckoutSession', () => {
    it('throws when no Stripe price is configured for the tier', async () => {
      await expect(
        service.createCheckoutSession('rest1', 'STARTER', 'monthly', 'owner1'),
      ).rejects.toThrow('No Stripe price configured for tier STARTER');
    });

    it('throws for ENTERPRISE tier when price env var is absent', async () => {
      await expect(
        service.createCheckoutSession('rest1', 'ENTERPRISE', 'monthly', 'owner1'),
      ).rejects.toThrow('No Stripe price configured for tier ENTERPRISE');
    });
  });

  // ─── createPortalSession ─────────────────────────────────────────────────────

  describe('createPortalSession', () => {
    it('throws when restaurant has no Stripe customer', async () => {
      prisma.restaurant.findUniqueOrThrow.mockResolvedValue({ stripeCustomerId: null });

      await expect(service.createPortalSession('rest1')).rejects.toThrow('No Stripe customer');
    });

    it('returns portal URL for restaurant with Stripe customer', async () => {
      prisma.restaurant.findUniqueOrThrow.mockResolvedValue({ stripeCustomerId: 'cus_test' });

      const result = await service.createPortalSession('rest1');

      expect(result.url).toBe('https://billing.stripe.com/portal/test');
      expect(mockPortalCreate).toHaveBeenCalledWith(
        expect.objectContaining({ customer: 'cus_test' }),
      );
    });
  });

  // ─── handleWebhook ───────────────────────────────────────────────────────────

  describe('handleWebhook', () => {
    it('rejects invalid Stripe signature (throws)', async () => {
      mockConstructEvent.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      await expect(
        service.handleWebhook(Buffer.from('{}'), 'bad_sig'),
      ).rejects.toThrow('Invalid signature');
    });

    it('processes checkout.session.completed event and updates tier', async () => {
      mockConstructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            customer: 'cus_test',
            subscription: 'sub_abc',
            metadata: { tier: 'PROFESSIONAL' },
          },
        },
      });

      const result = await service.handleWebhook(Buffer.from('{}'), 'valid_sig');

      expect(result).toEqual({ received: true });
      expect(prisma.restaurant.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tier: 'PROFESSIONAL', stripeSubscriptionId: 'sub_abc' }),
        }),
      );
    });

    it('processes customer.subscription.updated event and defaults unrecognised price to FREE', async () => {
      // PRICE_MAP is evaluated at module load time; env vars set in tests have no effect.
      // getTierFromPrice therefore returns 'FREE' for any price ID — that is the expected behaviour.
      mockConstructEvent.mockReturnValue({
        type: 'customer.subscription.updated',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: 'sub_updated',
            customer: 'cus_test',
            items: { data: [{ price: { id: 'price_starter_xyz' } }] },
          },
        },
      });

      const result = await service.handleWebhook(Buffer.from('{}'), 'valid_sig');

      expect(result).toEqual({ received: true });
      expect(prisma.restaurant.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tier: 'FREE', stripeSubscriptionId: 'sub_updated' }),
        }),
      );
    });

    it('processes customer.subscription.deleted and resets to FREE', async () => {
      mockConstructEvent.mockReturnValue({
        type: 'customer.subscription.deleted',
        created: Math.floor(Date.now() / 1000),
        data: { object: { customer: 'cus_test' } },
      });

      const result = await service.handleWebhook(Buffer.from('{}'), 'valid_sig');

      expect(result).toEqual({ received: true });
      expect(prisma.restaurant.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tier: 'FREE', stripeSubscriptionId: null }),
        }),
      );
    });

    it('returns received:true for unrecognised event types (no-op)', async () => {
      mockConstructEvent.mockReturnValue({
        type: 'payment_intent.created',
        created: Math.floor(Date.now() / 1000),
        data: { object: {} },
      });

      const result = await service.handleWebhook(Buffer.from('{}'), 'valid_sig');

      expect(result).toEqual({ received: true });
      expect(prisma.restaurant.updateMany).not.toHaveBeenCalled();
    });

    it('timestamp-gate: updateMany where clause prevents stale event application', async () => {
      mockConstructEvent.mockReturnValue({
        type: 'customer.subscription.deleted',
        created: Math.floor(Date.now() / 1000),
        data: { object: { customer: 'cus_test' } },
      });

      await service.handleWebhook(Buffer.from('{}'), 'valid_sig');

      expect(prisma.restaurant.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { tierUpdatedAt: null },
              { tierUpdatedAt: expect.objectContaining({ lt: expect.any(Date) }) },
            ]),
          }),
        }),
      );
    });
  });
});
