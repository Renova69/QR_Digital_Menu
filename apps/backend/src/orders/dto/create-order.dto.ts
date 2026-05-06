import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsNumber,
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

  @IsNumber()
  quantity: number;

  @IsArray()
  @IsOptional()
  selectedOptions: any[];
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

  @IsNumber()
  @IsOptional()
  redeemPoints?: number;

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  redeemItemIds?: string[];

  @IsString()
  @IsOptional()
  sessionToken?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];
}
