import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { PlatformSettingsService } from './platform-settings.service';
import { UpdatePlatformSettingsDto } from './dto/update-platform-settings.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SuperAdminGuard } from '../super-admin/super-admin.guard';

@ApiTags('platform-settings')
@Controller()
export class PlatformSettingsController {
  constructor(
    private readonly platformSettingsService: PlatformSettingsService,
  ) {}

  @Get('platform-settings/public')
  @ApiOperation({
    summary: 'Get public GDPR / legal settings (unauthenticated)',
  })
  async getPublic() {
    const settings = await this.platformSettingsService.getSettings();
    return this.platformSettingsService.getPublicPayload(settings);
  }

  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  @Get('super-admin/platform-settings')
  @ApiOperation({ summary: 'Get full platform settings (super-admin)' })
  async getAdmin() {
    return this.platformSettingsService.getSettings();
  }

  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Patch('super-admin/platform-settings')
  @ApiOperation({ summary: 'Update platform settings (super-admin)' })
  async updateAdmin(@Body() dto: UpdatePlatformSettingsDto, @Req() req: any) {
    return this.platformSettingsService.updateSettings(dto, req.user.id);
  }
}
