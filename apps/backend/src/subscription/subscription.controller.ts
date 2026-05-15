import { Controller, Get, Post, Body, Req, UseGuards, Headers, RawBodyRequest, HttpCode } from '@nestjs/common';
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

  private async resolveRestaurant(userId: string, select: Record<string, boolean>) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { restaurantId: true },
    });
    // Staff are linked via User.restaurantId; owners via Restaurant.ownerId
    if (user?.restaurantId) {
      return this.prisma.restaurant.findUnique({ where: { id: user.restaurantId }, select });
    }
    return this.prisma.restaurant.findFirst({ where: { ownerId: userId }, select });
  }

  @Get('status')
  @UseGuards(JwtAuthGuard)
  async getStatus(@Req() req: any) {
    const userId = req.user.id ?? req.user.sub;
    const restaurant = await this.resolveRestaurant(userId, {
      id: true,
      tier: true,
      stripeSubscriptionId: true,
      tierUpdatedAt: true,
    });
    const tier = restaurant?.tier ?? 'FREE';
    return {
      tier,
      features: this.featureService.getFeatures(tier),
      staffLimit: this.featureService.getStaffLimit(tier),
      hasSubscription: !!restaurant?.stripeSubscriptionId,
    };
  }

  @Post('checkout')
  @UseGuards(JwtAuthGuard)
  async createCheckout(@Req() req: any, @Body() dto: CreateCheckoutDto) {
    const userId = req.user.id ?? req.user.sub;
    const restaurant = await this.resolveRestaurant(userId, { id: true });
    if (!restaurant) throw new Error('No restaurant found for user');
    return this.subscriptionService.createCheckoutSession(restaurant.id, dto.tier, userId);
  }

  @Post('portal')
  @UseGuards(JwtAuthGuard)
  async createPortal(@Req() req: any) {
    const userId = req.user.id ?? req.user.sub;
    const restaurant = await this.resolveRestaurant(userId, { id: true });
    if (!restaurant) throw new Error('No restaurant found for user');
    return this.subscriptionService.createPortalSession(restaurant.id);
  }

  @Post('webhook')
  @HttpCode(200)
  async webhook(@Req() req: RawBodyRequest<Request>, @Headers('stripe-signature') sig: string) {
    return this.subscriptionService.handleWebhook(req.rawBody!, sig);
  }
}
