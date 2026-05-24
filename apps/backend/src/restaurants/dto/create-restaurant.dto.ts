import { IsString, IsNotEmpty, IsOptional, IsUrl } from 'class-validator';

export class CreateRestaurantDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  logoUrl?: string;

  @IsString()
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

  @IsString()
  @IsOptional()
  dashboardLanguage?: string;
}
