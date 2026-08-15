import { IsString, Length, Matches } from 'class-validator';
import { SLUG_MAX_LENGTH, SLUG_MIN_LENGTH, SLUG_PATTERN } from '../slug-rules';

export class UpdateSlugDto {
  @IsString()
  // Length is a separate constraint, not folded into the pattern: an earlier
  // single-regex form accepted the one-character slug "a".
  @Length(SLUG_MIN_LENGTH, SLUG_MAX_LENGTH)
  @Matches(SLUG_PATTERN, {
    message: 'slug must be lowercase letters, digits and inner hyphens only',
  })
  slug!: string;
}
