import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  UseGuards,
  Headers,
  HttpCode,
} from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { CreateCheckoutDto } from './dto/checkout.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FeatureService } from './feature.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  AuthorizedRestaurant,
  RequireRestaurantAccess,
} from '../auth/require-restaurant-access.decorator';
import {
  getRestaurantAccess,
  RestaurantAccessContext,
} from '../auth/restaurant-access.policy';

@Controller('subscription')
export class SubscriptionController {
  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly featureService: FeatureService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('status')
  @RequireRestaurantAccess({
    policy: 'billing-status',
    source: 'query',
    key: 'restaurantId',
  })
  async getStatus(@Req() req: object) {
    const access = getRestaurantAccess(req);
    // No restaurant is a valid account-status result, not a reason to select
    // a second default after the guard. Explicit/default targets are resolved once.
    const restaurant = access
      ? await this.prisma.restaurant.findUnique({
          where: { id: access.restaurantId },
          select: {
            id: true,
            tier: true,
            forceTier: true,
            stripeSubscriptionId: true,
          },
        })
      : null;
    const tier = this.featureService.getEffectiveTier(
      restaurant?.tier ?? 'FREE',
      restaurant?.forceTier ?? null,
    );
    const subscription = restaurant?.id
      ? await this.subscriptionService.getSubscriptionDetails(restaurant.id)
      : null;
    return {
      tier,
      features: this.featureService.getFeatures(tier),
      staffLimit: this.featureService.getStaffLimit(tier),
      allowedStaffRoles: this.featureService.getAllowedStaffRoles(tier),
      hasSubscription: !!restaurant?.stripeSubscriptionId,
      subscription,
    };
  }

  @Post('checkout')
  @RequireRestaurantAccess({
    policy: 'billing-owner',
    source: 'body',
    key: 'restaurantId',
  })
  async createCheckout(
    @AuthorizedRestaurant() access: RestaurantAccessContext,
    @Body() dto: CreateCheckoutDto,
  ) {
    return this.subscriptionService.createCheckoutSession(
      access.restaurantId,
      dto.tier,
      dto.billingPeriod ?? 'monthly',
      access.userId,
      dto.onboarding ?? false,
    );
  }

  @Post('confirm-session')
  @UseGuards(JwtAuthGuard)
  async confirmSession(
    @Req() req: { user: { id: string; sub?: string } },
    @Body('sessionId') sessionId: string,
  ) {
    if (!sessionId) return { tier: 'FREE' };
    const userId = req.user.id ?? req.user.sub;
    return this.subscriptionService.confirmCheckoutSession(sessionId, userId);
  }

  @Post('portal')
  @RequireRestaurantAccess({
    policy: 'billing-owner',
    source: 'body',
    key: 'restaurantId',
  })
  async createPortal(@AuthorizedRestaurant() access: RestaurantAccessContext) {
    return this.subscriptionService.createPortalSession(
      access.restaurantId,
      access.userId,
    );
  }

  @Post('webhook')
  @HttpCode(200)
  async webhook(
    @Req() req: { body: Buffer },
    @Headers('stripe-signature') sig: string,
  ) {
    return this.subscriptionService.handleWebhook(req.body, sig);
  }
}
