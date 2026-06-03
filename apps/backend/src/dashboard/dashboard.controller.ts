import {
  Controller,
  Get,
  Query,
  UseGuards,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser } from '../auth/auth-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { FeatureGuard } from '../subscription/feature.guard';
import { RequireFeature } from '../subscription/require-feature.decorator';
import { FeatureFlag } from '../subscription/feature-flag.enum';
import { DateRangeQueryDto } from '../common/dto/date-range-query.dto';

@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly prisma: PrismaService,
  ) {}

  private async verifyDashboardAccess(user: any, restaurantId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { ownerId: true },
    });

    const role = user?.role?.toUpperCase();
    const hasAccess =
      restaurant?.ownerId === user?.id ||
      (role === 'MANAGER' && user?.restaurantId === restaurantId);

    if (!restaurant || !hasAccess) {
      throw new ForbiddenException(
        "You do not have permission to access this restaurant's dashboard",
      );
    }
  }

  @UseGuards(JwtAuthGuard, FeatureGuard)
  @RequireFeature(FeatureFlag.ANALYTICS_BASIC)
  @Get('summary')
  async getSummary(
    @AuthUser() user: any,
    @Query('restaurantId') restaurantId: string,
  ) {
    await this.verifyDashboardAccess(user, restaurantId);
    return this.dashboardService.getSummary(restaurantId);
  }

  @UseGuards(JwtAuthGuard, FeatureGuard)
  @RequireFeature(FeatureFlag.PAYMENTS_STRIPE)
  @Get('payments-summary')
  async getPaymentsSummary(
    @AuthUser() user: any,
    @Query('restaurantId') restaurantId: string,
    @Query() dateRange: DateRangeQueryDto,
  ) {
    if (!restaurantId) {
      throw new BadRequestException('restaurantId is required');
    }
    await this.verifyDashboardAccess(user, restaurantId);
    return this.dashboardService.getPaymentsSummary(
      restaurantId,
      dateRange.startDate,
      dateRange.endDate,
    );
  }

  @UseGuards(JwtAuthGuard, FeatureGuard)
  @RequireFeature(FeatureFlag.ANALYTICS_FULL)
  @Get('analytics')
  async getAnalytics(
    @AuthUser() user: any,
    @Query('restaurantId') restaurantId: string,
    @Query('period') periodStr?: string,
    @Query() dateRange?: DateRangeQueryDto,
  ) {
    if (!restaurantId) {
      throw new BadRequestException('restaurantId is required');
    }

    let period = 7;
    if (periodStr) {
      period = parseInt(periodStr, 10);
      if (![7, 14, 30].includes(period)) {
        throw new BadRequestException('period must be 7, 14, or 30');
      }
    }

    await this.verifyDashboardAccess(user, restaurantId);
    return this.dashboardService.getAnalytics(
      restaurantId,
      period,
      dateRange?.startDate,
      dateRange?.endDate,
    );
  }
}
