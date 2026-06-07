import { IsString, IsInt, IsOptional, Min, Max } from 'class-validator';

export class CreatePrintStationDto {
  @IsString()
  name: string;

  @IsString()
  printerIp: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  printerPort?: number;
}
