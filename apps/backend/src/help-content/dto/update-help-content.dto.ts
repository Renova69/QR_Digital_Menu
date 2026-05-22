import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateHelpContentDto } from './create-help-content.dto';

export class UpdateHelpContentDto extends PartialType(
  OmitType(CreateHelpContentDto, ['section', 'categoryKey', 'itemKey', 'locale'] as const),
) {}
