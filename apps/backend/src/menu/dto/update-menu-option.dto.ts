import { PartialType } from '@nestjs/mapped-types';
import { CreateMenuOptionDto } from './create-menu-option.dto';

export class UpdateMenuOptionDto extends PartialType(CreateMenuOptionDto) {}
