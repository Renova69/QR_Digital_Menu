import { IsString, MaxLength } from 'class-validator';
import { DateRangeQueryDto } from '../../common/dto/date-range-query.dto';

export class FeedbackSummaryQueryDto extends DateRangeQueryDto {
  @IsString()
  @MaxLength(128)
  restaurantId!: string;
}
