import { Module } from '@nestjs/common';
import { MenuService } from './menu.service';
import {
  CategoryController,
  CategoryDetailController,
} from './category.controller';
import { ItemController, ItemDetailController } from './item.controller';
import { PublicMenuController } from './public-menu.controller';
import {
  MenuOptionController,
  MenuOptionDetailController,
} from './menu-option.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { TranslationModule } from '../translation/translation.module';

import { MenuAuditController } from './audit.controller';

@Module({
  imports: [PrismaModule, TranslationModule],
  controllers: [
    CategoryController,
    CategoryDetailController,
    ItemController,
    ItemDetailController,
    PublicMenuController,
    MenuAuditController,
    MenuOptionController,
    MenuOptionDetailController,
  ],
  providers: [MenuService],
  exports: [MenuService],
})
export class MenuModule {}
