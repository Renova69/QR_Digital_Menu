import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ReservationsService } from './reservations.service';
import {
  AvailabilityQueryDto,
  CreateReservationDto,
} from './dto/public-reservation.dto';

@Controller('reservations/public')
export class PublicReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

  @Get(':restaurantId/config')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  config(@Param('restaurantId') restaurantId: string) {
    return this.reservations.getPublicConfig(restaurantId);
  }

  @Get(':restaurantId/availability')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  availability(
    @Param('restaurantId') restaurantId: string,
    @Query() query: AvailabilityQueryDto,
  ) {
    return this.reservations.getPublicAvailability(
      restaurantId,
      query.date,
      query.adults,
      query.children ?? 0,
    );
  }

  @Post(':restaurantId')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  create(
    @Param('restaurantId') restaurantId: string,
    @Body() dto: CreateReservationDto,
  ) {
    return this.reservations.createPublic(restaurantId, dto);
  }

  @Get(':restaurantId/status/:referenceCode')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  status(
    @Param('restaurantId') restaurantId: string,
    @Param('referenceCode') referenceCode: string,
  ) {
    return this.reservations.getPublicStatus(restaurantId, referenceCode);
  }
}
