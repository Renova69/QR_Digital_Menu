import { Module } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { StripeProvider } from './stripe.provider';
import { EpayProvider } from './epay.provider';
import { BoricaProvider } from './borica.provider';
import { MyposProvider } from './mypos.provider';

@Module({
  controllers: [PaymentController],
  providers: [
    PaymentService,
    StripeProvider,
    EpayProvider,
    BoricaProvider,
    MyposProvider,
  ],
  exports: [StripeProvider],
})
export class PaymentModule {}
