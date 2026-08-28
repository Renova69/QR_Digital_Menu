import { Module } from '@nestjs/common';
import { RequestBudgetInterceptor } from './common/http/request-budget.interceptor';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { SentryModule } from '@sentry/nestjs/setup';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { ThrottlerModule } from '@nestjs/throttler';
import { IdentityThrottlerGuard } from './common/identity-throttler.guard';
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
import { createThrottlerStorage } from './common/throttling/resilient-throttler-storage';
import { DependencyHttpPoolLifecycle } from './common/http/dependency-http';

@Module({
  imports: [
    // Must be a top-level import in the root module for Nest-specific
    // instrumentation (interceptors, module init tracing) to attach.
    SentryModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        // Rate-limit counters are shared through the same Redis deployment as
        // Socket.IO. If a command fails, the resilient storage preserves the
        // declared policy per instance until distributed storage recovers.
        // Tests must never connect to a REDIS_URL inherited from a developer
        // .env file; their request counters are intentionally process-local.
        storage: createThrottlerStorage(
          configService.get<string>('NODE_ENV') === 'test'
            ? undefined
            : configService.get<string>('REDIS_URL'),
        ),
        throttlers: [
          {
            ttl: 60_000,
            limit:
              parseInt(
                configService.get<string>('THROTTLE_LIMIT', '100'),
                10,
              ) || 100,
          },
        ],
      }),
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
    DependencyHttpPoolLifecycle,
    {
      provide: APP_GUARD,
      useClass: IdentityThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestBudgetInterceptor,
    },
  ],
})
export class AppModule {}
