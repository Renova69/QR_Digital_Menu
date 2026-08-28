import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Request,
} from '@nestjs/common';
import { TableZonesService } from './table-zones.service';
import { CreateZoneDto } from './dto/create-zone.dto';
import { UpdateZoneDto } from './dto/update-zone.dto';
import { ReorderZonesDto } from './dto/reorder-zones.dto';
import { RequireRestaurantAccess } from '../auth/require-restaurant-access.decorator';

type ZoneActorRequest = {
  user: { id: string; role?: string; restaurantId?: string };
};

@Controller()
export class TableZonesController {
  constructor(private readonly zonesService: TableZonesService) {}

  @RequireRestaurantAccess({
    policy: 'zone-read',
    source: 'params',
    key: 'restaurantId',
  })
  @Get('restaurants/:restaurantId/zones')
  findAll(
    @Param('restaurantId') restaurantId: string,
    @Request() req: ZoneActorRequest,
  ) {
    return this.zonesService.findAll(restaurantId, req.user);
  }

  @RequireRestaurantAccess({
    policy: 'zone-management',
    source: 'params',
    key: 'restaurantId',
    resource: 'restaurant',
  })
  @Post('restaurants/:restaurantId/zones')
  create(
    @Param('restaurantId') restaurantId: string,
    @Body() dto: CreateZoneDto,
    @Request() req: ZoneActorRequest,
  ) {
    return this.zonesService.create(restaurantId, dto, req.user.id);
  }

  @RequireRestaurantAccess({
    policy: 'zone-management',
    source: 'params',
    key: 'id',
    resource: 'zone',
  })
  @Patch('zones/:id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateZoneDto,
    @Request() req: ZoneActorRequest,
  ) {
    return this.zonesService.update(id, dto, req.user.id);
  }

  @RequireRestaurantAccess({
    policy: 'zone-management',
    source: 'params',
    key: 'id',
    resource: 'zone',
  })
  @Delete('zones/:id')
  remove(@Param('id') id: string, @Request() req: ZoneActorRequest) {
    return this.zonesService.remove(id, req.user.id);
  }

  @RequireRestaurantAccess({
    policy: 'zone-management',
    source: 'params',
    key: 'restaurantId',
    resource: 'restaurant',
  })
  @Patch('restaurants/:restaurantId/zones/reorder')
  reorder(
    @Param('restaurantId') restaurantId: string,
    @Body() dto: ReorderZonesDto,
    @Request() req: ZoneActorRequest,
  ) {
    return this.zonesService.reorder(restaurantId, dto, req.user.id);
  }
}
