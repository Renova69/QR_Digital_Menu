import { Module } from '@nestjs/common';
import { TablesService } from './tables.service';
import { PrismaModule } from '../prisma/prisma.module';
import { EventsModule } from '../events/events.module';
import { TablesController } from './tables.controller';

@Module({
  imports: [PrismaModule, EventsModule],
  controllers: [TablesController],
  providers: [TablesService],
})
export class TablesModule {}
