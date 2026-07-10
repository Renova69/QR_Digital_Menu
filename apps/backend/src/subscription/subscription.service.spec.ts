// mock-prefixed variables are allowed in jest.mock factory closures (Jest hoisting exception)
const mockConstructEvent = jest.fn();
const mockCheckoutCreate = jest
  .fn()
  .mockResolvedValue({ url: 'https://checkout.stripe.com/pay/test' });
const mockCustomersCreate = jest.fn().mockResolvedValue({ id: 'cus_new' });
const mockPortalCreate = jest
  .fn()
  .mockResolvedValue({ url: 'https://billing.stripe.com/portal/test' });
const mockSessionRetrieve = jest.fn();
const mockSubscriptionsList = jest.fn().mockResolvedValue({ data: [] });
const mockSubscriptionRetrieve = jest.fn();

jest.mock('stripe', () =>
  jest.fn().mockImplementation(() => ({
    customers: { create: mockCustomersCreate },
    checkout: {
      sessions: { create: mockCheckoutCreate, retrieve: mockSessionRetrieve },
    },
    billingPortal: { sessions: { create: mockPortalCreate } },
    subscriptions: {
      list: mockSubscriptionsList,
      retrieve: mockSubscriptionRetrieve,
    },
    webhooks: { constructEvent: mockConstructEvent },
  })),
);

jest.mock('../prisma/prisma.service', () => ({ PrismaService: jest.fn() }));

