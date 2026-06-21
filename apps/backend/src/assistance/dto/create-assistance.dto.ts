import { IsString, IsNotEmpty, IsOptional, IsIn } from 'class-validator';

export class CreateAssistanceDto {
  @IsString()
  @IsNotEmpty()
  tableId: string;

  @IsString()
  @IsNotEmpty()
  restaurantId: string;

  @IsOptional()
  @IsString()
  @IsIn(['STANDARD', 'URGENT', 'CASH_PAYMENT'])
  type?: string;
}
