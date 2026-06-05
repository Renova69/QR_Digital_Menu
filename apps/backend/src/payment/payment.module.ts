import { Module } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { StripeProvider } from './stripe.provider';
import { EpayProvider } from './epay.provider';

@Module({
  controllers: [PaymentController],
  providers: [PaymentService, StripeProvider, EpayProvider],
  exports: [StripeProvider],
})
export class PaymentModule {}
