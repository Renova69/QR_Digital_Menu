import { Module, Global } from '@nestjs/common';
import { FeatureService } from './feature.service';
import { FeatureGuard } from './feature.guard';
import { SubscriptionService } from './subscription.service';
import { SubscriptionController } from './subscription.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [SubscriptionController],
  providers: [FeatureService, FeatureGuard, SubscriptionService],
  exports: [FeatureService, FeatureGuard],
})
export class SubscriptionModule {}
