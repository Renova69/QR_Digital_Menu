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
import { SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
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

  @Post('session/force-open')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
  closeSession(
    @Param('token') token: string,
    @Body() body: { restaurantId: string },
  ) {
    return this.paymentService.closeSession(token, body.restaurantId);
  }

  @Post('session/:token/close-card')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  closeSessionWithCard(
    @Param('token') token: string,
    @Body() body: { restaurantId: string },
  ) {
    return this.paymentService.closeSessionWithCard(token, body.restaurantId);
  }

  @Post('session/:token/close-cash')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  closeSessionWithCash(
    @Param('token') token: string,
    @Body() body: { restaurantId: string },
  ) {
    return this.paymentService.closeSessionWithCash(token, body.restaurantId);
  }

  @Get('sessions/:restaurantId')
  @UseGuards(JwtAuthGuard)
  getTableSessions(
    @Param('restaurantId') restaurantId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.paymentService.getTableSessions(
      restaurantId,
      page ? parseInt(page, 10) : undefined,
      limit ? parseInt(limit, 10) : undefined,
    );
  }

  @Get('history/:restaurantId')
  @UseGuards(JwtAuthGuard)
  getPaymentHistory(
    @Param('restaurantId') restaurantId: string,
    @Query() query: PaymentHistoryQueryDto,
  ) {
    return this.paymentService.getPaymentHistory(restaurantId, query);
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
