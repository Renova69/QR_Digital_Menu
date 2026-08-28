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
import { RequireRestaurantAccess } from '../auth/require-restaurant-access.decorator';
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

type ReservationActorRequest = {
  user: { id: string; role?: string; restaurantId?: string };
};

// Keep the feature requirement on the whole controller; each route runs JWT,
// restaurant access, then FeatureGuard. Route discovery pins this ordering.
@Controller('reservations')
@RequireFeature(FeatureFlag.RESERVATIONS)
export class ReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

  @UseGuards(FeatureGuard)
  @RequireRestaurantAccess({
    policy: 'reservation-management',
    source: 'params',
    key: 'restaurantId',
  })
  @Get(':restaurantId/settings')
  getSettings(
    @Req() req: ReservationActorRequest,
    @Param('restaurantId') restaurantId: string,
  ) {
    return this.reservations.getSettings(restaurantId, req.user.id);
  }

  @UseGuards(FeatureGuard)
  @RequireRestaurantAccess({
    policy: 'reservation-management',
    source: 'params',
    key: 'restaurantId',
  })
  @Put(':restaurantId/settings')
  updateSettings(
    @Req() req: ReservationActorRequest,
    @Param('restaurantId') restaurantId: string,
    @Body() dto: UpdateReservationSettingsDto,
  ) {
    return this.reservations.updateSettings(
      restaurantId,
      req.user.id,
      dto as unknown as Record<string, unknown>,
    );
  }

  @UseGuards(FeatureGuard)
  @RequireRestaurantAccess({
    policy: 'reservation-management',
    source: 'params',
    key: 'restaurantId',
  })
  @Post(':restaurantId/service-hours')
  setServiceHours(
    @Req() req: ReservationActorRequest,
    @Param('restaurantId') restaurantId: string,
    @Body() body: SetServiceHoursDto,
  ) {
    return this.reservations.setServiceHours(
      restaurantId,
      req.user.id,
      body.rows,
    );
  }

  @UseGuards(FeatureGuard)
  @RequireRestaurantAccess({
    policy: 'reservation-management',
    source: 'params',
    key: 'restaurantId',
  })
  @Delete(':restaurantId/service-hours/:weekday')
  deleteServiceHours(
    @Req() req: ReservationActorRequest,
    @Param('restaurantId') restaurantId: string,
    @Param('weekday', ParseIntPipe) weekday: number,
  ) {
    return this.reservations.deleteServiceHours(
      restaurantId,
      req.user.id,
      weekday,
    );
  }

  @UseGuards(FeatureGuard)
  @RequireRestaurantAccess({
    policy: 'reservation-management',
    source: 'params',
    key: 'restaurantId',
  })
  @Get(':restaurantId/analytics')
  analytics(
    @Req() req: ReservationActorRequest,
    @Param('restaurantId') restaurantId: string,
  ) {
    return this.reservations.getAnalytics(restaurantId, req.user.id);
  }

  @UseGuards(FeatureGuard)
  @RequireRestaurantAccess({
    policy: 'reservation-management',
    source: 'params',
    key: 'restaurantId',
  })
  @Get(':restaurantId/blackouts')
  listBlackouts(
    @Req() req: ReservationActorRequest,
    @Param('restaurantId') restaurantId: string,
  ) {
    return this.reservations.listBlackouts(restaurantId, req.user.id);
  }

  @UseGuards(FeatureGuard)
  @RequireRestaurantAccess({
    policy: 'reservation-management',
    source: 'params',
    key: 'restaurantId',
  })
  @Post(':restaurantId/blackouts')
  addBlackout(
    @Req() req: ReservationActorRequest,
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

  @UseGuards(FeatureGuard)
  @RequireRestaurantAccess({
    policy: 'reservation-management',
    source: 'params',
    key: 'restaurantId',
  })
  @Delete(':restaurantId/blackouts/:date')
  removeBlackout(
    @Req() req: ReservationActorRequest,
    @Param('restaurantId') restaurantId: string,
    @Param('date') date: string,
  ) {
    return this.reservations.removeBlackout(restaurantId, req.user.id, date);
  }

  @UseGuards(FeatureGuard)
  @RequireRestaurantAccess({
    policy: 'reservation-read',
    source: 'params',
    key: 'restaurantId',
  })
  @Get(':restaurantId')
  list(
    @Req() req: ReservationActorRequest,
    @Param('restaurantId') restaurantId: string,
    @Query() query: ListReservationsQueryDto,
  ) {
    return this.reservations.list(restaurantId, req.user.id, query);
  }

  @UseGuards(FeatureGuard)
  @RequireRestaurantAccess({
    policy: 'reservation-operations',
    source: 'params',
    key: 'restaurantId',
  })
  @Post(':restaurantId/manual')
  createManual(
    @Req() req: ReservationActorRequest,
    @Param('restaurantId') restaurantId: string,
    @Body() dto: ManualReservationDto,
  ) {
    return this.reservations.createManual(restaurantId, req.user.id, dto);
  }

  @UseGuards(FeatureGuard)
  @RequireRestaurantAccess({
    policy: 'reservation-action',
    source: 'body',
    key: 'restaurantId',
  })
  @Post('action/:id')
  action(
    @Req() req: ReservationActorRequest,
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

  @UseGuards(FeatureGuard)
  @RequireRestaurantAccess({
    policy: 'reservation-operations',
    source: 'body',
    key: 'restaurantId',
  })
  @Patch('internal/:id')
  updateInternal(
    @Req() req: ReservationActorRequest,
    @Param('id') id: string,
    @Body() dto: UpdateInternalDto,
  ) {
    return this.reservations.updateInternal(id, req.user.id, dto.restaurantId, {
      internalNotes: dto.internalNotes,
      staffTags: dto.staffTags,
    });
  }
}
