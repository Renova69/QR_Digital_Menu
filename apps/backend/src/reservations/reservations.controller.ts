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
import { FeatureFlag } from '../subscription/feature-flag.enum';
import { FeatureGuard } from '../subscription/feature.guard';
import { RequireFeature } from '../subscription/require-feature.decorator';
import { ReservationsService } from './reservations.service';
import {
  SetServiceHoursDto,
  UpdateReservationSettingsDto,
} from './dto/reservation-settings.dto';
import {
  BlackoutDto,
  ListReservationsQueryDto,
  ManualReservationDto,
  ReservationActionBodyDto,
  UpdateInternalDto,
} from './dto/reservation-ops.dto';

@Controller('reservations')
@UseGuards(JwtAuthGuard, FeatureGuard)
export class ReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

  @Get(':restaurantId/settings')
  @RequireFeature(FeatureFlag.RESERVATIONS)
  getSettings(@Req() req: any, @Param('restaurantId') restaurantId: string) {
    return this.reservations.getSettings(restaurantId, req.user.id);
  }

  @Put(':restaurantId/settings')
  @RequireFeature(FeatureFlag.RESERVATIONS)
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
  @RequireFeature(FeatureFlag.RESERVATIONS)
  setServiceHours(
    @Req() req: any,
    @Param('restaurantId') restaurantId: string,
    @Body() body: SetServiceHoursDto,
  ) {
    return this.reservations.setServiceHours(
      restaurantId,
      req.user.id,
      body.rows,
    );
  }

  @Delete(':restaurantId/service-hours/:weekday')
  @RequireFeature(FeatureFlag.RESERVATIONS)
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

  @Get(':restaurantId/analytics')
  @RequireFeature(FeatureFlag.RESERVATIONS)
  analytics(@Req() req: any, @Param('restaurantId') restaurantId: string) {
    return this.reservations.getAnalytics(restaurantId, req.user.id);
  }

  @Get(':restaurantId/blackouts')
  @RequireFeature(FeatureFlag.RESERVATIONS)
  listBlackouts(@Req() req: any, @Param('restaurantId') restaurantId: string) {
    return this.reservations.listBlackouts(restaurantId, req.user.id);
  }

  @Post(':restaurantId/blackouts')
  @RequireFeature(FeatureFlag.RESERVATIONS)
  addBlackout(
    @Req() req: any,
    @Param('restaurantId') restaurantId: string,
    @Body() dto: BlackoutDto,
  ) {
    return this.reservations.addBlackout(
      restaurantId,
      req.user.id,
      dto.date,
      dto.reason,
    );
  }

  @Delete(':restaurantId/blackouts/:date')
  @RequireFeature(FeatureFlag.RESERVATIONS)
  removeBlackout(
    @Req() req: any,
    @Param('restaurantId') restaurantId: string,
    @Param('date') date: string,
  ) {
    return this.reservations.removeBlackout(restaurantId, req.user.id, date);
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
  @RequireFeature(FeatureFlag.RESERVATIONS)
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
