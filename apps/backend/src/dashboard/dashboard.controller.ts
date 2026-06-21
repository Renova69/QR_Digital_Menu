import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
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
import { FeatureService } from '../subscription/feature.service';
import { RequireFeature } from '../subscription/require-feature.decorator';
import { FeatureFlag } from '../subscription/feature-flag.enum';
import { DateRangeQueryDto } from '../common/dto/date-range-query.dto';

// Cap the analytics window so a caller can't request year 0001→9999 and force
// the day-by-day revenue-trend loop (+ unbounded order fetch) to exhaust CPU /
// memory (#28). 366 days covers the largest UI-selectable range with headroom.
const MAX_ANALYTICS_RANGE_DAYS = 366;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly prisma: PrismaService,
    private readonly featureService: FeatureService,
  ) {}

  /** Reject inverted or excessively wide date ranges before they reach the
   *  query layer. No-op when either bound is missing (period-based requests). */
  private assertDateRange(startDate?: string, endDate?: string): void {
    if (!startDate || !endDate) return;
    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();
    if (Number.isNaN(start) || Number.isNaN(end)) {
      throw new BadRequestException('Invalid startDate or endDate');
    }
    if (end < start) {
      throw new BadRequestException('endDate must not be before startDate');
    }
    if (end - start > MAX_ANALYTICS_RANGE_DAYS * MS_PER_DAY) {
      throw new BadRequestException(
        `Date range cannot exceed ${MAX_ANALYTICS_RANGE_DAYS} days`,
      );
    }
  }

  private async verifyDashboardAccess(
    user: any,
    restaurantId: string,
  ): Promise<{ tier: string; forceTier: string | null }> {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      // Issue 27: also check suspension and soft-delete status.
      select: {
        ownerId: true,
        isActive: true,
        deletedAt: true,
        tier: true,
        forceTier: true,
      },
    });

    if (!restaurant || restaurant.deletedAt) {
      throw new ForbiddenException('Restaurant not found');
    }

    if (!restaurant.isActive) {
      throw new ForbiddenException('Restaurant is suspended');
    }

    const role = user?.role?.toUpperCase();
    const hasAccess =
      restaurant?.ownerId === user?.id ||
      (role === 'MANAGER' && user?.restaurantId === restaurantId);

    if (!hasAccess) {
      throw new ForbiddenException(
        "You do not have permission to access this restaurant's dashboard",
      );
    }

    return {
      tier: restaurant.tier ?? 'FREE',
      forceTier: restaurant.forceTier ?? null,
    };
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
    this.assertDateRange(dateRange.startDate, dateRange.endDate);
    await this.verifyDashboardAccess(user, restaurantId);
    return this.dashboardService.getPaymentsSummary(
      restaurantId,
      dateRange.startDate,
      dateRange.endDate,
    );
  }

  @UseGuards(JwtAuthGuard, FeatureGuard)
  @RequireFeature(FeatureFlag.ANALYTICS_BASIC)
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

    this.assertDateRange(dateRange?.startDate, dateRange?.endDate);

    const { tier, forceTier } = await this.verifyDashboardAccess(
      user,
      restaurantId,
    );

    // STARTER has ANALYTICS_BASIC but not ANALYTICS_FULL — strip premium-only fields
    // so the endpoint gate downgrade doesn't expose Pro data to lower tiers.
    // Full analytics (deep drill-downs) AND all payment-derived metrics are
    // Professional+ only: payment-method split, refund/collected totals and the
    // revenue-reconciliation pair mirror the PAYMENTS_STRIPE gate on the
    // dedicated /payments endpoints, so they must not leak through analytics.
    const effectiveTier = this.featureService.getEffectiveTier(tier, forceTier);
    const hasFullAnalytics = this.featureService.hasFeature(
      effectiveTier,
      FeatureFlag.ANALYTICS_FULL,
    );

    const result = await this.dashboardService.getAnalytics(
      restaurantId,
      period,
      dateRange?.startDate,
      dateRange?.endDate,
      // Skip computing the 7 premium metrics for non-FULL tiers — they're
      // stripped below anyway, so computing them only wastes DB work.
      hasFullAnalytics,
    );

    if (!hasFullAnalytics) {
      const full = result as Record<string, unknown>;
      const {
        topItems: _t,
        peakHours: _p,
        categoryBreakdown: _c,
        ordersByTable: _o,
        collectedRevenue: _cr,
        refundedAmount: _ra,
        paymentsByMethod: _pm,
        repeatCustomerRate: _rcr,
        staffPerformance: _sp,
        customerMetrics: _cm,
        kitchenEfficiency: _ke,
        cancelAnalytics: _ca,
        tableTurnover: _tt,
        menuProfitability: _mp,
        grossProfit: _gp,
        ...basicResult
      } = full;
      return basicResult;
    }

    return result;
  }

  @UseGuards(JwtAuthGuard, FeatureGuard)
  @RequireFeature(FeatureFlag.ANALYTICS_BASIC)
  @Get('target')
  async getDailyTarget(
    @AuthUser() user: any,
    @Query('restaurantId') restaurantId: string,
    @Query('date') date?: string,
  ) {
    if (!restaurantId)
      throw new BadRequestException('restaurantId is required');
    await this.verifyDashboardAccess(user, restaurantId);
    return this.dashboardService.getDailyTarget(restaurantId, date);
  }

  @UseGuards(JwtAuthGuard, FeatureGuard)
  @RequireFeature(FeatureFlag.ANALYTICS_BASIC)
  @Put('target')
  async setDailyTarget(
    @AuthUser() user: any,
    @Query('restaurantId') restaurantId: string,
    @Body() body: { date?: string; dailyRevenue: number },
  ) {
    if (!restaurantId)
      throw new BadRequestException('restaurantId is required');
    if (typeof body.dailyRevenue !== 'number' || body.dailyRevenue < 0)
      throw new BadRequestException(
        'dailyRevenue must be a non-negative number',
      );
    await this.verifyDashboardAccess(user, restaurantId);
    return this.dashboardService.setDailyTarget(
      restaurantId,
      body.date ?? new Date().toISOString().split('T')[0],
      body.dailyRevenue,
    );
  }

  @UseGuards(JwtAuthGuard, FeatureGuard)
  @RequireFeature(FeatureFlag.ANALYTICS_FULL)
  @Get('closeout/:restaurantId')
  async getDailyCloseout(
    @AuthUser() user: any,
    @Param('restaurantId') restaurantId: string,
    @Query('date') date: string,
  ) {
    if (!restaurantId)
      throw new BadRequestException('restaurantId is required');
    if (!date) throw new BadRequestException('date (YYYY-MM-DD) is required');
    await this.verifyDashboardAccess(user, restaurantId);
    return this.dashboardService.getDailyCloseout(restaurantId, date);
  }
}
