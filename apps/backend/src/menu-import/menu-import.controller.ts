import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Request,
  ValidationPipe,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { MenuImportService } from './menu-import.service';
import { ImportMenuDto } from './dto/import-menu.dto';
import { ApiKeyGuard } from './guards/api-key.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('restaurants/:id/menu/import')
export class MenuImportController {
  constructor(private readonly menuImportService: MenuImportService) {}

  /**
   * OCR tool direct push — authenticated via per-restaurant Bearer API key.
   * POST /api/restaurants/:id/menu/import
   */
  @Post()
  @UseGuards(ApiKeyGuard)
  importFromOcr(
    @Param('id') id: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true })) dto: ImportMenuDto,
  ) {
    return this.menuImportService.upsertMenu(id, dto);
  }

  /**
   * Dashboard UI confirm import — authenticated via JWT.
   * POST /api/restaurants/:id/menu/import/confirm
   */
  @Post('confirm')
  @UseGuards(JwtAuthGuard)
  importConfirm(
    @Param('id') id: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true })) dto: ImportMenuDto,
    @Request() req,
  ) {
    return this.menuImportService.checkOwnership(id, req.user.id).then(() =>
      this.menuImportService.upsertMenu(id, dto),
    );
  }

  /**
   * Get masked API key (or generate if none).
   * GET /api/restaurants/:id/menu/import/api-key
   */
  @Get('api-key')
  @UseGuards(JwtAuthGuard)
  getApiKey(@Param('id') id: string, @Request() req) {
    return this.menuImportService.getOrCreateApiKey(id, req.user.id);
  }

  /**
   * Reveal full API key (for copy-to-clipboard).
   * POST /api/restaurants/:id/menu/import/api-key/reveal
   */
  @Post('api-key/reveal')
  @UseGuards(JwtAuthGuard)
  revealApiKey(@Param('id') id: string, @Request() req) {
    return this.menuImportService.revealApiKey(id, req.user.id);
  }

  /**
   * Regenerate API key.
   * POST /api/restaurants/:id/menu/import/api-key/regenerate
   */
  @Post('api-key/regenerate')
  @UseGuards(JwtAuthGuard)
  regenerateApiKey(@Param('id') id: string, @Request() req) {
    return this.menuImportService.regenerateApiKey(id, req.user.id);
  }
}
