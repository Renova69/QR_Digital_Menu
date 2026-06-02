import { Controller, Get, Post, Body, Req, Query, UseGuards, Headers, HttpCode, NotFoundException, ForbiddenException } from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { CreateCheckoutDto } from './dto/checkout.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FeatureService } from './feature.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('subscription')
export class SubscriptionController {
  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly featureService: FeatureService,
    private readonly prisma: PrismaService,
  ) {}

  private async resolveRestaurant(
    userId: string,
    select: Record<string, boolean>,
    restaurantId?: string,
  ): Promise<Record<string, any> | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { restaurantId: true, role: true },
    });

    // Explicit target (e.g. active restaurant in a multi-location dashboard):
    // resolve THAT restaurant and verify the caller may see it (#6).
    if (restaurantId) {
      const restaurant = await this.prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { ...select, ownerId: true },
      });
      if (!restaurant) return null;
      const isSuperAdmin = user?.role === 'SUPER_ADMIN';
      const isOwner = restaurant.ownerId === userId;
      const isStaff = user?.restaurantId === restaurantId;
      if (!isSuperAdmin && !isOwner && !isStaff) {
        throw new ForbiddenException('You do not have access to this restaurant');
      }
      return restaurant;
    }

    // Fallback: caller's own restaurant. Staff via User.restaurantId; owners
    // via Restaurant.ownerId.
    if (user?.restaurantId) {
      return this.prisma.restaurant.findUnique({ where: { id: user.restaurantId }, select });
    }
    return this.prisma.restaurant.findFirst({ where: { ownerId: userId }, select });
  }

  @Get('status')
  @UseGuards(JwtAuthGuard)
  async getStatus(@Req() req: any, @Query('restaurantId') restaurantId?: string) {
    const userId = req.user.id ?? req.user.sub;
    const restaurant = await this.resolveRestaurant(
      userId,
      {
        id: true,
        tier: true,
        forceTier: true,
        stripeSubscriptionId: true,
        tierUpdatedAt: true,
      },
      restaurantId,
    );
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
  @UseGuards(JwtAuthGuard)
  async createCheckout(@Req() req: any, @Body() dto: CreateCheckoutDto) {
    if (req.user.role !== 'OWNER') throw new ForbiddenException('Only restaurant owners can manage billing');
    const userId = req.user.id ?? req.user.sub;
    const restaurant = await this.resolveRestaurant(userId, { id: true }, dto.restaurantId);
    if (!restaurant) throw new NotFoundException('No restaurant found for user');
    return this.subscriptionService.createCheckoutSession(restaurant.id, dto.tier, dto.billingPeriod ?? 'monthly', userId, dto.onboarding ?? false);
  }

  @Post('confirm-session')
  @UseGuards(JwtAuthGuard)
  async confirmSession(@Req() req: any, @Body('sessionId') sessionId: string) {
    if (!sessionId) return { tier: 'FREE' };
    const userId = req.user.id ?? req.user.sub;
    return this.subscriptionService.confirmCheckoutSession(sessionId, userId);
  }

  @Post('portal')
  @UseGuards(JwtAuthGuard)
  async createPortal(@Req() req: any, @Body('restaurantId') restaurantId?: string) {
    if (req.user.role !== 'OWNER') throw new ForbiddenException('Only restaurant owners can manage billing');
    const userId = req.user.id ?? req.user.sub;
    const restaurant = await this.resolveRestaurant(userId, { id: true }, restaurantId);
    if (!restaurant) throw new NotFoundException('No restaurant found for user');
    return this.subscriptionService.createPortalSession(restaurant.id, userId);
  }

  @Post('webhook')
  @HttpCode(200)
  async webhook(@Req() req: any, @Headers('stripe-signature') sig: string) {
    return this.subscriptionService.handleWebhook(req.body, sig);
  }
}
