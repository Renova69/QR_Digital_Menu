import { Module } from '@nestjs/common';
import { PublicReservationsController } from './public-reservations.controller';
import { ReservationRedirectController } from './reservation-redirect.controller';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';
import { ReservationAvailabilityService } from './reservation-availability.service';
import { ReservationAllergensService } from './reservation-allergens.service';
import { ReservationAccessService } from './reservation-access.service';
import { ReservationSettingsService } from './reservation-settings.service';
import { ReservationBlackoutService } from './reservation-blackout.service';
import { ReservationAnalyticsService } from './reservation-analytics.service';
import { PatronService } from './patron.service';
import { ReservationNotificationsService } from './reservation-notifications.service';
import { ReservationReminderService } from './reservation-reminder.service';
import { SlugModule } from '../restaurants/slug/slug.module';

@Module({
  imports: [SlugModule],
  controllers: [
    PublicReservationsController,
    ReservationRedirectController,
    ReservationsController,
  ],
  providers: [
    ReservationsService,
    ReservationAvailabilityService,
    ReservationAllergensService,
    ReservationAccessService,
    ReservationSettingsService,
    ReservationBlackoutService,
    ReservationAnalyticsService,
    PatronService,
    ReservationNotificationsService,
    ReservationReminderService,
  ],
})
export class ReservationsModule {}
