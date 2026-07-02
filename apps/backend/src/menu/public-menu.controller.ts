import {
  Controller,
  Get,
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
  async getPublicMenu(
    @Param('restaurantId') restaurantId: string,
    @Query('lang') lang?: string,
  ) {
    return this.crud.getPublicMenu(restaurantId, lang);
  }

  @Get('public/:restaurantId/meta')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  async getPublicMenuMeta(
    @Param('restaurantId') restaurantId: string,
    @Query('lang') lang?: string,
  ) {
    return this.crud.getPublicMenuMeta(restaurantId, lang);
  }

  @Get('public/:restaurantId/categories/:categoryId/items')
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  async getCategoryItems(
    @Param('restaurantId') restaurantId: string,
    @Param('categoryId') categoryId: string,
    @Query('lang') lang?: string,
  ) {
    return this.crud.getCategoryItems(restaurantId, categoryId, lang);
  }

  @Get('public/:restaurantId/trending')
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  async getTrendingItems(
    @Param('restaurantId') restaurantId: string,
    @Query('lang') lang?: string,
  ) {
    return this.crud.getTrendingItems(restaurantId, lang);
  }
}
