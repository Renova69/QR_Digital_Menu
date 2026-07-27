import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ReopenSessionReconciliationDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
