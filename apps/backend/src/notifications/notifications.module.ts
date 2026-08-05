import { Global, Module } from '@nestjs/common';
import { NotificationDeliveryController } from './notification-delivery.controller';
import { NotificationDeliveryService } from './notification-delivery.service';
import {
  NOTIFICATION_PROVIDER,
  ProductionNotificationProvider,
} from './notification-provider';

@Global()
@Module({
  controllers: [NotificationDeliveryController],
  providers: [
    NotificationDeliveryService,
    ProductionNotificationProvider,
    {
      provide: NOTIFICATION_PROVIDER,
      useExisting: ProductionNotificationProvider,
    },
  ],
  exports: [NotificationDeliveryService],
})
export class NotificationsModule {}
