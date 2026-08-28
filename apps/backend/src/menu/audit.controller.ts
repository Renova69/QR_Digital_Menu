import { Controller, Get, Param, Request } from '@nestjs/common';
import { RequireRestaurantAccess } from '../auth/require-restaurant-access.decorator';
import { MenuAuditService } from './menu-audit.service';

@Controller('menu/audit')
@RequireRestaurantAccess({
  policy: 'menu-audit',
  source: 'params',
  key: 'restaurantId',
})
export class MenuAuditController {
  constructor(private readonly audit: MenuAuditService) {}

  @Get(':restaurantId')
  async auditMenu(
    @Param('restaurantId') restaurantId: string,
    @Request() req: { user: { id: string } },
  ) {
    return this.audit.auditMenu(restaurantId, req.user.id);
  }
}
