import {
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
import { TablesService } from './tables.service';
import { CreateTableDto } from './dto/create-table.dto';
import { UpdateTableDto } from './dto/update-table.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

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
    return this.tablesService.create(restaurantId, createTableDto, req.user.id);
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

  @Get('restaurants/:restaurantId/tables')
  findAll(@Param('restaurantId') restaurantId: string) {
    return this.tablesService.findAll(restaurantId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('tables/status/:restaurantId')
  getTablesWithStatus(
    @Param('restaurantId') restaurantId: string,
    @Query('zoneId') zoneId?: string,
  ) {
    return this.tablesService.getTablesWithStatus(restaurantId, zoneId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('tables/:tableId/orders')
  getTableOrders(
    @Param('tableId') tableId: string,
    @Query('restaurantId') restaurantId: string,
  ) {
    return this.tablesService.getTableOrders(tableId, restaurantId);
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
  @Delete('tables/:id')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.tablesService.remove(id, req.user.id);
  }
}
