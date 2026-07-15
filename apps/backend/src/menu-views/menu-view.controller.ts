import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { MenuViewService } from './menu-view.service';

class RecordViewDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  table?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  visitorId?: string;
}

@Controller()
export class MenuViewController {
  constructor(
    private readonly menuViewService: MenuViewService,
    private readonly prisma: PrismaService,
  ) {}

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
  @UseGuards(JwtAuthGuard)
  async getScanStats(
    @Param('restaurantId') restaurantId: string,
    @Req() req: any,
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

    const userId = req.user?.id ?? req.user?.sub;
    const [restaurant, user] = await Promise.all([
      this.prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { ownerId: true },
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { restaurantId: true, role: true },
      }),
    ]);

    if (!restaurant) throw new NotFoundException('Restaurant not found');

    const role = user?.role?.toUpperCase();
    const hasAccess =
      restaurant.ownerId === userId ||
      (user?.restaurantId === restaurantId &&
        ['STAFF', 'MANAGER', 'WAITER', 'KITCHEN'].includes(role ?? ''));

    if (!hasAccess) {
      throw new ForbiddenException('Access denied');
    }

    return this.menuViewService.getScanStats(restaurantId, {
      period,
      startDate,
      endDate,
    });
  }
}
