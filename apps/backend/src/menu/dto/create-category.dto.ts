import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsArray,
  IsInt,
  Min,
  Max,
} from 'class-validator';

export enum AvailabilityType {
  ALWAYS = 'ALWAYS',
  SCHEDULED = 'SCHEDULED',
  HIDDEN = 'HIDDEN',
}

export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(AvailabilityType)
  @IsOptional()
  availabilityType?: AvailabilityType;

  @IsString()
  @IsOptional()
  startTime?: string;

  @IsString()
  @IsOptional()
  endTime?: string;

  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  @IsOptional()
  daysOfWeek?: number[];

  @IsOptional()
  isDrinkCategory?: boolean;

  @IsString()
  @IsOptional()
  imageUrl?: string;
}
