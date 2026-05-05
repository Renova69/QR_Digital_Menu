import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MenuService } from './menu.service';

@Controller('menu/audit')
@UseGuards(JwtAuthGuard)
export class MenuAuditController {
  constructor(private readonly menuService: MenuService) {}

  @Get(':restaurantId')
  async auditMenu(@Param('restaurantId') restaurantId: string) {
    return this.menuService.auditMenu(restaurantId);
  }
}
