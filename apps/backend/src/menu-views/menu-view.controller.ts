import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
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
  ) {
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

    return this.menuViewService.getScanStats(restaurantId);
  }
}
