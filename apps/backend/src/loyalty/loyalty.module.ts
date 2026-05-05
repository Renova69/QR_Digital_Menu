import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { LoyaltyController } from './loyalty.controller';
import { LoyaltyService } from './loyalty.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [LoyaltyController],
  providers: [LoyaltyService],
})
export class LoyaltyModule {}
