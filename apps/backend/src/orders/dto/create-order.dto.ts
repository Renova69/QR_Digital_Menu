import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsNumber,
  IsInt,
  Min,
  Max,
} from 'class-validator';

import { Type } from 'class-transformer';

class OrderItemOptionDto {
  @IsString()
  optionId: string;

  @IsString()
  optionName: string;

  @IsString()
  choiceName: string;

  @IsNumber()
  priceModifier: number;
}

class OrderItemDto {
  @IsString()
  menuItemId: string;

  @IsInt()
  @Min(1)
  @Max(999)
  quantity: number;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => OrderItemOptionDto)
  selectedOptions?: OrderItemOptionDto[];
}

export class CreateOrderDto {
  @IsString()
  customerName: string;

  @IsString()
  @IsOptional()
  customerPhone?: string;

  @IsString()
  tableId: string;

  @IsString()
  @IsOptional()
  specialRequests?: string;

  @IsString()
  @IsOptional()
  customerId?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  redeemPoints?: number;

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  redeemItemIds?: string[];

  @IsString()
  @IsOptional()
  sessionToken?: string;

  @IsString()
  @IsOptional()
  source?: 'CUSTOMER' | 'POS';

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];
}
