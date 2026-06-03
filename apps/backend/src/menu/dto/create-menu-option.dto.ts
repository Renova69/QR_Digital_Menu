import {
  IsString,
  IsEnum,
  IsJSON,
  IsNotEmpty,
  MaxLength,
} from 'class-validator';
import { OptionType } from '@prisma/client';

export class CreateMenuOptionDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(OptionType)
  @IsNotEmpty()
  type: OptionType;

  @IsJSON()
  @IsNotEmpty()
  @MaxLength(20000)
  choices: string;
}
