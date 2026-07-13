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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FeatureGuard } from '../subscription/feature.guard';
import { FeatureFlag } from '../subscription/feature-flag.enum';
import { RequireFeature } from '../subscription/require-feature.decorator';

@Controller()
export class TablesController {
  constructor(private readonly tablesService: TablesService) {}

  @UseGuards(JwtAuthGuard)
  @Post('restaurants/:restaurantId/tables')
  create(
    @Param('restaurantId') restaurantId: string,
    @Body() createTableDto: CreateTableDto,
    @Request() req: any,
  ) {
    return this.tablesService.create(
      restaurantId,
      { ...createTableDto, type: 'TABLE' },
      req.user.id,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('restaurants/:restaurantId/tables/bulk')
  bulkCreate(
    @Param('restaurantId') restaurantId: string,
    @Body('count', ParseIntPipe) count: number,
    @Request() req: any,
  ) {
    return this.tablesService.bulkCreate(restaurantId, count, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('restaurants/:restaurantId/tables')
  findAll(@Param('restaurantId') restaurantId: string, @Request() req: any) {
    return this.tablesService.findAll(restaurantId, req.user);
  }

  @RequireFeature(FeatureFlag.SERVICE_POINTS)
  @UseGuards(JwtAuthGuard, FeatureGuard)
  @Post('restaurants/:restaurantId/service-points')
  createServicePoint(
    @Param('restaurantId') restaurantId: string,
    @Body() createTableDto: CreateTableDto,
    @Request() req: any,
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
  @UseGuards(JwtAuthGuard, FeatureGuard)
  @Get('restaurants/:restaurantId/service-points')
  findServicePoints(
    @Param('restaurantId') restaurantId: string,
    @Request() req: any,
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

  @UseGuards(JwtAuthGuard)
  @Get('tables/status/:restaurantId')
  getTablesWithStatus(
    @Param('restaurantId') restaurantId: string,
    @Query('zoneId') zoneId: string | undefined,
    @Request() req: any,
  ) {
    return this.tablesService.getTablesWithStatus(
      restaurantId,
      zoneId,
      req.user,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('tables/:tableId/orders')
  getTableOrders(
    @Param('tableId') tableId: string,
    @Query('restaurantId') restaurantId: string,
    @Request() req: any,
  ) {
    return this.tablesService.getTableOrders(tableId, restaurantId, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('tables/:id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTableDto,
    @Request() req: any,
  ) {
    return this.tablesService.update(id, dto, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('tables/:id/public-token/rotate')
  rotatePublicToken(@Param('id') id: string, @Request() req: any) {
    return this.tablesService.rotatePublicToken(id, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('tables/:id')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.tablesService.remove(id, req.user.id);
  }
}
