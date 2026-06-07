import { IsString, IsInt, IsOptional, Min, Max, IsBoolean } from 'class-validator';

export class UpdatePrintStationDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  printerIp?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  printerPort?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
