import { IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class PaymentHistoryQueryDto extends PaginationDto {
  status?: string;
  startDate?: string;
  endDate?: string;
}
