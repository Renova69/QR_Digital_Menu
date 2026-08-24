import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PushModule } from '../push/push.module';
import { PinSecurityService } from './pin-security.service';

/**
 * Owns PIN-abuse detection so HTTP authentication and restaurant management
 * consume the same provider with the same push/Prisma dependencies.
 */
@Module({
  imports: [PrismaModule, PushModule],
  providers: [PinSecurityService],
  exports: [PinSecurityService],
})
export class PinSecurityModule {}
