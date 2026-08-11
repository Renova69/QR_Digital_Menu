import { Module } from '@nestjs/common';
import { MenuCrudService } from './menu-crud.service';
import { MenuTranslationService } from './menu-translation.service';
import { MenuTranslationReadService } from './menu-translation-read.service';
import { MenuTranslationEnqueueService } from './menu-translation-enqueue.service';
import { MenuTranslationWorkerService } from './menu-translation-worker.service';
import { MenuAuditService } from './menu-audit.service';
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
import { WeatherUpsellService } from './upsell/weather-upsell.service';
import { BulkItemController } from './bulk-item.controller';
import { MenuBulkEditService } from './menu-bulk-edit.service';
import { MenuTranslationOverrideService } from './menu-translation-override.service';

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
    BulkItemController,
  ],
  providers: [
    MenuCrudService,
    MenuTranslationService,
    MenuTranslationReadService,
    MenuTranslationEnqueueService,
    MenuTranslationWorkerService,
    MenuAuditService,
    WeatherUpsellService,
    MenuBulkEditService,
    MenuTranslationOverrideService,
  ],
  exports: [
    MenuCrudService,
    MenuTranslationService,
    MenuTranslationReadService,
    MenuTranslationEnqueueService,
    MenuTranslationWorkerService,
    MenuAuditService,
    MenuTranslationOverrideService,
  ],
})
export class MenuModule {}
