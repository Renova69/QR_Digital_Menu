import { IsString, Matches } from 'class-validator';

export class ReleaseSlugDto {
  @IsString()
  slug!: string;

  // Server-enforced CONFIRM, matching this codebase's dangerous-action
  // pattern (see super-admin/dto/update-tenant.dto.ts). A frontend-only
  // confirmation dialog is not acceptable here.
  @IsString()
  @Matches(/^CONFIRM$/, { message: 'confirmation must be exactly CONFIRM' })
  confirmation!: string;
}
