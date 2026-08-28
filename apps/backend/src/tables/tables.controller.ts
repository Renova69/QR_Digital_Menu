import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Delete,
  Query,
  Request,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { TablesService } from './tables.service';
import { CreateTableDto } from './dto/create-table.dto';
import { UpdateTableDto } from './dto/update-table.dto';
import { RequireRestaurantAccess } from '../auth/require-restaurant-access.decorator';
import { FeatureGuard } from '../subscription/feature.guard';
import { FeatureFlag } from '../subscription/feature-flag.enum';
import { RequireFeature } from '../subscription/require-feature.decorator';

type TableActorRequest = {
  user: { id: string; role?: string; restaurantId?: string };
};

@Controller()
export class TablesController {
  constructor(private readonly tablesService: TablesService) {}

  @RequireRestaurantAccess({
    policy: 'table-management',
    source: 'params',
    key: 'restaurantId',
    resource: 'restaurant',
  })
  @Post('restaurants/:restaurantId/tables')
  create(
    @Param('restaurantId') restaurantId: string,
    @Body() createTableDto: CreateTableDto,
    @Request() req: TableActorRequest,
  ) {
    return this.tablesService.create(
      restaurantId,
      { ...createTableDto, type: 'TABLE' },
      req.user.id,
    );
  }

  @RequireRestaurantAccess({
    policy: 'table-management',
    source: 'params',
    key: 'restaurantId',
    resource: 'restaurant',
  })
  @Post('restaurants/:restaurantId/tables/bulk')
  bulkCreate(
    @Param('restaurantId') restaurantId: string,
    @Body('count', ParseIntPipe) count: number,
    @Request() req: TableActorRequest,
  ) {
    return this.tablesService.bulkCreate(restaurantId, count, req.user.id);
  }

  @RequireRestaurantAccess({
    policy: 'table-read',
    source: 'params',
    key: 'restaurantId',
  })
  @Get('restaurants/:restaurantId/tables')
  findAll(
    @Param('restaurantId') restaurantId: string,
    @Request() req: TableActorRequest,
  ) {
    return this.tablesService.findAll(restaurantId, req.user);
  }

  @RequireFeature(FeatureFlag.SERVICE_POINTS)
  @UseGuards(FeatureGuard)
  @RequireRestaurantAccess({
    policy: 'table-management',
    source: 'params',
    key: 'restaurantId',
    resource: 'restaurant',
  })
  @Post('restaurants/:restaurantId/service-points')
  createServicePoint(
    @Param('restaurantId') restaurantId: string,
    @Body() createTableDto: CreateTableDto,
    @Request() req: TableActorRequest,
  ) {
    if (createTableDto.type === 'TABLE') {
      throw new BadRequestException(
        'The service-point endpoint does not accept table records.',
      );
    }
    return this.tablesService.create(
      restaurantId,
      {
        ...createTableDto,
        type: createTableDto.type ?? 'ROOM',
      },
      req.user.id,
    );
  }

  @RequireFeature(FeatureFlag.SERVICE_POINTS)
  @UseGuards(FeatureGuard)
  @RequireRestaurantAccess({
    policy: 'table-read',
    source: 'params',
    key: 'restaurantId',
  })
  @Get('restaurants/:restaurantId/service-points')
  findServicePoints(
    @Param('restaurantId') restaurantId: string,
    @Request() req: TableActorRequest,
  ) {
    return this.tablesService.findServicePoints(restaurantId, req.user);
  }

  // Public, unauthenticated lookup keyed by a random publicToken — throttled
  // per-route (not just the global guard) for defense in depth (#SEC-L3).
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Get('restaurants/:restaurantId/service-points/public/:token')
  resolvePublicServicePoint(
    @Param('restaurantId') restaurantId: string,
    @Param('token') token: string,
  ) {
    return this.tablesService.resolvePublicServicePoint(restaurantId, token);
  }

  @RequireRestaurantAccess({
    policy: 'table-read',
    source: 'params',
    key: 'restaurantId',
  })
  @Get('tables/status/:restaurantId')
  getTablesWithStatus(
    @Param('restaurantId') restaurantId: string,
    @Query('zoneId') zoneId: string | undefined,
    @Request() req: TableActorRequest,
  ) {
    return this.tablesService.getTablesWithStatus(
      restaurantId,
      zoneId,
      req.user,
    );
  }

  @RequireRestaurantAccess({
    policy: 'table-read',
    source: 'query',
    key: 'restaurantId',
  })
  @Get('tables/:tableId/orders')
  getTableOrders(
    @Param('tableId') tableId: string,
    @Query('restaurantId') restaurantId: string,
    @Request() req: TableActorRequest,
  ) {
    return this.tablesService.getTableOrders(tableId, restaurantId, req.user);
  }

  @RequireRestaurantAccess({
    policy: 'table-management',
    source: 'params',
    key: 'id',
    resource: 'table',
  })
  @Patch('tables/:id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTableDto,
    @Request() req: TableActorRequest,
  ) {
    return this.tablesService.update(id, dto, req.user.id);
  }

  @RequireRestaurantAccess({
    policy: 'table-management',
    source: 'params',
    key: 'id',
    resource: 'table',
  })
  @Post('tables/:id/public-token/rotate')
  rotatePublicToken(
    @Param('id') id: string,
    @Request() req: TableActorRequest,
  ) {
    return this.tablesService.rotatePublicToken(id, req.user.id);
  }

  @RequireRestaurantAccess({
    policy: 'table-management',
    source: 'params',
    key: 'id',
    resource: 'table',
  })
  @Delete('tables/:id')
  remove(@Param('id') id: string, @Request() req: TableActorRequest) {
    return this.tablesService.remove(id, req.user.id);
  }
}
