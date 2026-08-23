import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SessionRevocationService } from './session-revocation.service';

/**
 * Standalone so both AuthModule (HTTP) and EventsModule (websocket) can import
 * the same revocation rules without pulling in each other.
 */
@Module({
  imports: [PrismaModule],
  providers: [SessionRevocationService],
  exports: [SessionRevocationService],
})
export class SessionRevocationModule {}
