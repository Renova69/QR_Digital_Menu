import {
  Controller,
  Get,
  Header,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { MenuCrudService } from './menu-crud.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('menu')
export class PublicMenuController {
  constructor(private readonly crud: MenuCrudService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  getAllMenuData() {
    return {
      message: "Use /public/:restaurantId to get a specific restaurant's menu",
    };
  }

  @Get('public/:restaurantId')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Header('Cache-Control', 'no-store')
  async getPublicMenu(
    @Param('restaurantId') restaurantId: string,
    @Query('lang') lang?: string,
  ) {
    return this.crud.getPublicMenu(restaurantId, lang);
  }

  @Get('public/:restaurantId/meta')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Header('Cache-Control', 'no-store')
  async getPublicMenuMeta(
    @Param('restaurantId') restaurantId: string,
    @Query('lang') lang?: string,
  ) {
    return this.crud.getPublicMenuMeta(restaurantId, lang);
  }

  @Get('public/:restaurantId/categories/:categoryId/items')
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @Header('Cache-Control', 'no-store')
  async getCategoryItems(
    @Param('restaurantId') restaurantId: string,
    @Param('categoryId') categoryId: string,
    @Query('lang') lang?: string,
  ) {
    return this.crud.getCategoryItems(restaurantId, categoryId, lang);
  }

  // Batched items for every visible category in one round trip — the initial
  // public-menu load and language switch use this instead of one request per
  // category (kills the N restaurant reads + N DeepL bursts).
  @Get('public/:restaurantId/items')
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @Header('Cache-Control', 'no-store')
  async getPublicMenuItems(
    @Param('restaurantId') restaurantId: string,
    @Query('lang') lang?: string,
  ) {
    return this.crud.getPublicMenuItems(restaurantId, lang);
  }

  @Get('public/:restaurantId/trending')
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @Header('Cache-Control', 'no-store')
  async getTrendingItems(
    @Param('restaurantId') restaurantId: string,
    @Query('lang') lang?: string,
  ) {
    return this.crud.getTrendingItems(restaurantId, lang);
  }
}
