import {
  IsIn,
  IsOptional,
  IsBoolean,
  IsString,
  IsInt,
  Min,
  Max,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
import { SubscriptionTier } from '@prisma/client';

const TIERS: SubscriptionTier[] = [
  'FREE',
  'STARTER',
  'PROFESSIONAL',
  'ENTERPRISE',
];

export class SuperAdminConfirmationDto {
  @IsString()
  @Matches(/^CONFIRM$/, { message: 'confirmation must be exactly CONFIRM' })
  confirmation: string;
}

export class UpdateTenantTierDto {
  @IsOptional()
  @IsIn(TIERS, { message: 'forceTier must be a valid SubscriptionTier' })
  forceTier?: SubscriptionTier | null;

  // Optional auto-expiry for the override (M-2). When set with a forceTier, the
  // override is cleared automatically after this many days by the hourly cron,
  // so a forgotten override can't grant (or deny) a tier forever. Omit for a
  // permanent override (legacy behaviour).
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  forceTierExpiresInDays?: number | null;

  @IsString()
  @Matches(/^CONFIRM$/, { message: 'confirmation must be exactly CONFIRM' })
  confirmation: string;
}

export class UpdateTenantStatusDto {
  @IsBoolean()
  isActive: boolean;

  @IsString()
  @Matches(/^CONFIRM$/, { message: 'confirmation must be exactly CONFIRM' })
  confirmation: string;
}

export class ResetOwnerPasswordDto {
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'password must contain at least one uppercase letter, one lowercase letter, and one number',
  })
  password: string;

  @IsString()
  @Matches(/^CONFIRM$/, { message: 'confirmation must be exactly CONFIRM' })
  confirmation: string;
}

export class UpdatePaymentsEnabledDto {
  @IsBoolean()
  paymentsEnabled: boolean;

  @IsString()
  @Matches(/^CONFIRM$/, { message: 'confirmation must be exactly CONFIRM' })
  confirmation: string;
}
