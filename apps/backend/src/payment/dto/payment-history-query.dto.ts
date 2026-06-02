import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class PaymentHistoryQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  @IsIn(['PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED'])
  status?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}
