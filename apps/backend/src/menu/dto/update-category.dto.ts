import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsIn, ValidateIf } from 'class-validator';
import { CreateCategoryDto } from './create-category.dto';

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Set to null to clear the category image.',
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsIn([null])
  imageUrl?: null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Set to null to clear the category thumbnail.',
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsIn([null])
  thumbnailUrl?: null;
}
