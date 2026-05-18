import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
    PrismaModule,
    SubscriptionModule,
    SuperAdminModule,
    PlatformSettingsModule,
    UsersDataModule,
    AuthModule,
    RestaurantsModule,
    MenuModule,
    OrdersModule,
    AssistanceModule,
    DashboardModule,
    TablesModule,
    HealthModule,
    FeedbackModule,
    TranslationModule,
    StorageModule,
    EventsModule,
    LoyaltyModule,
    PaymentModule,
    MenuImportModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
