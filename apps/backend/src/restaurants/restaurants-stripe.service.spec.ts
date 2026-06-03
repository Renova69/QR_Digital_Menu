import { RestaurantsService } from './restaurants.service';
import { ForbiddenException } from '@nestjs/common';

describe('RestaurantsService — Stripe Connect', () => {
  let service: RestaurantsService;
  let mockPrisma: any;
  let mockTranslation: any;
  let mockStripe: any;

  beforeEach(() => {
    mockPrisma = {
      restaurant: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    mockTranslation = {};
    mockStripe = {
      createExpressAccount: jest.fn().mockResolvedValue('acct_new'),
      createAccountLink: jest
        .fn()
        .mockResolvedValue('https://connect.stripe.com/onboard'),
      retrieveAccount: jest.fn().mockResolvedValue(true),
    };

    const mockFeature = {
      getEffectiveTier: jest.fn(
        (tier: string, force?: string | null) => force ?? tier,
      ),
      hasFeature: jest.fn().mockReturnValue(true),
    };

    service = new RestaurantsService(
      mockPrisma,
      mockTranslation,
      mockStripe,
      mockFeature as any,
    );
  });

  describe('generateConnectLink', () => {
    it('creates a new Express account when restaurant has no stripeAccountId', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        id: 'rest1',
        ownerId: 'user1',
        stripeAccountId: null,
      });

      const result = await service.generateConnectLink('rest1', 'user1');

      expect(mockStripe.createExpressAccount).toHaveBeenCalled();
      expect(mockPrisma.restaurant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rest1' },
          data: expect.objectContaining({ stripeAccountId: 'acct_new' }),
        }),
      );
      expect(result.url).toBe('https://connect.stripe.com/onboard');
    });

    it('reuses existing stripeAccountId when already set', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        id: 'rest1',
        ownerId: 'user1',
        stripeAccountId: 'acct_existing',
      });

      await service.generateConnectLink('rest1', 'user1');

      expect(mockStripe.createExpressAccount).not.toHaveBeenCalled();
      expect(mockStripe.createAccountLink).toHaveBeenCalledWith(
        'acct_existing',
        expect.any(String),
        expect.any(String),
      );
    });

    it('throws ForbiddenException when userId does not own restaurant', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        id: 'rest1',
        ownerId: 'other-user',
        stripeAccountId: null,
      });

      await expect(
        service.generateConnectLink('rest1', 'user1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getStripeStatus', () => {
    it('returns stripeOnboarded=true and updates DB when charges_enabled', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        id: 'rest1',
        ownerId: 'user1',
        stripeAccountId: 'acct_123',
        stripeOnboarded: false,
      });
      mockStripe.retrieveAccount.mockResolvedValue(true);

      const result = await service.getStripeStatus('rest1', 'user1');

      expect(mockPrisma.restaurant.update).toHaveBeenCalledWith({
        where: { id: 'rest1' },
        data: { stripeOnboarded: true, paymentsEnabled: true },
      });
      expect(result.stripeOnboarded).toBe(true);
    });

    it('returns stripeOnboarded=false when no stripeAccountId', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        id: 'rest1',
        ownerId: 'user1',
        stripeAccountId: null,
        stripeOnboarded: false,
      });

      const result = await service.getStripeStatus('rest1', 'user1');

      expect(mockStripe.retrieveAccount).not.toHaveBeenCalled();
      expect(result.stripeOnboarded).toBe(false);
    });
  });

  describe('disconnectStripe', () => {
    it('clears stripeAccountId and sets stripeOnboarded=false', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        id: 'rest1',
        ownerId: 'user1',
        stripeAccountId: 'acct_123',
      });

      await service.disconnectStripe('rest1', 'user1');

      expect(mockPrisma.restaurant.update).toHaveBeenCalledWith({
        where: { id: 'rest1' },
        data: { stripeAccountId: null, stripeOnboarded: false },
      });
    });
  });
});
