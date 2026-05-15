import { Module, Global } from '@nestjs/common';
import { FeatureService } from './feature.service';
import { FeatureGuard } from './feature.guard';
import { PrismaModule } from '../prisma/prisma.module';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [FeatureService, FeatureGuard],
  exports: [FeatureService, FeatureGuard],
})
export class SubscriptionModule {}
