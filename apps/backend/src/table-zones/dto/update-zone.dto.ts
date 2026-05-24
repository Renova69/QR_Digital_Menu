import { IsString, IsOptional, IsNotEmpty, IsInt, Min } from 'class-validator';

export class UpdateZoneDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;
}
