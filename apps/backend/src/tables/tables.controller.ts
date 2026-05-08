import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Request,
  UseGuards,
} from '@nestjs/common';
import { TablesService } from './tables.service';
import { CreateTableDto } from './dto/create-table.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller()
export class TablesController {
  constructor(private readonly tablesService: TablesService) {}

  @UseGuards(JwtAuthGuard)
  @Post('restaurants/:restaurantId/tables')
  create(
    @Param('restaurantId') restaurantId: string,
    @Body() createTableDto: CreateTableDto,
    @Request() req,
  ) {
    return this.tablesService.create(restaurantId, createTableDto, req.user.id);
  }

  @Get('restaurants/:restaurantId/tables')
  findAll(@Param('restaurantId') restaurantId: string) {
    return this.tablesService.findAll(restaurantId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('tables/status/:restaurantId')
  getTablesWithStatus(@Param('restaurantId') restaurantId: string) {
    return this.tablesService.getTablesWithStatus(restaurantId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('tables/:id')
  remove(@Param('id') id: string, @Request() req) {
    return this.tablesService.remove(id, req.user.id);
  }
}
