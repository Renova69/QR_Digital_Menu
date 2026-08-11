import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { SUPPORTED_TARGET_LANGUAGE_CODES } from '../../restaurants/restaurant-languages';

export class UpdateItemTranslationDto {
  @IsString()
  @IsIn([...SUPPORTED_TARGET_LANGUAGE_CODES])
  locale!: string;

  /** null clears the override and hands the locale back to the pipeline. */
  @ValidateIf((_, value) => value !== null)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  value!: string | null;
}
