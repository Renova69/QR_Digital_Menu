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
      restaurantHasFeature: jest.fn(function (this: any, r: any, f: any) {
        return this.hasFeature(
          this.getEffectiveTier(r?.tier ?? 'FREE', r?.forceTier ?? null),
          f,
        );
      }),
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

  describe('getStripeStatus — resource_missing (Issue 10)', () => {
    const resourceMissingError = Object.assign(new Error('No such account'), {
      code: 'resource_missing',
    });

    it('clears stripeAccountId and stripeOnboarded when Stripe account is deleted', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        id: 'rest1',
        ownerId: 'user1',
        stripeAccountId: 'acct_deleted',
        stripeOnboarded: true,
        epayEnabled: false,
        boricaEnabled: false,
      });
      mockStripe.retrieveAccount.mockRejectedValue(resourceMissingError);

      const result = await service.getStripeStatus('rest1', 'user1');

      expect(result.stripeOnboarded).toBe(false);
      expect(mockPrisma.restaurant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rest1' },
          data: expect.objectContaining({
            stripeAccountId: null,
            stripeOnboarded: false,
          }),
        }),
      );
    });

    it('also clears paymentsEnabled when no other provider is active', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        id: 'rest1',
        ownerId: 'user1',
        stripeAccountId: 'acct_deleted',
        stripeOnboarded: true,
        epayEnabled: false,
        boricaEnabled: false,
      });
      mockStripe.retrieveAccount.mockRejectedValue(resourceMissingError);

      await service.getStripeStatus('rest1', 'user1');

      const updateCall = mockPrisma.restaurant.update.mock.calls[0][0];
      expect(updateCall.data.paymentsEnabled).toBe(false);
    });

    it('preserves paymentsEnabled when epayEnabled is true', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        id: 'rest1',
        ownerId: 'user1',
        stripeAccountId: 'acct_deleted',
        stripeOnboarded: true,
        epayEnabled: true,
        boricaEnabled: false,
      });
      mockStripe.retrieveAccount.mockRejectedValue(resourceMissingError);

      await service.getStripeStatus('rest1', 'user1');

      const updateCall = mockPrisma.restaurant.update.mock.calls[0][0];
      expect(updateCall.data.paymentsEnabled).toBeUndefined();
    });

    it('rethrows non-resource_missing Stripe errors', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        id: 'rest1',
        ownerId: 'user1',
        stripeAccountId: 'acct_123',
        stripeOnboarded: true,
        epayEnabled: false,
        boricaEnabled: false,
      });
      const networkErr = new Error('Network error');
      mockStripe.retrieveAccount.mockRejectedValue(networkErr);

      await expect(service.getStripeStatus('rest1', 'user1')).rejects.toThrow(
        'Network error',
      );
    });
  });
});
