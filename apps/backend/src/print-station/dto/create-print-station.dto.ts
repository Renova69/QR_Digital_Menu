import { IsString, IsInt, IsOptional, Min, Max, IsIP } from 'class-validator';

export class CreatePrintStationDto {
  @IsString()
  name: string;

  @IsIP()
  printerIp: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  printerPort?: number;
}
