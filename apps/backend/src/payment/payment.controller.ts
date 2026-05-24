import {
  Controller,
  Post,
  Get,
  Query,
  Body,
  Param,
  Req,
  Headers,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { PaymentHistoryQueryDto } from './dto/payment-history-query.dto';
import { RefundPaymentDto } from './dto/refund-payment.dto';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PaymentService } from './payment.service';
import { FeatureGuard } from '../subscription/feature.guard';
import { RequireFeature } from '../subscription/require-feature.decorator';
import { FeatureFlag } from '../subscription/feature-flag.enum';

@Controller('payments')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post('session')
  @HttpCode(HttpStatus.OK)
  getOrCreateSession(
    @Body() body: { tableId: string; restaurantId: string; sessionToken?: string },
  ) {
    return this.paymentService.getOrCreateSession(
      body.tableId,
      body.restaurantId,
      body.sessionToken,
    );
  }

  @Post('session/force-open')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, FeatureGuard)
  @RequireFeature(FeatureFlag.PAYMENTS_STRIPE)
  forceOpenSession(
    @Body() body: { tableId: string; restaurantId: string },
  ) {
    return this.paymentService.forceOpenSession(body.tableId, body.restaurantId);
  }

  @Get('session/:token/bill')
  getSessionBill(@Param('token') token: string) {
    return this.paymentService.getSessionBill(token);
  }

  @Post('session/:token/intent')
  @HttpCode(HttpStatus.OK)
  createPaymentIntent(
    @Param('token') token: string,
    @Body() body: { tipPercent: number },
  ) {
    return this.paymentService.createPaymentIntent(token, body.tipPercent ?? 0);
  }

  @Post('session/:token/close')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, FeatureGuard)
  @RequireFeature(FeatureFlag.PAYMENTS_STRIPE)
  closeSession(
    @Param('token') token: string,
    @Body() body: { restaurantId: string },
  ) {
    return this.paymentService.closeSession(token, body.restaurantId);
  }

  @Post('session/:token/close-card')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, FeatureGuard)
  @RequireFeature(FeatureFlag.PAYMENTS_STRIPE)
  closeSessionWithCard(
    @Param('token') token: string,
    @Body() body: { restaurantId: string },
  ) {
    return this.paymentService.closeSessionWithCard(token, body.restaurantId);
  }

  @Post('session/:token/close-cash')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, FeatureGuard)
  @RequireFeature(FeatureFlag.PAYMENTS_STRIPE)
  closeSessionWithCash(
    @Param('token') token: string,
    @Body() body: { restaurantId: string },
  ) {
    return this.paymentService.closeSessionWithCash(token, body.restaurantId);
  }

  @Get('sessions/:restaurantId')
  @UseGuards(JwtAuthGuard, FeatureGuard)
  @RequireFeature(FeatureFlag.PAYMENTS_STRIPE)
  getTableSessions(
    @Req() req: any,
    @Param('restaurantId') restaurantId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.paymentService.getTableSessions(
      restaurantId,
      page ? parseInt(page, 10) : undefined,
      limit ? parseInt(limit, 10) : undefined,
      req.user.id,
    );
  }

  @Get('overview/:restaurantId')
  @UseGuards(JwtAuthGuard, FeatureGuard)
  @RequireFeature(FeatureFlag.PAYMENTS_STRIPE)
  getPaymentsOverview(
    @Req() req: any,
    @Param('restaurantId') restaurantId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.paymentService.getPaymentsOverview(restaurantId, req.user.id, {
      startDate,
      endDate,
    });
  }

  @Get('payouts/:restaurantId')
  @UseGuards(JwtAuthGuard, FeatureGuard)
  @RequireFeature(FeatureFlag.PAYMENTS_STRIPE)
  getPayoutsSnapshot(
    @Req() req: any,
    @Param('restaurantId') restaurantId: string,
  ) {
    return this.paymentService.getPayoutsSnapshot(restaurantId, req.user.id);
  }

  @Get('settings/:restaurantId')
  @UseGuards(JwtAuthGuard, FeatureGuard)
  @RequireFeature(FeatureFlag.PAYMENTS_STRIPE)
  getPaymentSettings(
    @Req() req: any,
    @Param('restaurantId') restaurantId: string,
  ) {
    return this.paymentService.getPaymentSettings(restaurantId, req.user.id);
  }

  @Get('history/:restaurantId')
  @UseGuards(JwtAuthGuard, FeatureGuard)
  @RequireFeature(FeatureFlag.PAYMENTS_STRIPE)
  getPaymentHistory(
    @Req() req: any,
    @Param('restaurantId') restaurantId: string,
    @Query() query: PaymentHistoryQueryDto,
  ) {
    return this.paymentService.getPaymentHistory(restaurantId, query, req.user.id);
  }

  @Get(':paymentId')
  @UseGuards(JwtAuthGuard, FeatureGuard)
  @RequireFeature(FeatureFlag.PAYMENTS_STRIPE)
  getPaymentDetail(
    @Req() req: any,
    @Param('paymentId') paymentId: string,
  ) {
    return this.paymentService.getPaymentDetail(paymentId, req.user.id);
  }

  @Post(':paymentId/refund')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, FeatureGuard)
  @RequireFeature(FeatureFlag.PAYMENTS_STRIPE)
  refundPayment(
    @Req() req: any,
    @Param('paymentId') paymentId: string,
    @Body() body: RefundPaymentDto,
  ) {
    return this.paymentService.refundPayment(paymentId, req.user.id, body);
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @SkipThrottle()
  handleWebhook(
    @Req() req: any,
    @Headers('stripe-signature') signature: string,
  ) {
    return this.paymentService.handleWebhookEvent(req.body, signature);
  }
}
