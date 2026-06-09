import { IsString, IsInt, IsOptional, Min, Max, IsBoolean, IsIP } from 'class-validator';

export class UpdatePrintStationDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIP()
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
