import { Module } from '@nestjs/common';
import { RestaurantsService } from './restaurants.service';
import { RestaurantsController } from './restaurants.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { TranslationModule } from '../translation/translation.module';

@Module({
  imports: [PrismaModule, TranslationModule],
  controllers: [RestaurantsController],
  providers: [RestaurantsService],
  exports: [RestaurantsService],
})
export class RestaurantsModule {}
