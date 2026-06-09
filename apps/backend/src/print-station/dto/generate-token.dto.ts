import { IsString, IsOptional } from 'class-validator';

export class GenerateTokenDto {
  @IsOptional()
  @IsString()
  label?: string;
}
