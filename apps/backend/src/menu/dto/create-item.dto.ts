import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsOptional,
  IsEnum,
  IsArray,
} from 'class-validator';

export enum Currency {
  EUR = 'EUR',
  BGN = 'BGN',
}

export class CreateItemDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @IsPositive()
  price: number;

  @IsEnum(Currency)
  currency: Currency;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  allergens?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  dietaryTags?: string[];

  @IsOptional()
  isFeatured?: boolean;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  relatedItemIds?: string[];

  @IsNumber()
  @IsOptional()
  rewardPointsPrice?: number;
}
