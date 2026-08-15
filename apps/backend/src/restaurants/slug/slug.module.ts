import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { RestaurantSlugService } from './restaurant-slug.service';

// Single home for RestaurantSlugService. Registering the service directly in
// each consuming module's providers (as menu.module.ts originally did) gives
// NestJS a separate instance per module — harmless for this stateless
// service today, but wrong going forward as more modules need it. Import
// SlugModule instead of listing RestaurantSlugService as a provider.
@Module({
  imports: [PrismaModule],
  providers: [RestaurantSlugService],
  exports: [RestaurantSlugService],
})
export class SlugModule {}
