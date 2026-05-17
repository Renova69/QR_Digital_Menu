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
} from '@nestjs/common';
import { SuperAdminService } from './super-admin.service';
import { SuperAdminGuard } from './super-admin.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UpdateTenantTierDto, UpdateTenantStatusDto } from './dto/update-tenant.dto';

@Controller('super-admin')
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class SuperAdminController {
  constructor(private readonly service: SuperAdminService) {}

  @Get('stats')
  getStats() {
    return this.service.getStats();
  }

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

  @Get('tenants/:id')
  getTenant(@Param('id') id: string) {
    return this.service.getTenantById(id);
  }

  @Patch('tenants/:id/tier')
  updateTier(
    @Param('id') id: string,
    @Body() dto: UpdateTenantTierDto,
  ) {
    return this.service.updateTier(id, dto.forceTier ?? null);
  }

  @Patch('tenants/:id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateTenantStatusDto,
  ) {
    return this.service.updateStatus(id, dto.isActive);
  }
}
