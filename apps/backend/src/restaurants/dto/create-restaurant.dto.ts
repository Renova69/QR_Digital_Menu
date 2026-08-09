import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUrl,
  IsHexColor,
  IsIn,
} from 'class-validator';
import { SUPPORTED_TARGET_LANGUAGE_CODES } from '../restaurant-languages';

export class CreateRestaurantDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    require_valid_protocol: true,
  })
  @IsOptional()
  logoUrl?: string;

  @IsHexColor()
  @IsOptional()
  accentColor?: string;

  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    require_valid_protocol: true,
  })
  @IsOptional()
  googleReviewUrl?: string;

  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    require_valid_protocol: true,
  })
  @IsOptional()
  facebookUrl?: string;

  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    require_valid_protocol: true,
  })
  @IsOptional()
  instagramUrl?: string;

  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    require_valid_protocol: true,
  })
  @IsOptional()
  tiktokUrl?: string;

  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    require_valid_protocol: true,
  })
  @IsOptional()
  websiteUrl?: string;

  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    require_valid_protocol: true,
  })
  @IsOptional()
  youtubeUrl?: string;

  @IsString()
  @IsOptional()
  country?: string;

  @IsString()
  @IsOptional()
  dashboardLanguage?: string;

  @IsString()
  @IsIn([...SUPPORTED_TARGET_LANGUAGE_CODES])
  @IsOptional()
  menuSourceLanguage?: string;
}
