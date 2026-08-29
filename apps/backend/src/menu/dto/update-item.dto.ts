import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, ValidateIf } from 'class-validator';
import { CreateItemDto } from './create-item.dto';

export class UpdateItemDto extends PartialType(CreateItemDto) {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Set to null to clear the item image.',
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsIn([null])
  imageUrl?: null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Set to null to clear the item thumbnail.',
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsIn([null])
  thumbnailUrl?: null;

  @IsOptional()
  @IsBoolean()
  isOutOfStock?: boolean;
}