import {
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { SubscriptionService } from './subscription.service';
import { PrismaService } from '../prisma/prisma.service';

// Price ids the mock ConfigService hands back. After the M-7 fix PRICE_MAP is
// built in the constructor from ConfigService, so these are picked up per-test
// instead of being frozen to '' at module load.
const PRICE_IDS: Record<string, string> = {
  STRIPE_PRICE_STARTER_MONTHLY: 'price_starter_m',
  STRIPE_PRICE_STARTER_YEARLY: 'price_starter_y',
  STRIPE_PRICE_PROFESSIONAL_MONTHLY: 'price_pro_m',
  STRIPE_PRICE_PROFESSIONAL_YEARLY: 'price_pro_y',
  STRIPE_PRICE_ENTERPRISE_MONTHLY: 'price_ent_m',
  STRIPE_PRICE_ENTERPRISE_YEARLY: 'price_ent_y',
};

describe('SubscriptionService', () => {
  let service: SubscriptionService;
  let prisma: {
    restaurant: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    adminAuditLog: { create: jest.Mock; createMany: jest.Mock };
    $queryRaw: jest.Mock;
    $transaction: jest.Mock;
    user: { findUniqueOrThrow: jest.Mock };
  };

  const configMock = {
    get: jest.fn(
      (key: string, fallback?: string) => PRICE_IDS[key] ?? fallback ?? '',
    ),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockSubscriptionsList.mockResolvedValue({ data: [] });
    mockSubscriptionRetrieve.mockResolvedValue({
      id: 'sub_abc',
      items: { data: [{ price: { id: 'price_pro_m' } }] },
    });
    process.env.STRIPE_SUBSCRIPTION_WEBHOOK_SECRET = 'whsec_test';

    prisma = {
      restaurant: {
        findUnique: jest.fn().mockResolvedValue({
          stripeCustomerId: 'cus_test',
          ownerId: 'owner1',
        }),
        findFirst: jest.fn().mockResolvedValue({ ownerId: 'owner1' }),
        findMany: jest.fn().mockResolvedValue([]),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          stripeCustomerId: 'cus_test',
          ownerId: 'owner1',
        }),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      adminAuditLog: {
        create: jest.fn().mockResolvedValue({}),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn().mockImplementation((arg: unknown) => {
        if (typeof arg === 'function')
          return (arg as (tx: typeof prisma) => Promise<unknown>)(prisma);
        return Promise.all(arg as unknown[]);
      }),
      user: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ email: 'owner@test.com' }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();

    service = module.get<SubscriptionService>(SubscriptionService);
  });

  // ─── createCheckoutSession (M-7) ─────────────────────────────────────────────
  // PRICE_MAP is now built in the constructor from ConfigService, so the mock
  // ConfigService above supplies real price ids and the success path is testable.

  describe('createCheckoutSession', () => {
    it('throws ForbiddenException when user does not own the restaurant', async () => {
      prisma.restaurant.findUniqueOrThrow.mockResolvedValue({
        stripeCustomerId: 'cus_test',
        ownerId: 'other_owner',
      });

      await expect(
        service.createCheckoutSession('rest1', 'STARTER', 'monthly', 'owner1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('uses the configured STARTER monthly price and returns the checkout URL', async () => {
      prisma.restaurant.findUniqueOrThrow.mockResolvedValue({
        stripeCustomerId: 'cus_test',
        ownerId: 'owner1',
      });
      const result = await service.createCheckoutSession(
        'rest1',
        'STARTER',
        'monthly',
        'owner1',
      );

      expect(result.url).toBe('https://checkout.stripe.com/pay/test');
      expect(mockCheckoutCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          line_items: [
            { price: PRICE_IDS.STRIPE_PRICE_STARTER_MONTHLY, quantity: 1 },
          ],
          metadata: expect.objectContaining({
            restaurantId: 'rest1',
            tier: 'STARTER',
          }),
        }),
      );
    });

    it('uses the configured ENTERPRISE yearly price for yearly billing', async () => {
      const result = await service.createCheckoutSession(
        'rest1',
        'ENTERPRISE',
        'yearly',
        'owner1',
      );

      expect(result.url).toBe('https://checkout.stripe.com/pay/test');
      expect(mockCheckoutCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          line_items: [
            { price: PRICE_IDS.STRIPE_PRICE_ENTERPRISE_YEARLY, quantity: 1 },
          ],
        }),
      );
    });

    it('throws when no Stripe price is configured for an unknown tier', async () => {
      await expect(
        service.createCheckoutSession(
          'rest1',
          'NONEXISTENT',
          'monthly',
          'owner1',
        ),
      ).rejects.toThrow('No Stripe price configured for tier NONEXISTENT');
    });
  });

  // ─── getTierFromPrice via webhook (M-7) ──────────────────────────────────────
  // The subscription.updated path maps a known price id back to its tier using
  // the constructor-built PRICE_MAP. With ConfigService supplying ids, a known
  // price now resolves to the correct tier instead of defaulting to FREE.

  describe('price → tier resolution (subscription.updated)', () => {
    it('maps a known PROFESSIONAL price id to PROFESSIONAL tier', async () => {
      mockConstructEvent.mockReturnValue({
        type: 'customer.subscription.updated',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: 'sub_pro',
            customer: 'cus_test',
            status: 'active',
            items: {
              data: [
                { price: { id: PRICE_IDS.STRIPE_PRICE_PROFESSIONAL_MONTHLY } },
              ],
            },
          },
        },
      });

      await service.handleWebhook(Buffer.from('{}'), 'valid_sig');

      expect(prisma.restaurant.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tier: 'PROFESSIONAL' }),
        }),
      );
    });

    it('defaults an unrecognised price id to FREE', async () => {
      mockConstructEvent.mockReturnValue({
        type: 'customer.subscription.updated',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: 'sub_unknown',
            customer: 'cus_test',
            status: 'active',
            items: { data: [{ price: { id: 'price_not_in_map' } }] },
          },
        },
      });

      await service.handleWebhook(Buffer.from('{}'), 'valid_sig');

      expect(prisma.restaurant.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tier: 'FREE' }),
        }),
      );
    });
  });

  // ─── confirmCheckoutSession (M-11) ───────────────────────────────────────────

  describe('confirmCheckoutSession', () => {
    // F-PAY-2: a Stripe retrieval failure is not proof the customer has no
    // subscription — must not silently downgrade to FREE. Surface as retryable.
    it('throws ServiceUnavailableException when the Stripe session cannot be retrieved', async () => {
      mockSessionRetrieve.mockRejectedValue(new Error('No such session'));

      await expect(
        service.confirmCheckoutSession('cs_missing', 'owner1'),
      ).rejects.toThrow(ServiceUnavailableException);
      expect(prisma.restaurant.updateMany).not.toHaveBeenCalled();
    });

    it('returns FREE when the session is not complete (payment not finished)', async () => {
      mockSessionRetrieve.mockResolvedValue({
        status: 'open',
        customer: 'cus_test',
        metadata: { tier: 'PROFESSIONAL' },
      });

      const result = await service.confirmCheckoutSession('cs_open', 'owner1');

      expect(result).toEqual({ tier: 'FREE' });
      expect(prisma.restaurant.updateMany).not.toHaveBeenCalled();
    });

    it('updates the restaurant tier when the session is complete and owned by the caller', async () => {
      prisma.restaurant.findFirst.mockResolvedValue({ ownerId: 'owner1' });
      mockSessionRetrieve.mockResolvedValue({
        status: 'complete',
        customer: 'cus_test',
        subscription: 'sub_done',
        created: Math.floor(Date.now() / 1000),
        metadata: { tier: 'PROFESSIONAL' },
      });

      const result = await service.confirmCheckoutSession('cs_done', 'owner1');

      expect(result).toEqual({ tier: 'PROFESSIONAL' });
      expect(prisma.restaurant.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ stripeCustomerId: 'cus_test' }),
          data: expect.objectContaining({
            tier: 'PROFESSIONAL',
            stripeSubscriptionId: 'sub_done',
            pastDueGraceExpiry: null, // Issue 11: cleared on upgrade
          }),
        }),
      );
    });

    it('rejects when the session belongs to another tenant', async () => {
      prisma.restaurant.findFirst.mockResolvedValue({
        ownerId: 'someone-else',
      });
      mockSessionRetrieve.mockResolvedValue({
        status: 'complete',
        customer: 'cus_test',
        subscription: 'sub_done',
        created: Math.floor(Date.now() / 1000),
        metadata: { tier: 'PROFESSIONAL' },
      });

      await expect(
        service.confirmCheckoutSession('cs_done', 'owner1'),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.restaurant.updateMany).not.toHaveBeenCalled();
    });

    it('is idempotent: the updateMany guard prevents a stale session downgrading a newer tier', async () => {
      prisma.restaurant.findFirst.mockResolvedValue({ ownerId: 'owner1' });
      const eventEpoch = Math.floor(Date.now() / 1000);
      mockSessionRetrieve.mockResolvedValue({
        status: 'complete',
        customer: 'cus_test',
        subscription: 'sub_done',
        created: eventEpoch,
        metadata: { tier: 'STARTER' },
      });

      await service.confirmCheckoutSession('cs_replay', 'owner1');

      // The write is gated so it only applies when the stored tierUpdatedAt is
      // null or older than this session's created time — a later tier survives a
      // replayed older session.
      expect(prisma.restaurant.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { tierUpdatedAt: null },
              {
                tierUpdatedAt: expect.objectContaining({
                  lt: expect.any(Date),
                }),
              },
            ]),
          }),
        }),
      );
    });
  });

  // ─── createPortalSession ─────────────────────────────────────────────────────

  describe('createPortalSession', () => {
    it('throws ForbiddenException when user does not own the restaurant', async () => {
      prisma.restaurant.findUniqueOrThrow.mockResolvedValue({
        stripeCustomerId: 'cus_test',
        ownerId: 'other_owner',
      });

      await expect(
        service.createPortalSession('rest1', 'owner1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws when restaurant has no Stripe customer', async () => {
      prisma.restaurant.findUniqueOrThrow.mockResolvedValue({
        stripeCustomerId: null,
        ownerId: 'owner1',
      });

      await expect(
        service.createPortalSession('rest1', 'owner1'),
      ).rejects.toThrow('No Stripe customer');
    });

    it('returns portal URL for restaurant with Stripe customer', async () => {
      prisma.restaurant.findUniqueOrThrow.mockResolvedValue({
        stripeCustomerId: 'cus_test',
        ownerId: 'owner1',
      });

      const result = await service.createPortalSession('rest1', 'owner1');

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

      const result = await service.handleWebhook(
        Buffer.from('{}'),
        'valid_sig',
      );

      expect(result).toEqual({ received: true });
      expect(prisma.restaurant.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tier: 'PROFESSIONAL',
            stripeSubscriptionId: 'sub_abc',
          }),
        }),
      );
    });

    it('processes customer.subscription.updated event and defaults unrecognised price to FREE', async () => {
      // 'price_starter_xyz' is not one of the ids supplied by the mock ConfigService,
      // so getTierFromPrice falls through to FREE — the correct default behaviour.
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

      const result = await service.handleWebhook(
        Buffer.from('{}'),
        'valid_sig',
      );

      expect(result).toEqual({ received: true });
      expect(prisma.restaurant.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tier: 'FREE',
            stripeSubscriptionId: 'sub_updated',
          }),
        }),
      );
    });

    it('processes customer.subscription.deleted and resets to FREE', async () => {
      mockConstructEvent.mockReturnValue({
        type: 'customer.subscription.deleted',
        created: Math.floor(Date.now() / 1000),
        data: { object: { customer: 'cus_test' } },
      });

      const result = await service.handleWebhook(
        Buffer.from('{}'),
        'valid_sig',
      );

      expect(result).toEqual({ received: true });
      expect(prisma.restaurant.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tier: 'FREE',
            stripeSubscriptionId: null,
          }),
        }),
      );
    });

    it('returns received:true for unrecognised event types (no-op)', async () => {
      mockConstructEvent.mockReturnValue({
        type: 'payment_intent.created',
        created: Math.floor(Date.now() / 1000),
        data: { object: {} },
      });

      const result = await service.handleWebhook(
        Buffer.from('{}'),
        'valid_sig',
      );

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
              {
                tierUpdatedAt: expect.objectContaining({
                  lte: expect.any(Date),
                }),
              },
            ]),
          }),
        }),
      );
    });

    it('processes customer.subscription.paused and downgrades to FREE', async () => {
      mockConstructEvent.mockReturnValue({
        type: 'customer.subscription.paused',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: 'sub_paused',
            customer: 'cus_test',
            status: 'paused',
            items: {
              data: [
                { price: { id: PRICE_IDS.STRIPE_PRICE_PROFESSIONAL_MONTHLY } },
              ],
            },
          },
        },
      });

      await service.handleWebhook(Buffer.from('{}'), 'valid_sig');

      expect(prisma.restaurant.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tier: 'FREE' }),
        }),
      );
    });

    it('processes customer.subscription.updated with past_due and active grace period', async () => {
      const futureTime = Math.floor(Date.now() / 1000) + 24 * 3600; // end of period is tomorrow
      mockConstructEvent.mockReturnValue({
        type: 'customer.subscription.updated',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: 'sub_past_due_active',
            customer: 'cus_test',
            status: 'past_due',
            current_period_end: futureTime,
            items: {
              data: [
                { price: { id: PRICE_IDS.STRIPE_PRICE_PROFESSIONAL_MONTHLY } },
              ],
            },
          },
        },
      });

      await service.handleWebhook(Buffer.from('{}'), 'valid_sig');

      expect(prisma.restaurant.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tier: 'PROFESSIONAL',
            pastDueGraceExpiry: expect.any(Date),
          }),
        }),
      );
    });

    it('processes customer.subscription.updated with past_due and expired grace period', async () => {
      const pastTime = Math.floor(Date.now() / 1000) - 10 * 24 * 3600; // period ended 10 days ago
      mockConstructEvent.mockReturnValue({
        type: 'customer.subscription.updated',
        created: pastTime,
        data: {
          object: {
            id: 'sub_past_due_expired',
            customer: 'cus_test',
            status: 'past_due',
            current_period_end: pastTime,
            items: {
              data: [
                { price: { id: PRICE_IDS.STRIPE_PRICE_PROFESSIONAL_MONTHLY } },
              ],
            },
          },
        },
      });

      await service.handleWebhook(Buffer.from('{}'), 'valid_sig');

      expect(prisma.restaurant.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tier: 'FREE',
            pastDueGraceExpiry: null,
          }),
        }),
      );
    });
  });

  describe('enforceGraceExpiry', () => {
    it('downgrades restaurants with expired pastDueGraceExpiry to FREE', async () => {
      prisma.$queryRaw.mockResolvedValue([
        { id: 'rest-1', previousTier: 'STARTER' },
      ]);

      await service.enforceGraceExpiry();

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.restaurant.updateMany).not.toHaveBeenCalled();
      expect(prisma.adminAuditLog.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [
            expect.objectContaining({
              action: 'TIER_DOWNGRADE',
              targetId: 'rest-1',
              metadata: expect.objectContaining({
                actor: 'SYSTEM',
                previousTier: 'STARTER',
              }),
            }),
          ],
        }),
      );
    });

    it('does nothing when no restaurants have expired grace period', async () => {
      prisma.restaurant.findMany.mockResolvedValue([]);

      await service.enforceGraceExpiry();

      expect(prisma.restaurant.updateMany).not.toHaveBeenCalled();
      expect(prisma.adminAuditLog.createMany).not.toHaveBeenCalled();
    });
  });

  describe('enforceForceTierExpiry', () => {
    it('clears only rows returned by the guarded update and writes system audit rows', async () => {
      prisma.$queryRaw.mockResolvedValue([
        { id: 'rest-2', expiredForceTier: 'ENTERPRISE' },
      ]);

      await service.enforceForceTierExpiry();

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.restaurant.updateMany).not.toHaveBeenCalled();
      expect(prisma.adminAuditLog.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [
            expect.objectContaining({
              action: 'TIER_CLEAR',
              targetId: 'rest-2',
              metadata: expect.objectContaining({
                actor: 'SYSTEM',
                expiredForceTier: 'ENTERPRISE',
              }),
            }),
          ],
        }),
      );
    });
  });

  describe('confirmCheckoutSession Cache Idempotency', () => {
    it('uses the session cache for confirmCheckoutSession idempotency', async () => {
      // Issue 7: findFirst now needs `id` so the Map stores the correct restaurantId.
      prisma.restaurant.findFirst.mockResolvedValue({
        id: 'rest-cached',
        ownerId: 'owner1',
        tier: 'PROFESSIONAL',
      });
      // The fast path on the second call uses findUnique with the stored restaurantId.
      prisma.restaurant.findUnique.mockResolvedValue({
        tier: 'PROFESSIONAL',
        forceTier: null,
      });
      mockSessionRetrieve.mockResolvedValue({
        status: 'complete',
        customer: 'cus_test',
        subscription: 'sub_done',
        created: Math.floor(Date.now() / 1000),
        metadata: { tier: 'PROFESSIONAL' },
      });

      // First call (not cached)
      const res1 = await service.confirmCheckoutSession('cs_cached', 'owner1');
      expect(res1).toEqual({ tier: 'PROFESSIONAL' });
      expect(mockSessionRetrieve).toHaveBeenCalledTimes(1);

      // Second call (uses processedSessions cache)
      const res2 = await service.confirmCheckoutSession('cs_cached', 'owner1');
      expect(res2).toEqual({ tier: 'PROFESSIONAL' });
      // Retrieve should not be called a second time
      expect(mockSessionRetrieve).toHaveBeenCalledTimes(1);
    });
  });
});
