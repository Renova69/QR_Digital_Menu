import { Module } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { StripeProvider } from './stripe.provider';
import { EpayProvider } from './epay.provider';
import { BoricaProvider } from './borica.provider';
import { MyposProvider } from './mypos.provider';
import { PaymentProviderConfigService } from './payment-provider-config.service';
import { PaymentCoreService } from './core/payment-core.service';
import { PaymentReportingService } from './reporting/payment-reporting.service';
import { StripeCheckoutService } from './providers/stripe-checkout.service';
import { EpayCheckoutService } from './providers/epay-checkout.service';
import { MyposCheckoutService } from './providers/mypos-checkout.service';
import { BoricaCheckoutService } from './providers/borica-checkout.service';
import { PaymentSessionService } from './session/payment-session.service';
import { PaymentSettlementService } from './session/payment-settlement.service';
import { PaymentNotificationFeedService } from './notifications/payment-notification-feed.service';
import { SlugModule } from '../restaurants/slug/slug.module';

@Module({
  imports: [SlugModule],
  controllers: [PaymentController],
  providers: [
    PaymentService,
    PaymentProviderConfigService,
    PaymentCoreService,
    PaymentReportingService,
    StripeCheckoutService,
    EpayCheckoutService,
    MyposCheckoutService,
    BoricaCheckoutService,
    PaymentSessionService,
    PaymentSettlementService,
    PaymentNotificationFeedService,
    StripeProvider,
    EpayProvider,
    BoricaProvider,
    MyposProvider,
  ],
  exports: [StripeProvider, PaymentProviderConfigService],
})
export class PaymentModule {}
