import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Request,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MenuBulkEditService } from './menu-bulk-edit.service';
import { BulkUpdateItemsDto } from './dto/bulk-update-items.dto';

@UseGuards(JwtAuthGuard)
@Controller('restaurants/:id/menu')
export class BulkItemController {
  constructor(private readonly bulkEdit: MenuBulkEditService) {}

  /**
   * Flat item list (all categories) for the bulk-edit grid.
   * GET /api/restaurants/:id/menu/bulk-items
   */
  @Get('bulk-items')
  getBulkItems(@Param('id') id: string, @Request() req: any) {
    return this.bulkEdit.getBulkEditItems(id, req.user.id);
  }

  // Each row fans out through the same per-item update path as a single
  // manual edit (translation prewarm included), so this is throttled well
  // below the global 100/60s — mirrors the "Translate All Now" style guard.
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Patch('bulk-items')
  updateBulkItems(
    @Param('id') id: string,
    @Body(ValidationPipe) dto: BulkUpdateItemsDto,
    @Request() req: any,
  ) {
    return this.bulkEdit.bulkUpdateItems(id, dto, req.user.id);
  }
}
