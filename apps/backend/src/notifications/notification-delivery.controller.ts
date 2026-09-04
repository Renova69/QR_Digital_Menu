import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Request,
} from '@nestjs/common';
import { ApiQuery } from '@nestjs/swagger';
import { NotificationDeliveryStatus } from '@prisma/client';
import { RequireRestaurantAccess } from '../auth/require-restaurant-access.decorator';
import {
  NotificationDeliveryService,
  type NotificationDeliverySourceFamily,
} from './notification-delivery.service';

type NotificationDeliveryRequest = {
  user: { id: string; role: string };
};

@RequireRestaurantAccess({
  policy: 'notification-management',
  source: 'params',
  key: 'restaurantId',
})
@Controller('restaurants/:restaurantId/notification-deliveries')
export class NotificationDeliveryController {
  constructor(private readonly deliveries: NotificationDeliveryService) {}

  @Get()
  @ApiQuery({
    name: 'sourceFamily',
    required: false,
    enum: ['RESERVATION'],
  })
  list(
    @Param('restaurantId') restaurantId: string,
    @Request() request: NotificationDeliveryRequest,
    @Query('status') requestedStatus?: string,
    @Query('sourceFamily') requestedSourceFamily?: string,
  ) {
    this.assertManagerRole(request);
    const status = Object.values(NotificationDeliveryStatus).includes(
      requestedStatus as NotificationDeliveryStatus,
    )
      ? (requestedStatus as NotificationDeliveryStatus)
      : undefined;
    const sourceFamily: NotificationDeliverySourceFamily | undefined =
      requestedSourceFamily === 'RESERVATION' ? 'RESERVATION' : undefined;
    return this.deliveries.listForRestaurant(
      restaurantId,
      request.user.id,
      status,
      sourceFamily,
    );
  }

  @Get('sms-usage')
  smsUsage(
    @Param('restaurantId') restaurantId: string,
    @Request() request: NotificationDeliveryRequest,
    @Query('periodMonth') periodMonth?: string,
  ) {
    this.assertManagerRole(request);
    return this.deliveries.getSmsUsage(
      restaurantId,
      request.user.id,
      periodMonth,
    );
  }

  @Post(':deliveryId/retry')
  retry(
    @Param('restaurantId') restaurantId: string,
    @Param('deliveryId') deliveryId: string,
    @Request() request: NotificationDeliveryRequest,
  ) {
    this.assertManagerRole(request);
    return this.deliveries.retryFailed(
      restaurantId,
      deliveryId,
      request.user.id,
    );
  }

  private assertManagerRole(request: NotificationDeliveryRequest): void {
    const role = String(request.user?.role ?? '').toUpperCase();
    if (role !== 'OWNER' && role !== 'MANAGER') {
      throw new ForbiddenException(
        'Only owners and managers can inspect notification delivery state',
      );
    }
  }
}
