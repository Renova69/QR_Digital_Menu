import {
  Body,
  Controller,
  Get,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlatformSettingsService } from './platform-settings.service';
import { UpdatePlatformSettingsDto } from './dto/update-platform-settings.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SuperAdminGuard } from '../super-admin/super-admin.guard';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('platform-settings')
@Controller()
export class PlatformSettingsController {
  constructor(
    private readonly platformSettingsService: PlatformSettingsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('platform-settings/public')
  @ApiOperation({ summary: 'Get public GDPR / legal settings (unauthenticated)' })
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
  @Patch('super-admin/platform-settings')
  @ApiOperation({ summary: 'Update platform settings (super-admin)' })
  async updateAdmin(
    @Body() dto: UpdatePlatformSettingsDto,
    @Req() req: any,
  ) {
    const changedKeys = Object.keys(dto);
    const settings = await this.platformSettingsService.updateSettings(dto, req.user.id);

    await this.prisma.adminAuditLog.create({
      data: {
        actorUserId: req.user.id,
        action: 'PLATFORM_SETTINGS_UPDATE',
        targetType: 'PlatformSettings',
        targetId: 'singleton',
        metadata: { changedKeys },
      },
    });

    return settings;
  }
}
