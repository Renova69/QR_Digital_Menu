import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Req,
  Headers,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PaymentService } from './payment.service';

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
  closeSession(
    @Param('token') token: string,
    @Body() body: { restaurantId: string },
  ) {
    return this.paymentService.closeSession(token, body.restaurantId);
  }

  @Get('sessions/:restaurantId')
  getTableSessions(@Param('restaurantId') restaurantId: string) {
    return this.paymentService.getTableSessions(restaurantId);
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
