import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FeatureService } from './feature.service';
import { REQUIRE_FEATURE_KEY } from './require-feature.decorator';
import { FeatureFlag } from './feature-flag.enum';
import { PrismaService } from '../prisma/prisma.service';
import { extractRestaurantId } from './restaurant-id.util';

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
    const requiredFeatures = this.reflector.getAllAndOverride<FeatureFlag[]>(REQUIRE_FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredFeatures || requiredFeatures.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id ?? request.user?.sub;

    if (!userId) {
      throw new ForbiddenException({ code: 'AUTH_REQUIRED' });
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { restaurantId: true, role: true },
    });

    // SUPER_ADMIN bypasses all tier and suspension checks
    if (user?.role === 'SUPER_ADMIN') {
      return true;
    }

    // Resolve the TARGET restaurant: the one the request is acting on (from
    // params/query/body), not an arbitrary first-owned one (#2). Falls back to
    // the caller's own restaurant for routes with no restaurant in the request.
    const targetId = extractRestaurantId(request);
    const restaurant = targetId
      ? await this.prisma.restaurant.findUnique({
          where: { id: targetId },
          select: RESTAURANT_SELECT,
        })
      : user?.restaurantId
        ? await this.prisma.restaurant.findUnique({
            where: { id: user.restaurantId },
            select: RESTAURANT_SELECT,
          })
        : await this.prisma.restaurant.findFirst({
            where: { ownerId: userId },
            select: RESTAURANT_SELECT,
          });

    if (!restaurant) {
      throw new ForbiddenException({
        code: 'FEATURE_LOCKED',
        requiredFeatures,
        message: 'No restaurant found for this request',
      });
    }

    // When an explicit target was supplied, verify the caller is associated
    // with it — otherwise a lower tier could pass another restaurant's id to
    // dodge its own entitlement check.
    if (targetId) {
      const isOwner = restaurant.ownerId === userId;
      const isStaff = user?.restaurantId === targetId;
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

    const missing = requiredFeatures.filter((f) => !this.featureService.hasFeature(tier, f));
    if (missing.length > 0) {
      throw new ForbiddenException({
        code: 'FEATURE_LOCKED',
        requiredFeatures: missing,
        message: `Your plan (${tier}) does not include: ${missing.join(', ')}`,
      });
    }

    return true;
  }
}
