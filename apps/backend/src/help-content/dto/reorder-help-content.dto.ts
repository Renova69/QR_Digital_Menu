import { Type } from 'class-transformer';
import { IsArray, IsString, IsInt, Min, ValidateNested } from 'class-validator';

class ReorderItem {
  @IsString()
  id: string;

  @IsInt()
  @Min(0)
  sortOrder: number;
}

export class ReorderHelpContentDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReorderItem)
  items: ReorderItem[];
}
