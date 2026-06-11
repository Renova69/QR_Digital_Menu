import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  ValidateNested,
  IsObject,
  IsUrl,
  Min,
  ArrayMaxSize,
  ArrayMinSize,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ImportChoiceDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  price?: number;

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

  @IsString()
  @MaxLength(100)
  @IsOptional()
  weight?: string;

  @IsString()
  @IsOptional()
  currency?: string;

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
