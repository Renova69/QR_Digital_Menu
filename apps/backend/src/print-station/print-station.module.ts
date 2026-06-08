import { Module, forwardRef } from '@nestjs/common';
import { PrintStationService } from './print-station.service';
import { PrintStationController } from './print-station.controller';
import { RestaurantsModule } from '../restaurants/restaurants.module';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [RestaurantsModule, forwardRef(() => EventsModule)],
  controllers: [PrintStationController],
  providers: [PrintStationService],
  exports: [PrintStationService],
})
export class PrintStationModule {}
