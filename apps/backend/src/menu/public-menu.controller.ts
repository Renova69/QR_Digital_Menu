import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { MenuService } from './menu.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('menu')
export class PublicMenuController {
  constructor(private readonly menuService: MenuService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  getAllMenuData() {
    return {
      message: "Use /public/:restaurantId to get a specific restaurant's menu",
    };
  }

  @Get('public/:restaurantId')
  getPublicMenu(
    @Param('restaurantId') restaurantId: string,
    @Query('lang') lang?: string,
  ) {
    return this.menuService.getPublicMenu(restaurantId, lang);
  }

  @Get('public/:restaurantId/trending')
  getTrendingItems(@Param('restaurantId') restaurantId: string) {
    return this.menuService.getTrendingItems(restaurantId);
  }

  @Get('test')
  testRoute() {
    return { message: 'PublicMenuController is working!' };
  }
}
