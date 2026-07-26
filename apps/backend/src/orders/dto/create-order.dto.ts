import {
  IsString,
  IsOptional,
  IsArray,
  ArrayMaxSize,
  ValidateNested,
  IsNumber,
  IsBoolean,
  IsInt,
  Min,
  Max,
  MaxLength,
  IsIn,
  IsDefined,
  ValidateIf,
} from 'class-validator';

import { Type } from 'class-transformer';
import {
  FULFILLMENT_MODES,
  PAYMENT_METHODS,
  type FulfillmentMode,
  type ServicePointPaymentMethod,
} from '../../tables/service-point.constants';

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

  @IsNumber()
  @Min(0)
  @IsOptional()
  expectedUnitPrice?: number;

  @IsArray()
  @IsOptional()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => OrderItemOptionDto)
  selectedOptions?: OrderItemOptionDto[];

  /** Per-item note (e.g. "no onions"). Printed on kitchen tickets (Issue 33). */
  @IsString()
  @IsOptional()
  @MaxLength(500)
  notes?: string;
}

class PosSubmissionDto {
  @IsString()
  @MaxLength(128)
  clientOrderId: string;

  @IsString()
  @MaxLength(128)
  restaurantId: string;

  @IsString()
  @MaxLength(128)
  tableId: string;

  @IsDefined()
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @MaxLength(128)
  expectedTableSessionId: string | null;
}

export class CreateOrderDto {
  @IsString()
  @MaxLength(200)
  customerName: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  customerPhone?: string;

  @IsString()
  @IsOptional()
  tableId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(128)
  servicePointToken?: string;

  @IsString()
  @IsOptional()
  @IsIn(FULFILLMENT_MODES)
  fulfillmentType?: FulfillmentMode;

  @IsString()
  @IsOptional()
  @IsIn(PAYMENT_METHODS)
  paymentPreference?: ServicePointPaymentMethod;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  specialRequests?: string;

  @IsString()
  @IsOptional()
  customerId?: string;

  @IsBoolean()
  @IsOptional()
  usePoints?: boolean;

  @IsInt()
  @Min(1)
  @IsOptional()
  redeemPoints?: number;

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
  @IsIn(['CUSTOMER', 'POS'])
  source?: 'CUSTOMER' | 'POS';

  @ValidateNested()
  @Type(() => PosSubmissionDto)
  @IsOptional()
  posSubmission?: PosSubmissionDto;

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];
}
