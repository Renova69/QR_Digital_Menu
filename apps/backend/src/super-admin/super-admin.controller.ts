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
  AdjustLoyaltyPointsDto,
  ClearLoyaltyPointsDto,
  ResetOwnerPasswordDto,
  SuperAdminConfirmationDto,
  SuperAdminImportMenuDto,
  UpdateDataRequestDto,
  UpdatePaymentsEnabledDto,
  UpdateTenantStatusDto,
  UpdateTenantTierDto,
} from './dto/update-tenant.dto';

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
    return this.service.getTenants({
      page,
      limit,
      search,
      tier,
      status,
      subscription,
    });
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
    return this.service.updatePaymentsEnabled(
      id,
      dto.paymentsEnabled,
      req.user.id,
    );
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
    @Body() dto: SuperAdminImportMenuDto,
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
    return this.service.getAuditLog({
      page,
      limit,
      targetId,
      action,
      dateFrom,
      dateTo,
    });
  }

  @ApiOperation({ summary: 'Force-logout all sessions for a tenant owner' })
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('tenants/:id/force-logout')
  forceLogout(
    @Param('id') id: string,
    @Body() _confirmation: SuperAdminConfirmationDto,
    @Request() req: any,
  ) {
    return this.service.forceLogoutOwner(id, req.user.id);
  }

  @ApiOperation({ summary: 'Regenerate OCR import API key for a tenant' })
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('tenants/:id/regenerate-api-key')
  regenerateApiKey(
    @Param('id') id: string,
    @Body() _confirmation: SuperAdminConfirmationDto,
    @Request() req: any,
  ) {
    return this.service.regenerateImportApiKey(id, req.user.id);
  }

  @ApiOperation({ summary: 'List active payment sessions for a tenant' })
  @Get('tenants/:id/sessions')
  getTenantSessions(
    @Param('id') id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.service.getTenantSessions(id, page, limit);
  }

  @ApiOperation({ summary: 'Force-close a payment session' })
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Delete('tenants/:id/sessions/:sessionId')
  forceCloseSession(
    @Param('id') id: string,
    @Param('sessionId') sessionId: string,
    @Body() _confirmation: SuperAdminConfirmationDto,
    @Request() req: any,
  ) {
    return this.service.forceCloseSession(id, sessionId, req.user.id);
  }

  @ApiOperation({ summary: 'List loyalty accounts for a tenant' })
  @Get('tenants/:id/loyalty')
  getLoyaltyAccounts(@Param('id') id: string) {
    return this.service.getLoyaltyAccounts(id);
  }

  @ApiOperation({ summary: 'Adjust loyalty points for an account' })
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('tenants/:id/loyalty/adjust')
  adjustLoyaltyPoints(
    @Param('id') id: string,
    @Body() dto: AdjustLoyaltyPointsDto,
    @Request() req: any,
  ) {
    return this.service.adjustLoyaltyPoints(
      id,
      dto.loyaltyAccountId,
      dto.delta,
      dto.note ?? null,
      req.user.id,
    );
  }

  @ApiOperation({ summary: 'Clear loyalty points for an account' })
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('tenants/:id/loyalty/clear')
  clearLoyaltyPoints(
    @Param('id') id: string,
    @Body() dto: ClearLoyaltyPointsDto,
    @Request() req: any,
  ) {
    return this.service.clearLoyaltyPoints(
      id,
      dto.loyaltyAccountId,
      req.user.id,
    );
  }

  @ApiOperation({ summary: 'MRR / ARR dashboard' })
  @Get('mrr')
  getMrr() {
    return this.service.getMrr();
  }

  @ApiOperation({ summary: 'List GDPR data requests' })
  @Get('data-requests')
  getDataRequests(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: string,
    @Query('type') type?: string,
  ) {
    return this.service.getDataRequests({ page, limit, status, type });
  }

  @ApiOperation({ summary: 'Update a GDPR data request' })
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Patch('data-requests/:id')
  updateDataRequest(
    @Param('id') id: string,
    @Body() dto: UpdateDataRequestDto,
    @Request() req: any,
  ) {
    return this.service.updateDataRequest(id, dto, req.user.id);
  }

  @ApiOperation({ summary: 'Create impersonation session for a tenant owner' })
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post('tenants/:id/impersonate')
  impersonate(
    @Param('id') id: string,
    @Body() _confirmation: SuperAdminConfirmationDto,
    @Request() req: any,
  ) {
    return this.service.createImpersonationSession(id, req.user.id);
  }
}
