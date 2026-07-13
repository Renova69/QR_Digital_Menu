import {
  IsString,
  IsOptional,
  IsNotEmpty,
  IsBoolean,
  IsArray,
  IsIn,
  MaxLength,
} from 'class-validator';
import {
  FULFILLMENT_MODES,
  PAYMENT_METHODS,
  type FulfillmentMode,
  type ServicePointPaymentMethod,
} from '../service-point.constants';

export class UpdateTableDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  zoneId?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @IsIn(FULFILLMENT_MODES, { each: true })
  fulfillmentModes?: FulfillmentMode[];

  @IsOptional()
  @IsArray()
  @IsIn(PAYMENT_METHODS, { each: true })
  paymentMethods?: ServicePointPaymentMethod[];
}
