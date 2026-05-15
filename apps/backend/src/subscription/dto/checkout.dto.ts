import { IsEnum } from 'class-validator';

export enum CheckoutTier {
  STARTER = 'STARTER',
  PROFESSIONAL = 'PROFESSIONAL',
  ENTERPRISE = 'ENTERPRISE',
}

export class CreateCheckoutDto {
  @IsEnum(CheckoutTier)
  tier: CheckoutTier;
}
