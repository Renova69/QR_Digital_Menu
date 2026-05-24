import { IsArray, ValidateNested, IsString, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

class ZoneOrderItem {
  @IsString()
  id: string;

  @IsInt()
  @Min(0)
  displayOrder: number;
}

export class ReorderZonesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ZoneOrderItem)
  items: ZoneOrderItem[];
}
