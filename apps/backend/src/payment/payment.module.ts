import { Module } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { StripeProvider } from './stripe.provider';
import { EpayProvider } from './epay.provider';
import { BoricaProvider } from './borica.provider';

@Module({
  controllers: [PaymentController],
  providers: [PaymentService, StripeProvider, EpayProvider, BoricaProvider],
  exports: [StripeProvider],
})
export class PaymentModule {}
