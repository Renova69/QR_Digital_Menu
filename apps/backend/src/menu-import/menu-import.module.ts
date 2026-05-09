import { Module } from '@nestjs/common';
import { MenuImportController } from './menu-import.controller';
import { MenuImportService } from './menu-import.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ApiKeyGuard } from './guards/api-key.guard';

@Module({
  imports: [PrismaModule],
  controllers: [MenuImportController],
  providers: [MenuImportService, ApiKeyGuard],
})
export class MenuImportModule {}
