import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateVisitFeedbackDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  invitationToken: string;

  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  comment?: string;
}
