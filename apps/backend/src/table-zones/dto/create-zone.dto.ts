import { IsString, IsNotEmpty, IsOptional, IsInt, Min } from 'class-validator';

export class CreateZoneDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;
}
