import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class FeedbackListQueryDto extends PaginationDto {
  // The global ValidationPipe runs forbidNonWhitelisted, so every query param
  // the controller expects has to be declared here even when the handler reads
  // it through a separate @Query('restaurantId') binding -- an undeclared param
  // fails the whole request with "property restaurantId should not exist".
  // Mirrors FeedbackSummaryQueryDto, which declares the same field.
  @IsString()
  @MaxLength(128)
  restaurantId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return value;
  })
  @IsBoolean()
  hasComment?: boolean;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsIn(['NEWEST', 'OLDEST'])
  sort?: 'NEWEST' | 'OLDEST';
}
