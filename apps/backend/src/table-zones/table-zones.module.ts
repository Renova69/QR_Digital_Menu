import { Module } from '@nestjs/common';
import { TableZonesService } from './table-zones.service';
import { TableZonesController } from './table-zones.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [TableZonesController],
  providers: [TableZonesService],
  exports: [TableZonesService],
})
export class TableZonesModule {}
