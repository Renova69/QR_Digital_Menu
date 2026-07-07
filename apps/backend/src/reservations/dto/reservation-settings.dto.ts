import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class UpdateReservationSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(120)
  slotIntervalMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10080)
  minLeadMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  bookingHorizonDays?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  maxTotalGuests?: number;

  // null explicitly clears the cap; omit to leave unchanged.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  maxCoversPerSlot?: number | null;

  @IsOptional()
  @IsBoolean()
  autoConfirm?: boolean;

  @IsOptional()
  @IsBoolean()
  requirePhone?: boolean;

  @IsOptional()
  @IsBoolean()
  allergenSectionEnabled?: boolean;

  // Owner-defined custom preference chips for the public booking form.
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  customPreferences?: string[];

  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  notifyEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  notifyPhone?: string;

  // Feature 4: dining duration / turnover time (minutes).
  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(600)
  diningDurationMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(50)
  largePartyThreshold?: number;

  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(600)
  largePartyDurationMinutes?: number;
}

export class ServiceHoursDto {
  @IsInt()
  @Min(1)
  @Max(7)
  weekday!: number; // ISO 1..7

  @IsInt()
  @Min(0)
  @Max(1439)
  openMinute!: number;

  @IsInt()
  @Min(0)
  @Max(1439)
  lastSlotMinute!: number;
}

export class SetServiceHoursDto {
  @IsArray()
  @ArrayMaxSize(7)
  @ArrayUnique((row: ServiceHoursDto) => row.weekday)
  @ValidateNested({ each: true })
  @Type(() => ServiceHoursDto)
  rows!: ServiceHoursDto[];
}
