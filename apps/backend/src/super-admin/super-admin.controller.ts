import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SuperAdminService } from './super-admin.service';
import { SuperAdminGuard } from './super-admin.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UpdateTenantTierDto, UpdateTenantStatusDto, ResetOwnerPasswordDto, UpdatePaymentsEnabledDto } from './dto/update-tenant.dto';

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
  ) {
    return this.service.getTenants({ page, limit, search, tier, status });
  }

  @ApiOperation({ summary: 'Get single tenant detail' })
  @Get('tenants/:id')
  getTenant(@Param('id') id: string) {
    return this.service.getTenantById(id);
  }

  @ApiOperation({ summary: 'Force-override tenant tier' })
  @Patch('tenants/:id/tier')
  updateTier(
    @Param('id') id: string,
    @Body() dto: UpdateTenantTierDto,
    @Request() req: any,
  ) {
    return this.service.updateTier(id, dto.forceTier ?? null, req.user.id);
  }

  @ApiOperation({ summary: 'Suspend or reactivate a tenant' })
  @Patch('tenants/:id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateTenantStatusDto,
    @Request() req: any,
  ) {
    return this.service.updateStatus(id, dto.isActive, req.user.id);
  }

  @ApiOperation({ summary: 'Reset owner password' })
  @Patch('tenants/:id/reset-password')
  resetOwnerPassword(
    @Param('id') id: string,
    @Body() dto: ResetOwnerPasswordDto,
    @Request() req: any,
  ) {
    return this.service.resetOwnerPassword(id, dto.password, req.user.id);
  }

  @ApiOperation({ summary: 'Enable or disable payments for a tenant' })
  @Patch('tenants/:id/payments')
  updatePaymentsEnabled(
    @Param('id') id: string,
    @Body() dto: UpdatePaymentsEnabledDto,
    @Request() req: any,
  ) {
    return this.service.updatePaymentsEnabled(id, dto.paymentsEnabled, req.user.id);
  }

  @ApiOperation({ summary: 'Paginated admin audit log' })
  @Get('audit-log')
  getAuditLog(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('targetId') targetId?: string,
  ) {
    return this.service.getAuditLog({ page, limit, targetId });
  }
}
