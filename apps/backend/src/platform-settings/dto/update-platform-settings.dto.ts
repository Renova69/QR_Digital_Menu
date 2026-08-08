import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  IsObject,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdatePlatformSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  gdprEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  cookieBannerEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  privacyPolicyEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  termsEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  cookiePolicyEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  dpaEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  refundPolicyEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  msaEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  erasureEndpointEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  dataExportEndpointEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  retentionCronEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  analyticsCookieEnabled?: boolean;

  @ApiPropertyOptional({ minimum: 0, maximum: 50 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50)
  orderPiiRetentionYears?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 365 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  verificationTokenTtlDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  cookieBannerText?: Record<string, string>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  privacyPolicyContent?: Record<string, string>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  termsContent?: Record<string, string>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  cookiePolicyContent?: Record<string, string>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  dpaContent?: Record<string, string>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  refundPolicyContent?: Record<string, string>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  msaContent?: Record<string, string>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  dataControllerName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  dataControllerEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  dataControllerAddress?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  announcementBannerEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  announcementBannerText?: string;

  @ApiPropertyOptional({ enum: ['info', 'warning', 'maintenance'] })
  @IsOptional()
  @IsIn(['info', 'warning', 'maintenance'])
  announcementBannerType?: string;
}
