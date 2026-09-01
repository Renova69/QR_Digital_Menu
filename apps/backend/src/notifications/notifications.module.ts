import { Global, Module } from '@nestjs/common';
import { NotificationDeliveryController } from './notification-delivery.controller';
import { NotificationDeliveryService } from './notification-delivery.service';
import { EmailReceiptController } from './email-receipt.controller';
import { EmailReceiptService } from './email-receipt.service';
import {
  NOTIFICATION_PROVIDER,
  ProductionNotificationProvider,
} from './notification-provider';
import { SmsReceiptController } from './sms-receipt.controller';
import { SmsGatewayReconciliationService } from './sms-gateway-reconciliation.service';
import { SmsReceiptService } from './sms-receipt.service';
import { SmsUsageService } from './sms-usage.service';

@Global()
@Module({
  controllers: [
    EmailReceiptController,
    NotificationDeliveryController,
    SmsReceiptController,
  ],
  providers: [
    EmailReceiptService,
    NotificationDeliveryService,
    ProductionNotificationProvider,
    SmsGatewayReconciliationService,
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
