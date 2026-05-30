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

@Controller('restaurants/:id/menu')
export class MenuImportController {
  constructor(private readonly menuImportService: MenuImportService) {}

  /**
   * OCR tool direct push — authenticated via per-restaurant Bearer API key.
   * POST /api/restaurants/:id/menu/import
   */
  @Post('import')
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
  @Post('import/confirm')
  @UseGuards(JwtAuthGuard)
  importConfirm(
    @Param('id') id: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true })) dto: ImportMenuDto,
    @Request() req: any,
  ) {
    return this.menuImportService.checkOwnership(id, req.user.id).then(() =>
      this.menuImportService.upsertMenu(id, dto),
    );
  }

  /**
   * Report whether an import key is configured (or generate + return one once).
   * The stored key is hashed and can never be re-revealed (#10).
   * GET /api/restaurants/:id/menu/import/api-key
   */
  @Get('import/api-key')
  @UseGuards(JwtAuthGuard)
  getApiKey(@Param('id') id: string, @Request() req: any) {
    return this.menuImportService.getOrCreateApiKey(id, req.user.id);
  }

  /**
   * Regenerate API key.
   * POST /api/restaurants/:id/menu/import/api-key/regenerate
   */
  @Post('import/api-key/regenerate')
  @UseGuards(JwtAuthGuard)
  regenerateApiKey(@Param('id') id: string, @Request() req: any) {
    return this.menuImportService.regenerateApiKey(id, req.user.id);
  }

  /**
   * Export full menu as JSON in import-compatible format (round-trip safe).
   * GET /api/restaurants/:id/menu/export
   */
  @Get('export')
  @UseGuards(JwtAuthGuard)
  exportMenu(@Param('id') id: string, @Request() req: any) {
    return this.menuImportService.exportMenu(id, req.user.id);
  }
}
