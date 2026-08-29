import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SessionRevocationService } from './session-revocation.service';
import { StepUpAuthGuard } from './step-up-auth.guard';

/**
 * Standalone so both AuthModule (HTTP) and EventsModule (websocket) can import
 * the same revocation rules without pulling in each other.
 */
@Module({
  imports: [PrismaModule],
  providers: [SessionRevocationService, StepUpAuthGuard],
  exports: [SessionRevocationService, StepUpAuthGuard],
})
export class SessionRevocationModule {}
