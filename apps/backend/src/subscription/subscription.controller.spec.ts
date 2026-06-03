import { ForbiddenException } from '@nestjs/common';
import { SubscriptionController } from './subscription.controller';
import { FeatureService } from './feature.service';

/** Phase 2 — subscription status is target-restaurant aware (#6). */
describe('SubscriptionController.getStatus — target restaurant', () => {
  let controller: SubscriptionController;
  let prisma: any;
  let subscriptionService: any;

  const req = (userId = 'u1') => ({ user: { id: userId } });

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn() },
      restaurant: { findUnique: jest.fn(), findFirst: jest.fn() },
    };
    subscriptionService = {
      getSubscriptionDetails: jest.fn().mockResolvedValue(null),
    };
    controller = new SubscriptionController(
      subscriptionService,
      new FeatureService(),
      prisma,
    );
  });

  it('resolves the EXPLICIT restaurant when the caller owns it', async () => {
    prisma.user.findUnique.mockResolvedValue({
      restaurantId: null,
      role: 'OWNER',
    });
    prisma.restaurant.findUnique.mockResolvedValue({
      id: 'rest-2',
      ownerId: 'u1',
      tier: 'PROFESSIONAL',
      forceTier: null,
    });

    const res = await controller.getStatus(req(), 'rest-2');

    expect(res.tier).toBe('PROFESSIONAL');
    expect(prisma.restaurant.findUnique).toHaveBeenCalledWith({
      where: { id: 'rest-2' },
      select: expect.objectContaining({ ownerId: true }),
    });
    expect(prisma.restaurant.findFirst).not.toHaveBeenCalled();
  });

  it('honors forceTier on the explicit restaurant', async () => {
    prisma.user.findUnique.mockResolvedValue({
      restaurantId: null,
      role: 'OWNER',
    });
    prisma.restaurant.findUnique.mockResolvedValue({
      id: 'rest-2',
      ownerId: 'u1',
      tier: 'FREE',
      forceTier: 'ENTERPRISE',
    });

    const res = await controller.getStatus(req(), 'rest-2');

    expect(res.tier).toBe('ENTERPRISE');
  });

  it('rejects an explicit restaurant the caller does not own or staff', async () => {
    prisma.user.findUnique.mockResolvedValue({
      restaurantId: null,
      role: 'OWNER',
    });
    prisma.restaurant.findUnique.mockResolvedValue({
      id: 'rest-victim',
      ownerId: 'someone-else',
      tier: 'PROFESSIONAL',
      forceTier: null,
    });

    await expect(controller.getStatus(req(), 'rest-victim')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('falls back to the caller restaurant when no id is supplied', async () => {
    prisma.user.findUnique.mockResolvedValue({
      restaurantId: 'rest-own',
      role: 'OWNER',
    });
    prisma.restaurant.findUnique.mockResolvedValue({
      id: 'rest-own',
      tier: 'STARTER',
      forceTier: null,
    });

    const res = await controller.getStatus(req());

    expect(res.tier).toBe('STARTER');
  });
});
