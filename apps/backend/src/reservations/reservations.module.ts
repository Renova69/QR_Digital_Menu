import { Module } from '@nestjs/common';
import { PublicReservationsController } from './public-reservations.controller';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';
import { ReservationAvailabilityService } from './reservation-availability.service';
import { ReservationAllergensService } from './reservation-allergens.service';
import { PatronService } from './patron.service';
import { ReservationNotificationsService } from './reservation-notifications.service';

@Module({
  controllers: [PublicReservationsController, ReservationsController],
  providers: [
    ReservationsService,
    ReservationAvailabilityService,
    ReservationAllergensService,
    PatronService,
    ReservationNotificationsService,
  ],
})
export class ReservationsModule {}
