import { PartialType } from '@nestjs/mapped-types';
import { CreateRestaurantDto } from './create-restaurant.dto';
import {
  IsOptional,
  IsArray,
  ArrayMaxSize,
  ArrayUnique,
  IsBoolean,
  IsNumber,
  IsInt,
  IsHexColor,
  IsIn,
  IsString,
  IsEmail,
  IsUrl,
  Matches,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { BRANDING_FONT_NAMES } from '../branding-fonts';
import {
  HHMM_PATTERN,
  HAPPY_HOUR_WEEKDAY_MIN,
  HAPPY_HOUR_WEEKDAY_MAX,
} from '../../common/weekday';
import {
  MAX_TARGET_LANGUAGES,
  SUPPORTED_TARGET_LANGUAGE_CODES,
} from '../restaurant-languages';

export class UpdateRestaurantDto extends PartialType(CreateRestaurantDto) {
  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  contactInfo?: string;

  @IsArray()
  @ArrayMaxSize(MAX_TARGET_LANGUAGES)
  @ArrayUnique()
  @IsString({ each: true })
  @IsIn([...SUPPORTED_TARGET_LANGUAGE_CODES], { each: true })
  @IsOptional()
  targetLanguages?: string[];

  @IsString()
  @IsOptional()
  dashboardLanguage?: string;

  @IsString()
  @IsOptional()
  timezone?: string;

  @IsIn(['AUTO', 'MANUAL', 'OFF'])
  @IsOptional()
  trendingMode?: string;

  @IsString()
  @MaxLength(64)
  @IsIn([...BRANDING_FONT_NAMES])
  @IsOptional()
  fontHeading?: string;

  @IsString()
  @MaxLength(64)
  @IsIn([...BRANDING_FONT_NAMES])
  @IsOptional()
  fontBody?: string;

  @IsHexColor()
  @IsOptional()
  themeBgColor?: string;

  @IsHexColor()
  @IsOptional()
  themeTextColor?: string;

  @IsHexColor()
  @IsOptional()
  themeCardColor?: string;

  @IsHexColor()
  @IsOptional()
  themeLightBgColor?: string;

  @IsHexColor()
  @IsOptional()
  themeLightTextColor?: string;

  @IsHexColor()
  @IsOptional()
  themeLightCardColor?: string;

  @IsHexColor()
  @IsOptional()
  themeLightAccentColor?: string;

  @IsHexColor()
  @IsOptional()
  themeDarkBgColor?: string;

  @IsHexColor()
  @IsOptional()
  themeDarkTextColor?: string;

  @IsHexColor()
  @IsOptional()
  themeDarkCardColor?: string;

  @IsHexColor()
  @IsOptional()
  themeDarkAccentColor?: string;

  @IsIn(['light', 'dark'])
  @IsOptional()
  defaultTheme?: string;

  /** Thumbnail URL produced by the logo upload processor.  Persisted alongside
   *  logoUrl via the PATCH so both writes are atomic.  Null clears the thumbnail
   *  when the owner removes the logo.  StorageService always emits fully-qualified
   *  http/https URLs (falling back to localhost when R2_PUBLIC_URL is unset), so
   *  @IsUrl is safe here. */
  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    require_valid_protocol: true,
  })
  @IsOptional()
  logoThumbnailUrl?: string | null;

  @IsOptional()
  @IsBoolean()
  isLoyaltyEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  loyaltySignupBonus?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  loyaltyExchangeRate?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  loyaltyRedeemRate?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  loyaltyPointExpiryDays?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  loyaltyExpiryReminderDays?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  loyaltySilverThreshold?: number;

  @IsOptional()
  @IsInt()
  @Min(2)
  loyaltyGoldThreshold?: number;

  @IsOptional()
  @IsNumber()
  @Min(1.0)
  @Max(5.0)
  loyaltySilverMultiplier?: number;

  @IsOptional()
  @IsNumber()
  @Min(1.0)
  @Max(5.0)
  loyaltyGoldMultiplier?: number;

  @IsOptional()
  @IsBoolean()
  happyHourEnable?: boolean;

  // Luxon weekday convention: 1=Mon … 7=Sun. See common/weekday.ts (#16).
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(HAPPY_HOUR_WEEKDAY_MIN, { each: true })
  @Max(HAPPY_HOUR_WEEKDAY_MAX, { each: true })
  happyHourDays?: number[];

  @IsOptional()
  @Matches(HHMM_PATTERN, {
    message: 'happyHourStartTime must be HH:mm (00:00–23:59)',
  })
  happyHourStartTime?: string;

  @IsOptional()
  @Matches(HHMM_PATTERN, {
    message: 'happyHourEndTime must be HH:mm (00:00–23:59)',
  })
  happyHourEndTime?: string;

  @IsOptional()
  @IsNumber()
  @Min(1.0)
  @Max(10.0)
  happyHourMultiplier?: number;

  @IsOptional()
  @IsBoolean()
  paymentsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  epayEnabled?: boolean;

  @IsOptional()
  @IsIn(['DEMO', 'LIVE'])
  epayMode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Matches(/^[A-Za-z0-9]+$/, {
    message: 'epayClientId must contain only letters and numbers',
  })
  epayClientId?: string | null;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  epayMerchantEmail?: string | null;

  /** Raw ePay secret from the admin form. Encrypted to {@code epaySecretEncrypted} before storage. */
  @IsOptional()
  @IsString()
  @MaxLength(256)
  epaySecret?: string | null;

  @IsOptional()
  @IsIn(['credit_paydirect', 'paylogin'])
  epayPage?: string;

  @IsOptional()
  @IsBoolean()
  boricaEnabled?: boolean;

  @IsOptional()
  @IsIn(['DEMO', 'LIVE'])
  boricaMode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Matches(/^[A-Za-z0-9]+$/, {
    message: 'boricaTerminalId must contain only letters and numbers',
  })
  boricaTerminalId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Matches(/^[0-9]+$/, { message: 'boricaMerchantId must contain only digits' })
  boricaMerchantId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(25)
  boricaMerchantName?: string | null;

  /** Raw BORICA private key from the admin form. Encrypted to {@code boricaPrivateKeyEncrypted} before storage. */
  @IsOptional()
  @IsString()
  boricaPrivateKey?: string | null;

  @IsOptional()
  @IsString()
  boricaPublicCert?: string | null;

  @IsOptional()
  @IsIn(['EUR'])
  boricaCurrency?: string;

  @IsOptional()
  @IsBoolean()
  myposEnabled?: boolean;

  @IsOptional()
  @IsIn(['DEMO', 'LIVE'])
  myposMode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Matches(/^[0-9]+$/, {
    message: 'myposClientNumber must contain only digits',
  })
  myposClientNumber?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Matches(/^[A-Za-z0-9]+$/, {
    message: 'myposStoreId must contain only letters and numbers',
  })
  myposStoreId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  @Matches(/^[0-9]+$/, { message: 'myposKeyIndex must contain only digits' })
  myposKeyIndex?: string | null;

  /** Raw MyPOS private key from the admin form. Encrypted to {@code myposPrivateKeyEncrypted} before storage. */
  @IsOptional()
  @IsString()
  myposPrivateKey?: string | null;

  @IsOptional()
  @IsString()
  myposPublicCert?: string | null;

  @IsOptional()
  @IsIn(['EUR'])
  myposCurrency?: string;

  @IsOptional()
  @IsBoolean()
  tipsEnabled?: boolean;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(100, { each: true })
  tipOptions?: number[];

  @IsOptional()
  @IsBoolean()
  sharedDeviceModeEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyAllStaffOnPayment?: boolean;
}
