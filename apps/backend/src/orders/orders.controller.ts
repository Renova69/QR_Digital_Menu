import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Query,
  UseGuards,
  Request,
  Logger,
  Headers,
  BadRequestException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { BulkUpdateOrderStatusDto } from './dto/bulk-update-order-status.dto';
import { OrderQueryDto } from './dto/order-query.dto';
import { RequireRestaurantAccess } from '../auth/require-restaurant-access.decorator';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { FeatureGuard } from '../subscription/feature.guard';
import { RequireFeature } from '../subscription/require-feature.decorator';
import { FeatureFlag } from '../subscription/feature-flag.enum';

type AuthenticatedOrderRequest = {
  user: { id: string };
};

@Controller('orders')
export class OrdersController {
  private readonly logger = new Logger(OrdersController.name);

  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @UseGuards(OptionalJwtAuthGuard)
  // P0-6: this route is public, CSRF-exempt, and resolves a table by its
  // (guessable) name, so it was the cheapest lever for probing a restaurant's
  // tables one after another. It previously fell back to the global 100/60s
  // bucket. 30/60s matches POST /payments/session and leaves ample headroom
  // over real ordering volume.
  //
  // Note this is only as strong as the throttler's key. Until the tracker is
  // fixed to key on the real client (see P1-1 — `trust proxy` is unset, so
  // req.ip resolves to infrastructure rather than the caller), this behaves
  // closer to a platform-wide budget than a per-caller one, which is why the
  // limit is set generously rather than tight.
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  create(
    @Body() createOrderDto: CreateOrderDto,
    @Request() req: { user?: { id: string } },
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    this.logger.log('POST /orders');
    const normalizedKey = idempotencyKey?.trim();
    // `source` is a client-supplied DTO field — any authenticated caller can
    // set `source: 'POS'` without providing `posSubmission`. Only a real POS
    // submission carries its own durable clientOrderId (validated below in
    // OrdersService), which is what actually stands in for the idempotency
    // key. Gate on `posSubmission` presence, not the self-reported `source`
    // string, or public/customer orders can skip idempotency entirely.
    if (!createOrderDto.posSubmission && !normalizedKey) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Idempotency-Key is required for customer orders.',
      });
    }
    if (normalizedKey && normalizedKey.length > 128) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_INVALID',
        message: 'Idempotency-Key must be at most 128 characters.',
      });
    }
    return this.ordersService.create(
      createOrderDto,
      req.user?.id ?? null,
      normalizedKey ?? null,
    );
  }

  @RequireFeature(FeatureFlag.ORDERS_RECEIVE)
  @UseGuards(FeatureGuard)
  @RequireRestaurantAccess({
    policy: 'service-list',
    source: 'query',
    key: 'restaurantId',
  })
  @Get()
  findAll(
    @Request() req: AuthenticatedOrderRequest,
    @Query() query: OrderQueryDto,
  ) {
    this.logger.log(`GET /orders for user ${req.user?.id}`);
    return this.ordersService.findAll(req.user.id, query);
  }

  @RequireFeature(FeatureFlag.ORDERS_RECEIVE)
  @UseGuards(FeatureGuard)
  @RequireRestaurantAccess({
    policy: 'service-member',
    source: 'params',
    key: 'orderId',
    resource: 'order',
  })
  @Get(':orderId')
  findOne(
    @Param('orderId') id: string,
    @Request() req: AuthenticatedOrderRequest,
  ) {
    return this.ordersService.findOne(id, req.user.id);
  }

  @RequireFeature(FeatureFlag.ORDERS_RECEIVE)
  @UseGuards(FeatureGuard)
  @RequireRestaurantAccess({
    policy: 'service-member',
    source: 'body',
    key: 'restaurantId',
    resource: 'restaurant',
  })
  @Patch('status/bulk')
  bulkUpdate(
    @Body() bulkUpdateOrderStatusDto: BulkUpdateOrderStatusDto,
    @Request() req: AuthenticatedOrderRequest,
  ) {
    return this.ordersService.bulkUpdateStatus(
      bulkUpdateOrderStatusDto,
      req.user.id,
    );
  }

  @RequireFeature(FeatureFlag.ORDERS_RECEIVE)
  @UseGuards(FeatureGuard)
  @RequireRestaurantAccess({
    policy: 'order-update',
    source: 'params',
    key: 'orderId',
    resource: 'order',
  })
  @Patch(':orderId/status')
  update(
    @Param('orderId') id: string,
    @Body() updateOrderDto: UpdateOrderDto,
    @Request() req: AuthenticatedOrderRequest,
  ) {
    return this.ordersService.updateStatus(id, updateOrderDto, req.user.id);
  }
}
