import { Module } from '@nestjs/common';
import { RestaurantsService } from './restaurants.service';
import { RestaurantsController } from './restaurants.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { TranslationModule } from '../translation/translation.module';
import { PaymentModule } from '../payment/payment.module';

@Module({
  imports: [PrismaModule, TranslationModule, PaymentModule],
  controllers: [RestaurantsController],
  providers: [RestaurantsService],
  exports: [RestaurantsService],
})
export class RestaurantsModule {}
