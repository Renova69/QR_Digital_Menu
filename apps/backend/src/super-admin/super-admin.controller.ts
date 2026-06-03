import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { SuperAdminService } from './super-admin.service';
import { SuperAdminGuard } from './super-admin.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  ResetOwnerPasswordDto,
  SuperAdminConfirmationDto,
  UpdatePaymentsEnabledDto,
  UpdateTenantStatusDto,
  UpdateTenantTierDto,
} from './dto/update-tenant.dto';
import { ImportMenuDto } from '../menu-import/dto/import-menu.dto';

@ApiTags('Super Admin')
@Controller('super-admin')
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class SuperAdminController {
  constructor(private readonly service: SuperAdminService) {}

  @ApiOperation({ summary: 'Platform-wide stats' })
  @Get('stats')
  getStats() {
    return this.service.getStats();
  }

  @ApiOperation({ summary: 'List tenants with filters' })
  @Get('tenants')
  getTenants(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search?: string,
    @Query('tier') tier?: string,
    @Query('status') status?: string,
    @Query('subscription') subscription?: string,
  ) {
    return this.service.getTenants({ page, limit, search, tier, status, subscription });
  }

  @ApiOperation({ summary: 'Get single tenant detail' })
  @Get('tenants/:id')
  getTenant(@Param('id') id: string) {
    return this.service.getTenantById(id);
  }

  @ApiOperation({ summary: 'Force-override tenant tier' })
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Patch('tenants/:id/tier')
  updateTier(
    @Param('id') id: string,
    @Body() dto: UpdateTenantTierDto,
    @Request() req: any,
  ) {
    return this.service.updateTier(
      id,
      dto.forceTier ?? null,
      req.user.id,
      dto.forceTierExpiresInDays ?? null,
    );
  }

  @ApiOperation({ summary: 'Suspend or reactivate a tenant' })
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Patch('tenants/:id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateTenantStatusDto,
    @Request() req: any,
  ) {
    return this.service.updateStatus(id, dto.isActive, req.user.id);
  }

  @ApiOperation({ summary: 'Reset owner password' })
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Patch('tenants/:id/reset-password')
  resetOwnerPassword(
    @Param('id') id: string,
    @Body() dto: ResetOwnerPasswordDto,
    @Request() req: any,
  ) {
    return this.service.resetOwnerPassword(id, dto.password, req.user.id);
  }

  @ApiOperation({ summary: 'Enable or disable payments for a tenant' })
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Patch('tenants/:id/payments')
  updatePaymentsEnabled(
    @Param('id') id: string,
    @Body() dto: UpdatePaymentsEnabledDto,
    @Request() req: any,
  ) {
    return this.service.updatePaymentsEnabled(id, dto.paymentsEnabled, req.user.id);
  }

  @ApiOperation({ summary: 'Soft-delete a restaurant' })
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Delete('tenants/:id')
  deleteRestaurant(
    @Param('id') id: string,
    @Body() _dto: SuperAdminConfirmationDto,
    @Request() req: any,
  ) {
    return this.service.deleteRestaurant(id, req.user.id);
  }

  @ApiOperation({ summary: 'Restore a soft-deleted restaurant' })
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post('tenants/:id/restore')
  restoreRestaurant(
    @Param('id') id: string,
    @Body() _dto: SuperAdminConfirmationDto,
    @Request() req: any,
  ) {
    return this.service.restoreRestaurant(id, req.user.id);
  }

  @ApiOperation({ summary: 'Delete a staff member from a restaurant' })
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Delete('tenants/:restaurantId/staff/:userId')
  deleteStaff(
    @Param('restaurantId') restaurantId: string,
    @Param('userId') userId: string,
    @Body() _dto: SuperAdminConfirmationDto,
    @Request() req: any,
  ) {
    return this.service.deleteStaff(restaurantId, userId, req.user.id);
  }

  @ApiOperation({ summary: 'Import menu JSON into a restaurant' })
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post('tenants/:id/menu/import')
  importMenu(
    @Param('id') id: string,
    @Body() dto: ImportMenuDto,
    @Request() req: any,
  ) {
    return this.service.importMenu(id, dto, req.user.id);
  }

  @ApiOperation({ summary: 'Paginated admin audit log with filters' })
  @Get('audit-log')
  getAuditLog(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('targetId') targetId?: string,
    @Query('action') action?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.service.getAuditLog({ page, limit, targetId, action, dateFrom, dateTo });
  }
}
