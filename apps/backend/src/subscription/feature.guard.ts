import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FeatureService } from './feature.service';
import { REQUIRE_FEATURE_KEY } from './require-feature.decorator';
import { FeatureFlag } from './feature-flag.enum';
import { PrismaService } from '../prisma/prisma.service';
import { extractRestaurantId } from './restaurant-id.util';
import {
  getRestaurantAccess,
  setRestaurantAccess,
} from '../auth/restaurant-access.policy';

const RESTAURANT_SELECT = {
  ownerId: true,
  tier: true,
  forceTier: true,
  isActive: true,
} as const;

@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly featureService: FeatureService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredFeatures = this.reflector.getAllAndOverride<FeatureFlag[]>(
      REQUIRE_FEATURE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredFeatures || requiredFeatures.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id ?? request.user?.sub;

    if (!userId) {
      throw new ForbiddenException({ code: 'AUTH_REQUIRED' });
    }

    if (!request._userCache) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { restaurantId: true, role: true },
      });
      if (!user) {
        throw new ForbiddenException({
          code: 'AUTH_REQUIRED',
          message: 'User account not found',
        });
      }
      request._userCache = user;
    }
    const user = request._userCache;

    // SUPER_ADMIN bypasses all tier and suspension checks
    if (user?.role === 'SUPER_ADMIN') {
      return true;
    }

    // Resolve the TARGET restaurant: the one the request is acting on (from
    // params/query/body), not an arbitrary first-owned one (#2). Falls back to
    // the caller's own restaurant for routes with no restaurant in the request.
    // A declarative access guard may have resolved an owner fallback or a
    // route-specific source. Entitlements must use that SAME verified tenant.
    const authorizedAccess = getRestaurantAccess(request);
    const targetId =
      authorizedAccess?.restaurantId ?? extractRestaurantId(request);
    let restaurantId = targetId;

    // YOURS H-4: payment routes carry only paymentId, lookup its restaurantId
    if (!restaurantId && request.params?.paymentId) {
      const payment = await this.prisma.payment.findUnique({
        where: { id: request.params.paymentId },
        select: { restaurantId: true },
      });
      if (payment) {
        restaurantId = payment.restaurantId;
      }
    }

    if (!restaurantId && request.params?.orderId) {
      const order = await this.prisma.order.findUnique({
        where: { id: request.params.orderId },
        select: { restaurantId: true },
      });
      if (order) {
        restaurantId = order.restaurantId;
      }
    }

    if (!restaurantId && request.params?.issueId) {
      const issue = await this.prisma.paymentReconciliationIssue.findUnique({
        where: { id: request.params.issueId },
        select: { restaurantId: true },
      });
      if (issue) {
        restaurantId = issue.restaurantId;
      }
    }

    const cacheKey = `_restaurantCache_${restaurantId ?? 'default'}`;
    if (!request[cacheKey]) {
      let restaurant = null;
      if (restaurantId) {
        restaurant = await this.prisma.restaurant.findUnique({
          where: { id: restaurantId },
          select: RESTAURANT_SELECT,
        });
      } else if (user?.restaurantId) {
        restaurant = await this.prisma.restaurant.findUnique({
          where: { id: user.restaurantId },
          select: RESTAURANT_SELECT,
        });
      }
      request[cacheKey] = restaurant;
    }
    const restaurant = request[cacheKey];

    if (!restaurant) {
      throw new ForbiddenException({
        code: 'FEATURE_LOCKED',
        requiredFeatures,
        message: 'No restaurant found for this request',
      });
    }

    // When an explicit target was supplied (or resolved via resource mapping),
    // verify the caller is associated with it — otherwise a lower tier could
    // pass another restaurant's id to dodge its own entitlement check.
    const checkTargetId = restaurantId || targetId;
    if (checkTargetId) {
      const isOwner = restaurant.ownerId === userId;
      const isStaff = user?.restaurantId === checkTargetId;
      if (!isOwner && !isStaff) {
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: 'You do not have access to this restaurant',
        });
      }
    }

    if (restaurant.isActive === false) {
      throw new ForbiddenException({
        code: 'RESTAURANT_SUSPENDED',
        message: 'This restaurant has been suspended',
      });
    }

    const tier = this.featureService.getEffectiveTier(
      restaurant.tier ?? 'FREE',
      restaurant.forceTier,
    );

    const missing = requiredFeatures.filter(
      (f) => !this.featureService.hasFeature(tier, f),
    );
    if (missing.length > 0) {
      throw new ForbiddenException({
        code: 'FEATURE_LOCKED',
        requiredFeatures: missing,
        message: `Your plan (${tier}) does not include: ${missing.join(', ')}`,
      });
    }

    // A later feature lookup may observe a tier change. Response filtering must
    // use this same snapshot, not the earlier access guard's premium tier.
    // Keep the verified identity/tenant unchanged and replace the frozen context.
    if (authorizedAccess) {
      setRestaurantAccess(request, {
        ...authorizedAccess,
        tier: restaurant.tier ?? 'FREE',
        forceTier: restaurant.forceTier ?? null,
      });
    }
    return true;
  }
}
