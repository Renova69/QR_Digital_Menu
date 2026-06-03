import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Request,
  UseGuards,
} from '@nestjs/common';
import { TableZonesService } from './table-zones.service';
import { CreateZoneDto } from './dto/create-zone.dto';
import { UpdateZoneDto } from './dto/update-zone.dto';
import { ReorderZonesDto } from './dto/reorder-zones.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller()
export class TableZonesController {
  constructor(private readonly zonesService: TableZonesService) {}

  @UseGuards(JwtAuthGuard)
  @Get('restaurants/:restaurantId/zones')
  findAll(@Param('restaurantId') restaurantId: string, @Request() req: any) {
    return this.zonesService.findAll(restaurantId, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Post('restaurants/:restaurantId/zones')
  create(
    @Param('restaurantId') restaurantId: string,
    @Body() dto: CreateZoneDto,
    @Request() req: any,
  ) {
    return this.zonesService.create(restaurantId, dto, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('zones/:id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateZoneDto,
    @Request() req: any,
  ) {
    return this.zonesService.update(id, dto, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('zones/:id')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.zonesService.remove(id, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('restaurants/:restaurantId/zones/reorder')
  reorder(
    @Param('restaurantId') restaurantId: string,
    @Body() dto: ReorderZonesDto,
    @Request() req: any,
  ) {
    return this.zonesService.reorder(restaurantId, dto, req.user.id);
  }
}
