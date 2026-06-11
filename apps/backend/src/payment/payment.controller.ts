import {
  Controller,
  Post,
  Get,
  Query,
  Body,
  Param,
  Req,
  Res,
  Headers,
  Header,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { PaymentHistoryQueryDto } from './dto/payment-history-query.dto';
import { RefundPaymentDto } from './dto/refund-payment.dto';
import { DateRangeQueryDto } from '../common/dto/date-range-query.dto';
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
    @Body()
    body: {
      tableId: string;
      restaurantId: string;
      sessionToken?: string;
    },
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
  @RequireFeature(FeatureFlag.POS)
  forceOpenSession(
    @Req() req: any,
    @Body() body: { tableId: string; restaurantId: string },
  ) {
    return this.paymentService.forceOpenSession(
      body.tableId,
      body.restaurantId,
      req.user.id,
    );
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

  @Post('session/:token/checkout')
  @HttpCode(HttpStatus.OK)
  createCheckout(
    @Param('token') token: string,
    @Body() body: {
      provider?: 'STRIPE' | 'EPAY' | 'BORICA';
      tipPercent?: number;
      boricaCardholder?: {
        cardholderName?: string;
        email?: string;
        phone?: string;
        billingAddress?: string;
      };
    },
  ) {
    const provider = (body.provider ?? 'STRIPE').toUpperCase() as
      | 'STRIPE'
      | 'EPAY'
      | 'BORICA';
    return this.paymentService.createCheckout(
      token,
      provider,
      body.tipPercent ?? 0,
      body.boricaCardholder,
    );
  }

  @Post('session/:token/abandon')
  @HttpCode(HttpStatus.NO_CONTENT)
  abandonCheckout(@Param('token') token: string) {
    return this.paymentService.abandonCheckout(token);
  }

  @Post('session/:token/close')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, FeatureGuard)
  @RequireFeature(FeatureFlag.POS)
  closeSession(
    @Req() req: any,
    @Param('token') token: string,
    @Body() body: { restaurantId: string },
  ) {
    return this.paymentService.closeSession(
      token,
      body.restaurantId,
      req.user.id,
    );
  }

  @Post('session/:token/close-card')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, FeatureGuard)
  @RequireFeature(FeatureFlag.POS)
  closeSessionWithCard(
    @Req() req: any,
    @Param('token') token: string,
    @Body() body: { restaurantId: string },
  ) {
    return this.paymentService.closeSessionWithCard(
      token,
      body.restaurantId,
      req.user.id,
    );
  }

  @Post('session/:token/close-cash')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, FeatureGuard)
  @RequireFeature(FeatureFlag.POS)
  closeSessionWithCash(
    @Req() req: any,
    @Param('token') token: string,
    @Body() body: { restaurantId: string },
  ) {
    return this.paymentService.closeSessionWithCash(
      token,
      body.restaurantId,
      req.user.id,
    );
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
    @Query() dateRange: DateRangeQueryDto,
  ) {
    return this.paymentService.getPaymentsOverview(restaurantId, req.user.id, {
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
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
    return this.paymentService.getPaymentHistory(
      restaurantId,
      query,
      req.user.id,
    );
  }

  @Get('export/:restaurantId')
  @UseGuards(JwtAuthGuard, FeatureGuard)
  @RequireFeature(FeatureFlag.PAYMENTS_STRIPE)
  exportPayments(
    @Req() req: any,
    @Param('restaurantId') restaurantId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.paymentService.exportPayments(restaurantId, req.user.id, { from, to });
  }

  @Get(':paymentId')
  @UseGuards(JwtAuthGuard, FeatureGuard)
  @RequireFeature(FeatureFlag.PAYMENTS_STRIPE)
  getPaymentDetail(@Req() req: any, @Param('paymentId') paymentId: string) {
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
    // req.body is a raw Buffer here — main.ts applies express.raw() on this path
    // BEFORE express.json(). DO NOT switch to @Body() or use req.rawBody; Stripe
    // signature verification (constructEvent) requires the original byte sequence.
    return this.paymentService.handleWebhookEvent(req.body, signature);
  }

  @Post('epay/notify')
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @SkipThrottle()
  handleEpayNotify(@Body() body: any) {
    return this.paymentService.handleEpayNotification(body);
  }

  @Post('borica/callback')
  @SkipThrottle()
  async handleBoricaCallback(@Body() body: any, @Res() res: any) {
    const redirectUrl = await this.paymentService.handleBoricaCallback(
      body as Record<string, string>,
    );
    return res.redirect(302, redirectUrl);
  }
}
