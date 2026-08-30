import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  AuthorizedRestaurant,
  RequireRestaurantAccess,
} from '../auth/require-restaurant-access.decorator';
import { RestaurantAccessContext } from '../auth/restaurant-access.policy';
import { MenuViewService } from './menu-view.service';

class RecordViewDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  table?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  visitorId?: string;
}

@Controller()
export class MenuViewController {
  constructor(private readonly menuViewService: MenuViewService) {}

  @Post('menu/public/:restaurantId/view')
  @HttpCode(204)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async recordView(
    @Param('restaurantId') restaurantId: string,
    @Body() body: RecordViewDto,
  ): Promise<void> {
    await this.menuViewService.recordView(restaurantId, {
      table: body.table,
      visitorId: body.visitorId,
    });
  }

  @Get('dashboard/scan-stats/:restaurantId')
  @RequireRestaurantAccess({
    policy: 'scan-stats',
    source: 'params',
    key: 'restaurantId',
  })
  async getScanStats(
    @AuthorizedRestaurant() access: RestaurantAccessContext,
    @Query('period') periodStr?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    let period = 7;
    if (periodStr) {
      period = Number.parseInt(periodStr, 10);
      if (![1, 7, 14, 30].includes(period)) {
        throw new BadRequestException('period must be 1, 7, 14, or 30');
      }
    }

    if (!!startDate !== !!endDate) {
      throw new BadRequestException(
        'startDate and endDate must be provided together',
      );
    }
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (
        Number.isNaN(start.getTime()) ||
        Number.isNaN(end.getTime()) ||
        end < start
      ) {
        throw new BadRequestException('Invalid date range');
      }
      const rangeDays =
        (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
      if (rangeDays > 366) {
        throw new BadRequestException('Date range cannot exceed 366 days');
      }
    }

    return this.menuViewService.getScanStats(access.restaurantId, {
      period,
      startDate,
      endDate,
    });
  }
}
