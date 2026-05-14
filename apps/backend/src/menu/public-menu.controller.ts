import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
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
  getPublicMenu(
    @Param('restaurantId') restaurantId: string,
    @Query('lang') lang?: string,
  ) {
    return this.crud.getPublicMenu(restaurantId, lang);
  }

  @Get('public/:restaurantId/trending')
  getTrendingItems(@Param('restaurantId') restaurantId: string) {
    return this.crud.getTrendingItems(restaurantId);
  }

  @Get('test')
  testRoute() {
    return { message: 'PublicMenuController is working!' };
  }
}
