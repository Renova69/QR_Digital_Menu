import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { DashboardViewsService } from './dashboard-views.service';
import { OrdersModule } from '../orders/orders.module';
import { AssistanceModule } from '../assistance/assistance.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule, OrdersModule, AssistanceModule],
  controllers: [DashboardController],
  providers: [DashboardService, DashboardViewsService],
})
export class DashboardModule {}
