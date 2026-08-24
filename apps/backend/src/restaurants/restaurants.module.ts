import { Module } from '@nestjs/common';
import { PinSecurityService } from '../auth/pin-security.service';
import { RestaurantsService } from './restaurants.service';
import { RestaurantsController } from './restaurants.controller';
import { DeviceEnrollmentController } from './device-enrollment.controller';
import { DeviceEnrollmentService } from './device-enrollment.service';
import { StaffController } from './staff.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { TranslationModule } from '../translation/translation.module';
import { PaymentModule } from '../payment/payment.module';
import { UsersModule } from '../users/users.module';
import { MenuModule } from '../menu/menu.module';
import { SlugModule } from './slug/slug.module';
import {
  OnboardingSlugController,
  SlugController,
} from './slug/slug.controller';

@Module({
  imports: [
    PrismaModule,
    TranslationModule,
    PaymentModule,
    UsersModule,
    MenuModule,
    SlugModule,
  ],
  controllers: [
    RestaurantsController,
    DeviceEnrollmentController,
    StaffController,
    OnboardingSlugController,
    SlugController,
  ],
  providers: [RestaurantsService, DeviceEnrollmentService, PinSecurityService],
  exports: [RestaurantsService, DeviceEnrollmentService],
})
export class RestaurantsModule {}
