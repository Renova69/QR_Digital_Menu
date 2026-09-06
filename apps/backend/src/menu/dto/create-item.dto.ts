import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsOptional,
  IsIn,
  IsArray,
  ArrayMaxSize,
  IsBoolean,
  IsInt,
  Min,
  MaxLength,
  ArrayUnique,
} from 'class-validator';
import { UPSELL_CONTEXTS } from '../upsell/upsell-context';
import { ApiProperty } from '@nestjs/swagger';
import {
  REWARD_POINTS_MODES,
  RewardPointsModeValue,
} from '../../loyalty/reward-pricing';

export enum Currency {
  EUR = 'EUR',
}

export class CreateItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string;

  @IsNumber()
  @IsPositive()
  price: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  costPrice?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  weight?: string;

  // EUR is the only supported currency across the product.
  @ApiProperty({ enum: [Currency.EUR] })
  @IsIn([Currency.EUR], {
    message: 'currency must be EUR',
  })
  currency: Currency;

  @IsArray()
  @ArrayMaxSize(15)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  @IsOptional()
  allergens?: string[];

  @IsArray()
  @ArrayMaxSize(15)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  @IsOptional()
  dietaryTags?: string[];

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  relatedItemIds?: string[];

  @IsInt()
  @Min(1)
  @IsOptional()
  rewardPointsPrice?: number;

  @IsIn(REWARD_POINTS_MODES)
  @IsOptional()
  rewardPointsMode?: RewardPointsModeValue;

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
}
