import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MenuViewController } from './menu-view.controller';
import { MenuViewService } from './menu-view.service';

@Module({
  imports: [PrismaModule],
  controllers: [MenuViewController],
  providers: [MenuViewService],
})
export class MenuViewModule {}
