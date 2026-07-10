import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SuperAdminGuard } from '../super-admin/super-admin.guard';
import { Throttle } from '@nestjs/throttler';
import { HelpContentService } from './help-content.service';
import { CreateHelpContentDto } from './dto/create-help-content.dto';
import { UpdateHelpContentDto } from './dto/update-help-content.dto';
import { ReorderHelpContentDto } from './dto/reorder-help-content.dto';

@Controller()
export class HelpContentController {
  constructor(private readonly helpContentService: HelpContentService) {}

  @Get('help-content/:section')
  getPublic(
    @Param('section') section: string,
    @Query('locale') locale?: string,
  ) {
    return this.helpContentService.findBySectionAndLocale(
      section,
      locale || 'en',
    );
  }

  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  @Get('super-admin/help-content')
  getAll(@Query('section') section: string) {
    return this.helpContentService.findBySection(section);
  }

  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('super-admin/help-content')
  create(@Body() dto: CreateHelpContentDto, @Request() req: any) {
    return this.helpContentService.create(dto, req.user.id);
  }

  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Patch('super-admin/help-content/reorder')
  reorder(@Body() dto: ReorderHelpContentDto, @Request() req: any) {
    return this.helpContentService.reorder(dto.items, req.user.id);
  }

  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Patch('super-admin/help-content/:id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateHelpContentDto,
    @Request() req: any,
  ) {
    return this.helpContentService.update(id, dto, req.user.id);
  }

  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Delete('super-admin/help-content/:id')
  delete(@Param('id') id: string, @Request() req: any) {
    return this.helpContentService.delete(id, req.user.id);
  }
}
