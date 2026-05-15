import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FeatureService } from './feature.service';
import { REQUIRE_FEATURE_KEY } from './require-feature.decorator';
import { FeatureFlag } from './feature-flag.enum';
import { PrismaService } from '../prisma/prisma.service';

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
      select: { restaurantId: true },
    });

    // Staff linked via User.restaurantId; owners via Restaurant.ownerId
    const restaurant = user?.restaurantId
      ? await this.prisma.restaurant.findUnique({
          where: { id: user.restaurantId },
          select: { tier: true },
        })
      : await this.prisma.restaurant.findFirst({
          where: { ownerId: userId },
          select: { tier: true },
        });

    const tier = restaurant?.tier ?? 'FREE';

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
