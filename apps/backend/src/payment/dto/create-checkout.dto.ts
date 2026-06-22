import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

// Optional cardholder details required by BORICA's EMV-3DS hosted form.
export class BoricaCardholderDto {
  @IsOptional()
  @IsString()
  cardholderName?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  billingAddress?: string;
}

// Public self-pay checkout body. `provider` stays a loose string — the
// controller upper-cases it and the service switch defaults unknown values to
// STRIPE, so tightening it to an enum here would reject lowercase callers for no
// gain. The security-relevant field is `orderIds` (scoped self-pay), which the
// service re-validates against the session in resolveCheckoutCharge.
export class CreateCheckoutDto {
  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  tipPercent?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => BoricaCardholderDto)
  boricaCardholder?: BoricaCardholderDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  orderIds?: string[];
}
