import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsNumber,
  IsBoolean,
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

  /** Stable frontend cart line identifier.  When present, the backend uses it
   *  to match redeemCartIds exactly so the right specific line (with its own
   *  option set) is comped, not just any line sharing the same menuItemId. */
  @IsString()
  @IsOptional()
  cartId?: string;

  @IsInt()
  @Min(1)
  @Max(999)
  quantity: number;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => OrderItemOptionDto)
  selectedOptions?: OrderItemOptionDto[];

  /** Per-item note (e.g. "no onions"). Printed on kitchen tickets (Issue 33). */
  @IsString()
  @IsOptional()
  notes?: string;
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

  @IsBoolean()
  @IsOptional()
  usePoints?: boolean;

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  redeemItemIds?: string[];

  /** Preferred over redeemItemIds when present.  Contains the cartId values
   *  of each cart line the customer wants to redeem as a free item.  Allows
   *  exact matching when the same product appears twice with different options. */
  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  redeemCartIds?: string[];

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
