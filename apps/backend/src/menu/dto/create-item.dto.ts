import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsOptional,
  IsEnum,
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

  @IsEnum(Currency)
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
