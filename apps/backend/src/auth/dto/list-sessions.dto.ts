import { IsOptional, IsUUID } from 'class-validator';

export class ListSessionsDto {
  @IsOptional()
  @IsUUID()
  cursor?: string;
}
