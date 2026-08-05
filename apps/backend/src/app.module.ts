import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { SentryModule } from '@sentry/nestjs/setup';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { RestaurantsModule } from './restaurants/restaurants.module';
import { PrismaModule } from './prisma/prisma.module';
import { MenuModule } from './menu/menu.module';
import { OrdersModule } from './orders/orders.module';
import { AssistanceModule } from './assistance/assistance.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { TablesModule } from './tables/tables.module';
import { TableZonesModule } from './table-zones/table-zones.module';
import { HealthModule } from './health/health.module';
import { FeedbackModule } from './feedback/feedback.module';
import { TranslationModule } from './translation/translation.module';
import { StorageModule } from './storage/storage.module';
import { EventsModule } from './events/events.module';
import { LoyaltyModule } from './loyalty/loyalty.module';
import { PaymentModule } from './payment/payment.module';
import { MenuImportModule } from './menu-import/menu-import.module';
import { SubscriptionModule } from './subscription/subscription.module';
import { SuperAdminModule } from './super-admin/super-admin.module';
import { PlatformSettingsModule } from './platform-settings/platform-settings.module';
import { UsersDataModule } from './users-data/users-data.module';
import { HelpContentModule } from './help-content/help-content.module';
import { MenuViewModule } from './menu-views/menu-view.module';
import { ConsentModule } from './consent/consent.module';
import { ClientLogsModule } from './client-logs/client-logs.module';
import { PrintStationModule } from './print-station/print-station.module';
import { ReservationsModule } from './reservations/reservations.module';
import { PushModule } from './push/push.module';
import { NotificationsModule } from './notifications/notifications.module';

const throttlerLogger = new Logger('ThrottlerModule');

// Rate-limit counters are per-instance (in-memory) by default — with more
// than one backend instance behind Cloud Run, an attacker distributed
// across instances gets one effective budget per instance instead of the
// declared aggregate limit. When REDIS_URL is present (it already backs
// the Socket.IO adapter — see adapters/redis-io.adapter.ts), share
// throttle counters through it instead so the limit is enforced globally.
const throttlerStorage = process.env.REDIS_URL
  ? new ThrottlerStorageRedisService(process.env.REDIS_URL)
  : undefined;
if (throttlerStorage) {
  throttlerLogger.log('Using Redis-backed distributed throttle storage');
} else {
  throttlerLogger.warn(
    'REDIS_URL not set — rate limiting is per-instance in-memory only',
  );
}

@Module({
  imports: [
    // Must be a top-level import in the root module for Nest-specific
    // instrumentation (interceptors, module init tracing) to attach.
    SentryModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ThrottlerModule.forRoot({
      storage: throttlerStorage,
      throttlers: [
        {
          ttl: 60000,
          limit: parseInt(process.env.THROTTLE_LIMIT || '100', 10) || 100,
        },
      ],
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    NotificationsModule,
    SubscriptionModule,
    SuperAdminModule,
    PlatformSettingsModule,
    UsersDataModule,
    HelpContentModule,
    AuthModule,
    RestaurantsModule,
    MenuModule,
    OrdersModule,
    AssistanceModule,
    DashboardModule,
    TablesModule,
    TableZonesModule,
    HealthModule,
    FeedbackModule,
    TranslationModule,
    StorageModule,
    EventsModule,
    LoyaltyModule,
    PaymentModule,
    MenuImportModule,
    MenuViewModule,
    ConsentModule,
    ClientLogsModule,
    PrintStationModule,
    ReservationsModule,
    PushModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
  ],
})
export class AppModule {}
