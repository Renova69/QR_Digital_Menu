import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class FeedbackInvitationTokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  invitationToken: string;
}
