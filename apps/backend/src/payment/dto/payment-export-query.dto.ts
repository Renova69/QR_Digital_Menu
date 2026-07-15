import {
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PaymentProvider } from '@prisma/client';

export class PaymentExportQueryDto {
  @IsOptional()
  @IsIn(['PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'ABANDONED'])
  status?: string;

  @IsOptional()
  @IsEnum(PaymentProvider)
  provider?: PaymentProvider;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
