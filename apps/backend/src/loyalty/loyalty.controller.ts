import { Controller, Get, Param, Post, UseGuards, Request } from '@nestjs/common';
import { LoyaltyService } from './loyalty.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('loyalty')
export class LoyaltyController {
  constructor(private readonly loyaltyService: LoyaltyService) {}

  @UseGuards(JwtAuthGuard)
  @Get('accounts')
  getLoyaltyAccounts(@Request() req) {
    return this.loyaltyService.getLoyaltyAccounts(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('orders/history')
  getHistory(@Request() req) {
    return this.loyaltyService.getHistory(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':restaurantId/analytics')
  getAnalytics(@Param('restaurantId') restaurantId: string, @Request() req) {
    return this.loyaltyService.getAnalytics(restaurantId, req.user.id);
  }

  /** Preview unnotified candidates without marking them as sent. */
  @UseGuards(JwtAuthGuard)
  @Get(':restaurantId/expiry-reminders')
  getExpiryReminders(
    @Param('restaurantId') restaurantId: string,
    @Request() req,
  ) {
    return this.loyaltyService.getExpiryReminderCandidates(
      restaurantId,
      req.user.id,
    );
  }

  /** Send reminders: marks batches as sent so they won't appear again. */
  @UseGuards(JwtAuthGuard)
  @Post(':restaurantId/expiry-reminders/notify')
  notifyExpiryReminders(
    @Param('restaurantId') restaurantId: string,
    @Request() req,
  ) {
    return this.loyaltyService.notifyExpiryReminders(
      restaurantId,
      req.user.id,
    );
  }

  @Get(':restaurantId/config')
  getPublicConfig(@Param('restaurantId') restaurantId: string) {
    return this.loyaltyService.getPublicConfig(restaurantId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':restaurantId/enroll')
  enroll(@Param('restaurantId') restaurantId: string, @Request() req) {
    return this.loyaltyService.enroll(req.user.id, restaurantId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':restaurantId')
  getPoints(@Param('restaurantId') restaurantId: string, @Request() req) {
    return this.loyaltyService.getPoints(req.user.id, restaurantId);
  }
}
