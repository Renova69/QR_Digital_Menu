import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  IsIn,
  Min,
} from 'class-validator';
import { ZONE_CATALOG_KEYS } from '../zone-catalog';

export class CreateZoneDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  // Preset catalog key (translatable). Omit / null for a fully custom zone.
  @IsOptional()
  @IsIn(ZONE_CATALOG_KEYS as readonly string[])
  zoneKey?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;
}
