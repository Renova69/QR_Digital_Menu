import { Module } from '@nestjs/common';
import { PrintStationService } from './print-station.service';
import { PrintStationController } from './print-station.controller';
import { RestaurantsModule } from '../restaurants/restaurants.module';

@Module({
  imports: [RestaurantsModule],
  controllers: [PrintStationController],
  providers: [PrintStationService],
  exports: [PrintStationService],
})
export class PrintStationModule {}
