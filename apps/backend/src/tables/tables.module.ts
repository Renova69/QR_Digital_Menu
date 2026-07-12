import { Module } from '@nestjs/common';
import { TablesService } from './tables.service';
import { PrismaModule } from '../prisma/prisma.module';
import { EventsModule } from '../events/events.module';
import { TablesController } from './tables.controller';
import { PaymentModule } from '../payment/payment.module';

@Module({
  imports: [PrismaModule, EventsModule, PaymentModule],
  controllers: [TablesController],
  providers: [TablesService],
})
export class TablesModule {}
