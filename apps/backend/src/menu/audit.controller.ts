import { Controller, Get, Param, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MenuAuditService } from './menu-audit.service';

@Controller('menu/audit')
@UseGuards(JwtAuthGuard)
export class MenuAuditController {
  constructor(private readonly audit: MenuAuditService) {}

  @Get(':restaurantId')
  async auditMenu(
    @Param('restaurantId') restaurantId: string,
    @Request() req: any,
  ) {
    return this.audit.auditMenu(restaurantId, req.user.id);
  }
}
