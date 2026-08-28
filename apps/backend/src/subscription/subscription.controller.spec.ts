import { SubscriptionController } from './subscription.controller';
import { SubscriptionService } from './subscription.service';
import { FeatureService } from './feature.service';
import { PrismaService } from '../prisma/prisma.service';
import { setRestaurantAccess } from '../auth/restaurant-access.policy';

// Tenant selection/authorization is exercised through real HTTP guards in
// restaurant-access.payments.http.spec.ts; direct calls test response assembly.
describe('SubscriptionController verified target', () => {
  const prisma = {
    restaurant: { findUnique: jest.fn(), findFirst: jest.fn() },
  };
  const subscriptions = { getSubscriptionDetails: jest.fn() };
  const controller = new SubscriptionController(
    subscriptions as unknown as SubscriptionService,
    new FeatureService(),
    prisma as unknown as PrismaService,
  );
  function authorizedRequest() {
    const req = { query: { restaurantId: 'untrusted' } };
    setRestaurantAccess(req, {
      restaurantId: 'r1',
      userId: 'owner',
      role: 'OWNER',
      tier: 'FREE',
      forceTier: null,
    });
    return req;
  }
  beforeEach(() => {
    jest.resetAllMocks();
    subscriptions.getSubscriptionDetails.mockResolvedValue(null);
    prisma.restaurant.findUnique.mockResolvedValue({
      id: 'r1',
      tier: 'PROFESSIONAL',
      forceTier: null,
    });
  });
  it('reads only the verified tenant and uses the latest tier', async () => {
    const result = await controller.getStatus(authorizedRequest());
    expect(result.tier).toBe('PROFESSIONAL');
    expect(prisma.restaurant.findUnique).toHaveBeenCalledWith({
      where: { id: 'r1' },
      select: {
        id: true,
        tier: true,
        forceTier: true,
        stripeSubscriptionId: true,
      },
    });
    expect(subscriptions.getSubscriptionDetails).toHaveBeenCalledWith('r1');
    expect(prisma.restaurant.findFirst).not.toHaveBeenCalled();
  });
  it('honors the target forceTier and subscription details', async () => {
    prisma.restaurant.findUnique.mockResolvedValue({
      id: 'r1',
      tier: 'FREE',
      forceTier: 'ENTERPRISE',
      stripeSubscriptionId: 'sub_test',
    });
    subscriptions.getSubscriptionDetails.mockResolvedValue({
      status: 'active',
    });
    expect(await controller.getStatus(authorizedRequest())).toMatchObject({
      tier: 'ENTERPRISE',
      hasSubscription: true,
      subscription: { status: 'active' },
    });
  });
  it('returns FREE without selecting another default when no target was authorized', async () => {
    expect(
      await controller.getStatus({ query: { restaurantId: 'r1' } }),
    ).toMatchObject({
      tier: 'FREE',
      hasSubscription: false,
      subscription: null,
    });
    expect(prisma.restaurant.findUnique).not.toHaveBeenCalled();
    expect(prisma.restaurant.findFirst).not.toHaveBeenCalled();
    expect(subscriptions.getSubscriptionDetails).not.toHaveBeenCalled();
  });
  it('does not switch tenants if the authorized row disappears', async () => {
    prisma.restaurant.findUnique.mockResolvedValue(null);
    expect(await controller.getStatus(authorizedRequest())).toMatchObject({
      tier: 'FREE',
      subscription: null,
    });
    expect(prisma.restaurant.findFirst).not.toHaveBeenCalled();
    expect(subscriptions.getSubscriptionDetails).not.toHaveBeenCalled();
  });
});
