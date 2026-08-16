import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { PrintStationModule } from '../print-station/print-station.module';
import { PaymentModule } from '../payment/payment.module';
import { SlugModule } from '../restaurants/slug/slug.module';

@Module({
  imports: [
    PrismaModule,
    PassportModule,
    PrintStationModule,
    PaymentModule,
    SlugModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
