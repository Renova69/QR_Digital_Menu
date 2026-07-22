import { IsIn, IsOptional } from 'class-validator';

export class PaymentReconciliationQueryDto {
  @IsOptional()
  @IsIn(['OPEN', 'RESOLVED', 'DISMISSED'])
  status?: 'OPEN' | 'RESOLVED' | 'DISMISSED';
}
