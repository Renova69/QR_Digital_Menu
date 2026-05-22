import { IsString, IsIn, IsInt, IsBoolean, IsOptional, Min } from 'class-validator';

export class CreateHelpContentDto {
  @IsString()
  @IsIn(['landing', 'dashboard'])
  section: string;

  @IsString()
  categoryKey: string;

  @IsString()
  itemKey: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsString()
  @IsIn(['en', 'bg', 'ro'])
  locale: string;

  @IsString()
  title: string;

  @IsString()
  body: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
