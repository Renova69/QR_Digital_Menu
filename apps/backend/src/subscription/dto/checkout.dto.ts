import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';

export enum CheckoutTier {
  STARTER = 'STARTER',
  PROFESSIONAL = 'PROFESSIONAL',
  ENTERPRISE = 'ENTERPRISE',
}

export enum BillingPeriod {
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
}

export class CreateCheckoutDto {
  @IsEnum(CheckoutTier)
  tier: CheckoutTier;

  @IsOptional()
  @IsEnum(BillingPeriod)
  billingPeriod: BillingPeriod = BillingPeriod.MONTHLY;

  @IsOptional()
  @IsBoolean()
  onboarding?: boolean;

  @IsOptional()
  @IsString()
  restaurantId?: string;
}
