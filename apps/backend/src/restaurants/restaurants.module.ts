import { Module } from '@nestjs/common';
import { RestaurantsService } from './restaurants.service';
import { RestaurantsController } from './restaurants.controller';
import { DeviceEnrollmentController } from './device-enrollment.controller';
import { DeviceEnrollmentService } from './device-enrollment.service';
import { PrismaModule } from '../prisma/prisma.module';
import { TranslationModule } from '../translation/translation.module';
import { PaymentModule } from '../payment/payment.module';

@Module({
  imports: [PrismaModule, TranslationModule, PaymentModule],
  controllers: [RestaurantsController, DeviceEnrollmentController],
  providers: [RestaurantsService, DeviceEnrollmentService],
  exports: [RestaurantsService, DeviceEnrollmentService],
})
export class RestaurantsModule {}
