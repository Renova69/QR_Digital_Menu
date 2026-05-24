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
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { OrderQueryDto } from './dto/order-query.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { FeatureGuard } from '../subscription/feature.guard';
import { RequireFeature } from '../subscription/require-feature.decorator';
import { FeatureFlag } from '../subscription/feature-flag.enum';

@Controller('orders')
export class OrdersController {
  private readonly logger = new Logger(OrdersController.name);

  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @UseGuards(OptionalJwtAuthGuard)
  create(@Body() createOrderDto: CreateOrderDto, @Request() req: any) {
    this.logger.log('POST /orders');
    return this.ordersService.create(createOrderDto, req.user?.id ?? null);
  }

  @RequireFeature(FeatureFlag.ORDERS_RECEIVE)
  @UseGuards(JwtAuthGuard, FeatureGuard)
  @Get()
  findAll(@Request() req: any, @Query() query: OrderQueryDto) {
    this.logger.log(`GET /orders for user ${req.user?.id}`);
    return this.ordersService.findAll(req.user.id, query);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.ordersService.findOne(id, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/status')
  update(
    @Param('id') id: string,
    @Body() updateOrderDto: UpdateOrderDto,
    @Request() req: any,
  ) {
    return this.ordersService.updateStatus(id, updateOrderDto, req.user.id);
  }
}
