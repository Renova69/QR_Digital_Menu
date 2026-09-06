import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  IsBoolean,
  IsInt,
  ValidateNested,
  IsObject,
  IsUrl,
  Min,
  ArrayMaxSize,
  ArrayMinSize,
  MaxLength,
  IsIn,
  ArrayUnique,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { Currency } from '@prisma/client';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  REWARD_POINTS_MODES,
  RewardPointsModeValue,
} from '../../loyalty/reward-pricing';
import { UPSELL_CONTEXTS } from '../../menu/upsell/upsell-context';

export class ImportChoiceDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  price?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  priceModifier?: number;

  @IsString()
  @MaxLength(100)
  @IsOptional()
  weight?: string;
}

export class ImportOptionDto {
  @IsString()
  @MaxLength(100)
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  type?: string;

  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => ImportChoiceDto)
  choices: ImportChoiceDto[];
}

export class ImportItemDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  price?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  costPrice?: number;

  @IsString()
  @MaxLength(100)
  @IsOptional()
  weight?: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @ApiPropertyOptional({ enum: [Currency.EUR] })
  @IsIn([Currency.EUR], { message: 'currency must be EUR' })
  @IsOptional()
  currency?: Currency;

  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @IsOptional()
  allergens?: string[];

  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @IsOptional()
  dietaryTags?: string[];

  @IsArray()
  @ArrayMaxSize(15)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  @IsOptional()
  tags?: string[];

  @IsArray()
  @ArrayMaxSize(UPSELL_CONTEXTS.length)
  @ArrayUnique()
  @IsIn(UPSELL_CONTEXTS, { each: true })
  @IsOptional()
  upsellContexts?: string[];

  @IsNumber()
  @IsOptional()
  order?: number;

  @IsObject()
  @IsOptional()
  translations?: Record<string, { name?: string; description?: string }>;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @IsUrl({ require_tld: true, protocols: ['https', 'http'] })
  imageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @IsUrl({ require_tld: true, protocols: ['https', 'http'] })
  thumbnailUrl?: string;

  @IsBoolean()
  @IsOptional()
  isOutOfStock?: boolean;

  @IsBoolean()
  @IsOptional()
  isFeatured?: boolean;

  @IsInt()
  @Min(1)
  @IsOptional()
  rewardPointsPrice?: number;

  @IsIn(REWARD_POINTS_MODES)
  @IsOptional()
  rewardPointsMode?: RewardPointsModeValue;

  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ImportOptionDto)
  @IsOptional()
  options?: ImportOptionDto[];
}

export class ImportCategoryDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsNumber()
  @IsOptional()
  order?: number;

  @IsString()
  @IsOptional()
  availabilityType?: string;

  @IsObject()
  @IsOptional()
  translations?: Record<string, { name?: string }>;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @IsUrl({ require_tld: true, protocols: ['https', 'http'] })
  imageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @IsUrl({ require_tld: true, protocols: ['https', 'http'] })
  thumbnailUrl?: string;

  @IsString()
  @IsOptional()
  startTime?: string;

  @IsString()
  @IsOptional()
  endTime?: string;

  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  daysOfWeek?: number[];

  @IsBoolean()
  @IsOptional()
  isDrinkCategory?: boolean;

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ImportItemDto)
  items: ImportItemDto[];
}

export class ImportMenuDto {
  @IsString()
  @IsOptional()
  restaurantId?: string;

  @IsString()
  @IsOptional()
  restaurant_name?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ImportCategoryDto)
  categories: ImportCategoryDto[];
}
