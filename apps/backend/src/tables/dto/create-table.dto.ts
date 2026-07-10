import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  IsArray,
  IsBoolean,
} from 'class-validator';
import {
  FULFILLMENT_MODES,
  PAYMENT_METHODS,
  SERVICE_POINT_TYPES,
  type FulfillmentMode,
  type ServicePointPaymentMethod,
  type ServicePointType,
} from '../service-point.constants';

export class CreateTableDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  zoneId?: string;

  @IsOptional()
  @IsIn(SERVICE_POINT_TYPES)
  type?: ServicePointType;

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
