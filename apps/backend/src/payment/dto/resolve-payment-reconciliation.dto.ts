import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ResolvePaymentReconciliationDto {
  @IsIn(['RESOLVED', 'DISMISSED'])
  status!: 'RESOLVED' | 'DISMISSED';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
