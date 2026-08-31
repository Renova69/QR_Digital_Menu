import { Global, Module } from '@nestjs/common';
import { NotificationDeliveryController } from './notification-delivery.controller';
import { NotificationDeliveryService } from './notification-delivery.service';
import {
  NOTIFICATION_PROVIDER,
  ProductionNotificationProvider,
} from './notification-provider';
import { SmsReceiptController } from './sms-receipt.controller';
import { SmsReceiptService } from './sms-receipt.service';
import { SmsUsageService } from './sms-usage.service';

@Global()
@Module({
  controllers: [NotificationDeliveryController, SmsReceiptController],
  providers: [
    NotificationDeliveryService,
    ProductionNotificationProvider,
    SmsReceiptService,
    SmsUsageService,
    {
      provide: NOTIFICATION_PROVIDER,
      useExisting: ProductionNotificationProvider,
    },
  ],
  exports: [NotificationDeliveryService],
})
export class NotificationsModule {}
