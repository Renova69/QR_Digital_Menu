import { Module } from '@nestjs/common';
import { TablesService } from './tables.service';
import { PrismaModule } from '../prisma/prisma.module';
import { TablesController } from './tables.controller';

@Module({
  imports: [PrismaModule],
  controllers: [TablesController],
  providers: [TablesService],
})
export class TablesModule {}
