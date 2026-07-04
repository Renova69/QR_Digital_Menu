import {
  IsString,
  IsOptional,
  IsNotEmpty,
  IsInt,
  IsIn,
  Min,
} from 'class-validator';
import { ZONE_CATALOG_KEYS } from '../zone-catalog';

export class UpdateZoneDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  // Preset catalog key (translatable). Null clears it (back to a custom zone).
  @IsOptional()
  @IsIn([...ZONE_CATALOG_KEYS, null] as readonly (string | null)[])
  zoneKey?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;
}
