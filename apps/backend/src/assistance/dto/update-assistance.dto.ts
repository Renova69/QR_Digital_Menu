import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateAssistanceDto {
  @IsBoolean()
  @IsOptional()
  isResolved?: boolean;
}
