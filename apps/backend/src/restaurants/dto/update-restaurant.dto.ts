import { PartialType } from '@nestjs/mapped-types';
import { CreateRestaurantDto } from './create-restaurant.dto';
import {
  IsString,
  IsOptional,
  IsArray,
  IsBoolean,
  IsNumber,
  IsInt,
  Min,
  Max,
} from 'class-validator';

export class UpdateRestaurantDto extends PartialType(CreateRestaurantDto) {
  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  contactInfo?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  targetLanguages?: string[];

  @IsString()
  @IsOptional()
  dashboardLanguage?: string;

  @IsString()
  @IsOptional()
  timezone?: string;

  @IsString()
  @IsOptional()
  trendingMode?: string;

  @IsString()
  @IsOptional()
  fontHeading?: string;

  @IsString()
  @IsOptional()
  fontBody?: string;

  @IsString()
  @IsOptional()
  themeBgColor?: string;

  @IsString()
  @IsOptional()
  themeTextColor?: string;

  @IsString()
  @IsOptional()
  themeCardColor?: string;

  @IsString()
  @IsOptional()
  defaultTheme?: string;

  @IsOptional()
  @IsBoolean()
  isLoyaltyEnabled?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  loyaltySignupBonus?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  loyaltyExchangeRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10000)
  loyaltyRedeemRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  loyaltyPointExpiryDays?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  loyaltyExpiryReminderDays?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  loyaltySilverThreshold?: number;

  @IsOptional()
  @IsNumber()
  @Min(2)
  loyaltyGoldThreshold?: number;

  @IsOptional()
  @IsNumber()
  @Min(1.0)
  @Max(5.0)
  loyaltySilverMultiplier?: number;

  @IsOptional()
  @IsNumber()
  @Min(1.0)
  @Max(5.0)
  loyaltyGoldMultiplier?: number;

  @IsOptional()
  @IsBoolean()
  happyHourEnable?: boolean;

  @IsOptional()
  @IsString()
  happyHourStartTime?: string;

  @IsOptional()
  @IsString()
  happyHourEndTime?: string;

  @IsOptional()
  @IsNumber()
  @Min(1.0)
  @Max(10.0)
  happyHourMultiplier?: number;

  @IsOptional()
  @IsBoolean()
  paymentsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  tipsEnabled?: boolean;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(100, { each: true })
  tipOptions?: number[];

}
