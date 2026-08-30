import { Module } from '@nestjs/common';
import { SuperAdminController } from './super-admin.controller';
import { SuperAdminService } from './super-admin.service';
import { PrismaModule } from '../prisma/prisma.module';
import { MenuImportModule } from '../menu-import/menu-import.module';
import { EventsModule } from '../events/events.module';
import { SlugModule } from '../restaurants/slug/slug.module';
import { SessionRevocationModule } from '../auth/session-revocation.module';

@Module({
  imports: [
    PrismaModule,
    MenuImportModule,
    EventsModule,
    SlugModule,
    SessionRevocationModule,
  ],
  controllers: [SuperAdminController],
  providers: [SuperAdminService],
})
export class SuperAdminModule {}
