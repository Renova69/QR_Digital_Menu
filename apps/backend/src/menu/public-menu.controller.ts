import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { MenuService } from './menu.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('menu')
export class PublicMenuController {
  constructor(private readonly menuService: MenuService) {}

  // Add this method to handle the base /menu route
  @Get()
  @UseGuards(JwtAuthGuard)
  getAllMenuData() {
    // You could return all restaurants' menus or implement another logic
    return {
      message: "Use /public/:restaurantId to get a specific restaurant's menu",
    };
  }

  @Get('public/:restaurantId')
  getPublicMenu(@Param('restaurantId') restaurantId: string) {
    return this.menuService.getPublicMenu(restaurantId);
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
