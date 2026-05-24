import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateTableDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  zoneId?: string;
}
