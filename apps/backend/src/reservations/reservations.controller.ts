import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ReservationsService } from './reservations.service';
import { UpdateReservationSettingsDto } from './dto/reservation-settings.dto';
import {
  ListReservationsQueryDto,
  ManualReservationDto,
  ReservationActionBodyDto,
  UpdateInternalDto,
} from './dto/reservation-ops.dto';

@Controller('reservations')
@UseGuards(JwtAuthGuard)
export class ReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

  @Get(':restaurantId/settings')
  getSettings(@Req() req: any, @Param('restaurantId') restaurantId: string) {
    return this.reservations.getSettings(restaurantId, req.user.id);
  }

  @Put(':restaurantId/settings')
  updateSettings(
    @Req() req: any,
    @Param('restaurantId') restaurantId: string,
    @Body() dto: UpdateReservationSettingsDto,
  ) {
    return this.reservations.updateSettings(
      restaurantId,
      req.user.id,
      dto as unknown as Record<string, unknown>,
    );
  }

  @Post(':restaurantId/service-hours')
  setServiceHours(
    @Req() req: any,
    @Param('restaurantId') restaurantId: string,
    @Body()
    body: {
      rows: { weekday: number; openMinute: number; lastSlotMinute: number }[];
    },
  ) {
    return this.reservations.setServiceHours(
      restaurantId,
      req.user.id,
      body.rows ?? [],
    );
  }

  @Delete(':restaurantId/service-hours/:weekday')
  deleteServiceHours(
    @Req() req: any,
    @Param('restaurantId') restaurantId: string,
    @Param('weekday', ParseIntPipe) weekday: number,
  ) {
    return this.reservations.deleteServiceHours(
      restaurantId,
      req.user.id,
      weekday,
    );
  }

  @Get(':restaurantId')
  list(
    @Req() req: any,
    @Param('restaurantId') restaurantId: string,
    @Query() query: ListReservationsQueryDto,
  ) {
    return this.reservations.list(restaurantId, req.user.id, query);
  }

  @Post(':restaurantId/manual')
  createManual(
    @Req() req: any,
    @Param('restaurantId') restaurantId: string,
    @Body() dto: ManualReservationDto,
  ) {
    return this.reservations.createManual(restaurantId, req.user.id, dto);
  }

  @Post('action/:id')
  action(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: ReservationActionBodyDto,
  ) {
    return this.reservations.executeAction(
      id,
      req.user.id,
      dto.restaurantId,
      dto.action,
      dto.reason,
    );
  }

  @Patch('internal/:id')
  updateInternal(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateInternalDto,
  ) {
    return this.reservations.updateInternal(id, req.user.id, dto.restaurantId, {
      internalNotes: dto.internalNotes,
      staffTags: dto.staffTags,
    });
  }
}
