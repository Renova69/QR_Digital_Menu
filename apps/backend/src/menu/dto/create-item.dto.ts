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
} from 'class-validator';

export enum Currency {
  EUR = 'EUR',
  BGN = 'BGN',
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

  // F-FE-1/F-FE-3: EUR is the only transactional currency (Bulgaria adopted
  // the euro 2026-01-01). BGN is display-only via a fixed-rate conversion at
  // the public-menu presentation boundary — never an authoritative price.
  @IsIn([Currency.EUR], {
    message: 'currency must be EUR — BGN is display-only, never transactional',
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
}
