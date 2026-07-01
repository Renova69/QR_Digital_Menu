import { IsNumber, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

// L-PAY-1: boundary type/validation consistency with CreateCheckoutDto's
// tipPercent — service-level validation in normalizeTipPercent stays as
// defense in depth.
export class CreatePaymentIntentDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  tipPercent?: number;
}
