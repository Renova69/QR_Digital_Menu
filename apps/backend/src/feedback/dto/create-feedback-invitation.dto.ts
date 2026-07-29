import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateFeedbackInvitationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  paymentId: string;
}
