import { PartialType } from '@nestjs/mapped-types';
import { IsIn, ValidateIf } from 'class-validator';
import { CreateItemDto } from './create-item.dto';

export class UpdateItemDto extends PartialType(CreateItemDto) {
  @ValidateIf((_, value) => value !== undefined)
  @IsIn([null])
  imageUrl?: null;

  @ValidateIf((_, value) => value !== undefined)
  @IsIn([null])
  thumbnailUrl?: null;
}
