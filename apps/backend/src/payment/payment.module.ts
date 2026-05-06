import { Module } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { StripeProvider } from './stripe.provider';

@Module({
  controllers: [PaymentController],
  providers: [PaymentService, StripeProvider],
  exports: [StripeProvider],
})
export class PaymentModule {}
