import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ReservationOccasion } from '@prisma/client';
import { SUPPORTED_TARGET_LANGUAGE_CODES } from '../../restaurants/restaurant-languages';

export class AvailabilityQueryDto {
  @IsString()
  date!: string; // YYYY-MM-DD in the restaurant's local timezone

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  adults!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(50)
  @IsOptional()
  children?: number;
}

// Feature 2: guest self-service modification via private token link. All fields
// optional — the guest may change just the time, just the party, or both.
export class ModifyReservationDto {
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  adultsCount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(50)
  childrenCount?: number;
}

export class CreateReservationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  guestName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  guestPhone!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  guestEmail?: string;

  @IsDateString()
  startsAt!: string; // UTC ISO instant of the chosen slot

  // Language selected on the public booking page. Persisted with the booking
  // so later confirmations, cancellations and reminders stay consistent.
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.trim().toLowerCase().split(/[-_]/)[0]
      : value,
  )
  @IsIn(SUPPORTED_TARGET_LANGUAGE_CODES)
  locale?: string;

  @IsInt()
  @Min(1)
  @Max(50)
  adultsCount!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50)
  childrenCount?: number;

  @IsOptional()
  @IsEnum(ReservationOccasion)
  occasion?: ReservationOccasion;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  customerNotes?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  customerPreferences?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  allergyNotes?: string;

  // Explicit consent for storing dietary/allergy (special-category) data.
  @IsOptional()
  @IsBoolean()
  dietaryConsent?: boolean;

  // Explicit opt-in to receive marketing/promotions (separate from the booking).
  @IsOptional()
  @IsBoolean()
  marketingConsent?: boolean;

  // Feature 1: guest-chosen notification channels. When omitted, the service
  // defaults to email (if an address was given). SMS requires the phone number
  // that is already mandatory for a booking.
  @IsOptional()
  @IsBoolean()
  notifyByEmail?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyBySms?: boolean;

  // Feature 3: preferred seating zone (soft hint; must be one the restaurant
  // offers). Free string capped for safety; validated against the zone list.
  @IsOptional()
  @IsString()
  @MaxLength(60)
  preferredZone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  idempotencyKey?: string;
}
