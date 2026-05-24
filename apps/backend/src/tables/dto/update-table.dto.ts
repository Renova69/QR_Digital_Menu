import { IsString, IsOptional, IsNotEmpty } from 'class-validator';

export class UpdateTableDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  zoneId?: string | null;
}
