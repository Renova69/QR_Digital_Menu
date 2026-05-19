import { IsIn, IsOptional, IsBoolean, IsString, MinLength, MaxLength, Matches } from 'class-validator';
import { SubscriptionTier } from '@prisma/client';

const TIERS: SubscriptionTier[] = ['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'];

export class UpdateTenantTierDto {
  @IsOptional()
  @IsIn(TIERS, { message: 'forceTier must be a valid SubscriptionTier' })
  forceTier?: SubscriptionTier | null;
}

export class UpdateTenantStatusDto {
  @IsBoolean()
  isActive: boolean;
}

export class ResetOwnerPasswordDto {
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'password must contain at least one uppercase letter, one lowercase letter, and one number',
  })
  password: string;
}

export class UpdatePaymentsEnabledDto {
  @IsBoolean()
  paymentsEnabled: boolean;
}
