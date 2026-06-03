import { PartialType } from '@nestjs/mapped-types';
import { IsIn, ValidateIf } from 'class-validator';
import { CreateCategoryDto } from './create-category.dto';

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {
  @ValidateIf((_, value) => value !== undefined)
  @IsIn([null])
  imageUrl?: null;

  @ValidateIf((_, value) => value !== undefined)
  @IsIn([null])
  thumbnailUrl?: null;
}
