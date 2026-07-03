import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ReservationOccasion } from '@prisma/client';

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

  @IsOptional()
  @IsString()
  @MaxLength(64)
  idempotencyKey?: string;
}
