import { IsEmail, IsOptional, IsString, Matches } from 'class-validator';

/**
 * Exactly one of `email` / `phone` must be present — enforced in the service so
 * the "one identifier at a time" rule lives next to the logic that depends on
 * it rather than being split across two validation layers.
 */
export class AddIdentityDto {
  @IsOptional()
  @IsEmail({}, { message: 'A valid email address is required.' })
  email?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9\s\-()]{7,20}$/, {
    message: 'A valid phone number is required.',
  })
  phone?: string;
}

export class VerifyIdentityDto extends AddIdentityDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Enter the 6-digit code.' })
  code!: string;
}
