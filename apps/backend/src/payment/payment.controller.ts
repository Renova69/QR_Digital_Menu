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
import { PaymentExportQueryDto } from './dto/payment-export-query.dto';
import { CreatePaymentIntentDto } from './dto/create-payment-intent.dto';
import { RefundPaymentDto } from './dto/refund-payment.dto';
import { SettlePartialDto } from './dto/settle-partial.dto';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { CreateCashRequestDto } from './dto/create-cash-request.dto';
import { PaymentReconciliationQueryDto } from './dto/payment-reconciliation-query.dto';
import { ResolvePaymentReconciliationDto } from './dto/resolve-payment-reconciliation.dto';
import { ReopenSessionReconciliationDto } from './dto/reopen-session-reconciliation.dto';
import { DateRangeQueryDto } from '../common/dto/date-range-query.dto';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { RequireRestaurantAccess } from '../auth/require-restaurant-access.decorator';
import { PaymentService } from './payment.service';
import { FeatureGuard } from '../subscription/feature.guard';
import { RequireFeature } from '../subscription/require-feature.decorator';
import { FeatureFlag } from '../subscription/feature-flag.enum';
import { TableSessionToken } from './table-session-token.decorator';

type PaymentActorRequest = { user: { id: string } };

@Controller('payments')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post('session')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
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
  @UseGuards(FeatureGuard)
  @RequireRestaurantAccess({
    policy: 'payment-pos',
    source: 'body',
    key: 'restaurantId',
    resource: 'restaurant',
  })
  @RequireFeature(FeatureFlag.POS)
  forceOpenSession(
    @Req() req: PaymentActorRequest,
    @Body() body: { tableId: string; restaurantId: string },
  ) {
    return this.paymentService.forceOpenSession(
      body.tableId,
      body.restaurantId,
      req.user.id,
    );
  }

  @Get('session/bill')
  getSessionBill(
    @TableSessionToken() token: string,
    @Query('lang') lang?: string,
  ) {
    return this.paymentService.getSessionBill(token, lang);
  }

  @Post('session/intent')
  @HttpCode(HttpStatus.OK)
  createPaymentIntent(
    @TableSessionToken() token: string,
    @Body() body: CreatePaymentIntentDto,
  ) {
    return this.paymentService.createPaymentIntent(token, body.tipPercent ?? 0);
  }

  @Post('session/checkout')
  @HttpCode(HttpStatus.OK)
  createCheckout(
    @TableSessionToken() token: string,
    @Body() body: CreateCheckoutDto,
  ) {
    const provider = (body.provider ?? 'STRIPE').toUpperCase() as
      | 'STRIPE'
      | 'EPAY'
      | 'BORICA'
      | 'MYPOS';
    return this.paymentService.createCheckout(
      token,
      provider,
      body.tipPercent ?? 0,
      body.boricaCardholder,
      { orderIds: body.orderIds },
    );
  }

  @Post('session/cash-request')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  createCashPaymentRequest(
    @TableSessionToken() token: string,
    @Body() body: CreateCashRequestDto,
  ) {
    return this.paymentService.createCashPaymentRequest(
      token,
      body.restaurantId,
      { orderIds: body.orderIds },
    );
  }

  @Post('session/abandon')
  @HttpCode(HttpStatus.NO_CONTENT)
  abandonCheckout(@TableSessionToken() token: string) {
    return this.paymentService.abandonCheckout(token);
  }

  @Post('session/close')
  @HttpCode(HttpStatus.OK)
  @UseGuards(FeatureGuard)
  @RequireRestaurantAccess({
    policy: 'payment-pos',
    source: 'body',
    key: 'restaurantId',
    resource: 'restaurant',
  })
  @RequireFeature(FeatureFlag.POS)
  closeSession(
    @Req() req: PaymentActorRequest,
    @TableSessionToken() token: string,
    @Body() body: { restaurantId: string },
  ) {
    return this.paymentService.closeSession(
      token,
      body.restaurantId,
      req.user.id,
    );
  }

  @Post('session/close-card')
  @HttpCode(HttpStatus.OK)
  @UseGuards(FeatureGuard)
  @RequireRestaurantAccess({
    policy: 'payment-pos',
    source: 'body',
    key: 'restaurantId',
    resource: 'restaurant',
  })
  @RequireFeature(FeatureFlag.POS)
  closeSessionWithCard(
    @Req() req: PaymentActorRequest,
    @TableSessionToken() token: string,
    @Body() body: { restaurantId: string },
  ) {
    return this.paymentService.closeSessionWithCard(
      token,
      body.restaurantId,
      req.user.id,
    );
  }

  @Post('session/close-cash')
  @HttpCode(HttpStatus.OK)
  @UseGuards(FeatureGuard)
  @RequireRestaurantAccess({
    policy: 'payment-pos',
    source: 'body',
    key: 'restaurantId',
    resource: 'restaurant',
  })
  @RequireFeature(FeatureFlag.POS)
  closeSessionWithCash(
    @Req() req: PaymentActorRequest,
    @TableSessionToken() token: string,
    @Body() body: { restaurantId: string },
  ) {
    return this.paymentService.closeSessionWithCash(
      token,
      body.restaurantId,
      req.user.id,
    );
  }

  @Post('session/reconcile-pending')
  @HttpCode(HttpStatus.OK)
  @UseGuards(FeatureGuard)
  @RequireRestaurantAccess({
    policy: 'payment-pos',
    source: 'headers',
    key: 'x-table-session-token',
    resource: 'table-session',
  })
  @RequireFeature(FeatureFlag.POS)
  reconcileStuckSession(
    @Req() req: PaymentActorRequest,
    @TableSessionToken() token: string,
  ) {
    return this.paymentService.reconcileStuckSession(token, req.user.id);
  }

  @Post('session/settle-partial')
  @HttpCode(HttpStatus.OK)
  @UseGuards(FeatureGuard)
  @RequireRestaurantAccess({
    policy: 'payment-pos',
    source: 'body',
    key: 'restaurantId',
    resource: 'restaurant',
  })
  @RequireFeature(FeatureFlag.POS)
  settlePartial(
    @Req() req: PaymentActorRequest,
    @TableSessionToken() token: string,
    @Body() body: SettlePartialDto,
  ) {
    return this.paymentService.settlePartial(
      token,
      body.restaurantId,
      req.user.id,
      body,
    );
  }

  @Get('sessions/:restaurantId')
  @UseGuards(FeatureGuard)
  @RequireRestaurantAccess({
    policy: 'payment-management',
    source: 'params',
    key: 'restaurantId',
    resource: 'restaurant',
  })
  @RequireFeature(FeatureFlag.PAYMENTS_STRIPE)
  getTableSessions(
    @Req() req: PaymentActorRequest,
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
  @UseGuards(FeatureGuard)
  @RequireRestaurantAccess({
    policy: 'payment-management',
    source: 'params',
    key: 'restaurantId',
    resource: 'restaurant',
  })
  @RequireFeature(FeatureFlag.PAYMENTS_STRIPE)
  getPaymentsOverview(
    @Req() req: PaymentActorRequest,
    @Param('restaurantId') restaurantId: string,
    @Query() dateRange: DateRangeQueryDto,
  ) {
    return this.paymentService.getPaymentsOverview(restaurantId, req.user.id, {
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
    });
  }

  @Get('payouts/:restaurantId')
  @UseGuards(FeatureGuard)
  @RequireRestaurantAccess({
    policy: 'payment-management',
    source: 'params',
    key: 'restaurantId',
    resource: 'restaurant',
  })
  @RequireFeature(FeatureFlag.PAYMENTS_STRIPE)
  getPayoutsSnapshot(
    @Req() req: PaymentActorRequest,
    @Param('restaurantId') restaurantId: string,
  ) {
    return this.paymentService.getPayoutsSnapshot(restaurantId, req.user.id);
  }

  @Get('settings/:restaurantId')
  @UseGuards(FeatureGuard)
  @RequireRestaurantAccess({
    policy: 'payment-management',
    source: 'params',
    key: 'restaurantId',
    resource: 'restaurant',
  })
  @RequireFeature(FeatureFlag.PAYMENTS_STRIPE)
  getPaymentSettings(
    @Req() req: PaymentActorRequest,
    @Param('restaurantId') restaurantId: string,
  ) {
    return this.paymentService.getPaymentSettings(restaurantId, req.user.id);
  }

  @Get('history/:restaurantId')
  @UseGuards(FeatureGuard)
  @RequireRestaurantAccess({
    policy: 'payment-management',
    source: 'params',
    key: 'restaurantId',
    resource: 'restaurant',
  })
  @RequireFeature(FeatureFlag.PAYMENTS_STRIPE)
  getPaymentHistory(
    @Req() req: PaymentActorRequest,
    @Param('restaurantId') restaurantId: string,
    @Query() query: PaymentHistoryQueryDto,
  ) {
    return this.paymentService.getPaymentHistory(
      restaurantId,
      query,
      req.user.id,
    );
  }

  @Get('notifications/:restaurantId')
  @RequireRestaurantAccess({
    policy: 'payment-staff',
    source: 'params',
    key: 'restaurantId',
    resource: 'restaurant',
  })
  getPaymentNotificationFeed(
    @Req() req: PaymentActorRequest,
    @Param('restaurantId') restaurantId: string,
    @Query('limit') limit?: string,
  ) {
    return this.paymentService.getPaymentNotificationFeed(
      restaurantId,
      req.user.id,
      limit ? parseInt(limit, 10) : undefined,
    );
  }

  @Post('notifications/:restaurantId/read')
  @HttpCode(HttpStatus.OK)
  @RequireRestaurantAccess({
    policy: 'payment-staff',
    source: 'params',
    key: 'restaurantId',
    resource: 'restaurant',
  })
  markPaymentNotificationsRead(
    @Req() req: PaymentActorRequest,
    @Param('restaurantId') restaurantId: string,
  ) {
    return this.paymentService.markPaymentNotificationsRead(
      restaurantId,
      req.user.id,
    );
  }

  @Get('reconciliation/:restaurantId')
  @UseGuards(FeatureGuard)
  @RequireRestaurantAccess({
    policy: 'payment-management',
    source: 'params',
    key: 'restaurantId',
    resource: 'restaurant',
  })
  @RequireFeature(FeatureFlag.PAYMENTS_STRIPE)
  getPaymentReconciliationIssues(
    @Req() req: PaymentActorRequest,
    @Param('restaurantId') restaurantId: string,
    @Query() query: PaymentReconciliationQueryDto,
  ) {
    return this.paymentService.getPaymentReconciliationIssues(
      restaurantId,
      req.user.id,
      query.status,
    );
  }

  @Post('reconciliation/issues/:issueId/resolve')
  @HttpCode(HttpStatus.OK)
  @UseGuards(FeatureGuard)
  @RequireRestaurantAccess({
    policy: 'payment-management',
    source: 'params',
    key: 'issueId',
    resource: 'payment-issue',
  })
  @RequireFeature(FeatureFlag.PAYMENTS_STRIPE)
  resolvePaymentReconciliationIssue(
    @Req() req: PaymentActorRequest,
    @Param('issueId') issueId: string,
    @Body() body: ResolvePaymentReconciliationDto,
  ) {
    return this.paymentService.resolvePaymentReconciliationIssue(
      issueId,
      req.user.id,
      body.status,
      body.note,
    );
  }

  @Post('reconciliation/issues/:issueId/reopen-session')
  @HttpCode(HttpStatus.OK)
  @UseGuards(FeatureGuard)
  @RequireRestaurantAccess({
    policy: 'payment-management',
    source: 'params',
    key: 'issueId',
    resource: 'payment-issue',
  })
  @RequireFeature(FeatureFlag.PAYMENTS_STRIPE)
  reopenSessionForRecollection(
    @Req() req: PaymentActorRequest,
    @Param('issueId') issueId: string,
    @Body() body: ReopenSessionReconciliationDto,
  ) {
    return this.paymentService.reopenSessionForRecollection(
      issueId,
      req.user.id,
      body.note,
    );
  }

  @Get('cash-requests/:restaurantId')
  @RequireRestaurantAccess({
    policy: 'payment-staff',
    source: 'params',
    key: 'restaurantId',
    resource: 'restaurant',
  })
  getCashPaymentRequests(
    @Req() req: PaymentActorRequest,
    @Param('restaurantId') restaurantId: string,
    @Query('status') status?: string,
  ) {
    return this.paymentService.listCashPaymentRequests(
      restaurantId,
      req.user.id,
      status,
    );
  }

  @Post('cash-requests/:id/confirm')
  @HttpCode(HttpStatus.OK)
  @RequireRestaurantAccess({
    policy: 'payment-cash',
    source: 'params',
    key: 'id',
    resource: 'cash-request',
  })
  confirmCashPaymentRequest(
    @Req() req: PaymentActorRequest,
    @Param('id') id: string,
  ) {
    return this.paymentService.confirmCashPaymentRequest(id, req.user.id);
  }

  @Post('cash-requests/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequireRestaurantAccess({
    policy: 'payment-cash',
    source: 'params',
    key: 'id',
    resource: 'cash-request',
  })
  cancelCashPaymentRequest(
    @Req() req: PaymentActorRequest,
    @Param('id') id: string,
  ) {
    return this.paymentService.cancelCashPaymentRequest(id, req.user.id);
  }

  @Get('export/:restaurantId')
  @UseGuards(FeatureGuard)
  @RequireRestaurantAccess({
    policy: 'payment-management',
    source: 'params',
    key: 'restaurantId',
    resource: 'restaurant',
  })
  @RequireFeature(FeatureFlag.PAYMENTS_STRIPE)
  exportPayments(
    @Req() req: PaymentActorRequest,
    @Param('restaurantId') restaurantId: string,
    @Query() query: PaymentExportQueryDto,
  ) {
    return this.paymentService.exportPayments(restaurantId, req.user.id, query);
  }

  @Get(':paymentId')
  @UseGuards(FeatureGuard)
  @RequireRestaurantAccess({
    policy: 'payment-management',
    source: 'params',
    key: 'paymentId',
    resource: 'payment',
  })
  @RequireFeature(FeatureFlag.PAYMENTS_STRIPE)
  getPaymentDetail(
    @Req() req: PaymentActorRequest,
    @Param('paymentId') paymentId: string,
  ) {
    return this.paymentService.getPaymentDetail(paymentId, req.user.id);
  }

  @Post(':paymentId/refund')
  @HttpCode(HttpStatus.OK)
  @UseGuards(FeatureGuard)
  @RequireRestaurantAccess({
    policy: 'payment-management',
    source: 'params',
    key: 'paymentId',
    resource: 'payment',
  })
  @RequireFeature(FeatureFlag.PAYMENTS_STRIPE)
  refundPayment(
    @Req() req: PaymentActorRequest,
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

  @Post('mypos/notify')
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @SkipThrottle()
  handleMyposNotify(@Body() body: any) {
    return this.paymentService.handleMyposNotification(body);
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
