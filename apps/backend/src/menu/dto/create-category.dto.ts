import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsArray,
  IsInt,
  Min,
  Max,
  MaxLength,
  Matches,
} from 'class-validator';
import {
  CATEGORY_WEEKDAY_MIN,
  CATEGORY_WEEKDAY_MAX,
  HHMM_PATTERN,
} from '../../common/weekday';

export enum AvailabilityType {
  ALWAYS = 'ALWAYS',
  SCHEDULED = 'SCHEDULED',
  HIDDEN = 'HIDDEN',
}

export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsEnum(AvailabilityType)
  @IsOptional()
  availabilityType?: AvailabilityType;

  @Matches(HHMM_PATTERN, { message: 'startTime must be HH:mm (00:00–23:59)' })
  @IsOptional()
  startTime?: string;

  @Matches(HHMM_PATTERN, { message: 'endTime must be HH:mm (00:00–23:59)' })
  @IsOptional()
  endTime?: string;

  // JS getDay() convention: 0=Sun … 6=Sat. See common/weekday.ts (#16).
  @IsArray()
  @IsInt({ each: true })
  @Min(CATEGORY_WEEKDAY_MIN, { each: true })
  @Max(CATEGORY_WEEKDAY_MAX, { each: true })
  @IsOptional()
  daysOfWeek?: number[];

  @IsOptional()
  isDrinkCategory?: boolean;

  @IsString()
  @IsOptional()
  imageUrl?: string;
}
