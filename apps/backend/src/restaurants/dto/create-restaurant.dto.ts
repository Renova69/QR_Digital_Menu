import { IsString, IsNotEmpty, IsOptional, IsUrl, IsHexColor, MaxLength, Matches } from 'class-validator';

export class CreateRestaurantDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  city?: string;

  @Matches(/^(?:\/(?!\/)[^\s]*|https?:\/\/[^\s]+)$/, {
    message: 'logoUrl must be a root-relative path or an http/https URL',
  })
  @MaxLength(2048)
  @IsOptional()
  logoUrl?: string;

  @IsHexColor()
  @IsOptional()
  accentColor?: string;

  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_valid_protocol: true })
  @IsOptional()
  googleReviewUrl?: string;

  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_valid_protocol: true })
  @IsOptional()
  facebookUrl?: string;

  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_valid_protocol: true })
  @IsOptional()
  instagramUrl?: string;

  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_valid_protocol: true })
  @IsOptional()
  tiktokUrl?: string;

  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_valid_protocol: true })
  @IsOptional()
  websiteUrl?: string;

  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_valid_protocol: true })
  @IsOptional()
  youtubeUrl?: string;

  @IsString()
  @IsOptional()
  dashboardLanguage?: string;
}
