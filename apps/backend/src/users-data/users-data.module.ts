import { Module } from '@nestjs/common';
import { UsersDataController } from './users-data.controller';
import { UsersDataService } from './users-data.service';
import { RetentionService } from './retention.service';
import { PrismaModule } from '../prisma/prisma.module';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';

@Module({
  imports: [PrismaModule, PlatformSettingsModule],
  controllers: [UsersDataController],
  providers: [UsersDataService, RetentionService],
})
export class UsersDataModule {}
