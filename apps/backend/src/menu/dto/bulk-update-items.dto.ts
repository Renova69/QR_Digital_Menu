import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsString,
  ValidateNested,
} from 'class-validator';
import { UpdateItemDto } from './update-item.dto';

export class BulkItemUpdateDto extends UpdateItemDto {
  @IsString()
  @IsNotEmpty()
  id: string;
}

// Caps a single bulk-save round trip — each row fans out through the same
// per-item update path (translation-cache purge, image cleanup, DeepL
// prewarm), so an unbounded array could multiply that cost hundreds of times
// over in one request.
const MAX_BULK_ITEMS = 200;

export class BulkUpdateItemsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_BULK_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => BulkItemUpdateDto)
  updates: BulkItemUpdateDto[];
}
