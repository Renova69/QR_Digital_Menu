import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  MaxLength,
} from 'class-validator';

export class CreateAssistanceDto {
  /** Legacy table *name*. See CreateOrderDto.tableId — same P0-2 sunset. */
  @IsString()
  @IsNotEmpty()
  tableId: string;

  /** The table's `publicToken`, carried by its QR code. See P0-2. */
  @IsString()
  @IsOptional()
  @MaxLength(128)
  tableToken?: string;

  @IsString()
  @IsNotEmpty()
  restaurantId: string;

  @IsOptional()
  @IsString()
  @IsIn(['STANDARD', 'URGENT', 'CASH_PAYMENT'])
  type?: string;
}
