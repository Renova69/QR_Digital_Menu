import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateReservationDto } from './public-reservation.dto';

export const RESERVATION_ACTIONS = [
  'ACCEPT',
  'DECLINE',
  'CANCEL',
  'NO_SHOW',
  'ARRIVED',
] as const;
export type ReservationActionType = (typeof RESERVATION_ACTIONS)[number];

export const RESERVATION_STATUS_FILTERS = [
  'PENDING',
  'CONFIRMED',
  'DECLINED',
  'CANCELLED',
  'NO_SHOW',
  'ARRIVED',
] as const;

export class ReservationActionDto {
  @IsIn(RESERVATION_ACTIONS)
  action!: ReservationActionType;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class ListReservationsQueryDto {
  @IsOptional()
  @IsString()
  date?: string; // YYYY-MM-DD local; defaults to today

  @IsOptional()
  @IsIn(RESERVATION_STATUS_FILTERS)
  status?: string;

  // When "true", returns all still-actionable upcoming reservations across
  // days (ignores date/status). Drives the dashboard summary panel.
  @IsOptional()
  @IsString()
  upcoming?: string;
}

// Staff-created booking: guest fields + optional internal notes / patron tags.
export class ManualReservationDto extends CreateReservationDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  internalNotes?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  staffTags?: string[];
}

export class UpdateInternalDto {
  @IsNotEmpty()
  @IsString()
  restaurantId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  internalNotes?: string;

  // Applied to the linked patron (cross-visit), not the reservation.
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  staffTags?: string[];
}

export class ReservationActionBodyDto extends ReservationActionDto {
  @IsNotEmpty()
  @IsString()
  restaurantId!: string;
}

export class CoverCountDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(50)
  @IsOptional()
  children?: number;
}

// Feature 5: owner-declared closed day. `date` is validated again in the
// service (Luxon) before storage; the regex here is the cheap first boundary.
export class BlackoutDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must be YYYY-MM-DD',
  })
  date!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
