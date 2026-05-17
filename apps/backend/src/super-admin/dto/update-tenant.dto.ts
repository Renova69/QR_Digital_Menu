import { IsIn, IsOptional, IsBoolean } from 'class-validator';
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
