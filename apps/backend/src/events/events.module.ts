import { Global, Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventsGateway } from './events.gateway';
import { PrismaModule } from '../prisma/prisma.module';
import { PrintStationModule } from '../print-station/print-station.module';
import { SubscriptionModule } from '../subscription/subscription.module';
import { SessionRevocationModule } from '../auth/session-revocation.module';

@Global()
@Module({
  imports: [
    PrismaModule,
    forwardRef(() => PrintStationModule),
    SubscriptionModule,
    SessionRevocationModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        secret:
          process.env.NODE_ENV === 'test'
            ? 'test-secret'
            : configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '1d' },
      }),
    }),
  ],
  providers: [EventsGateway],
  exports: [EventsGateway],
})
export class EventsModule {}
