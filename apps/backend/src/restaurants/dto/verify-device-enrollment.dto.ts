import { IsString, MinLength } from 'class-validator';

export class VerifyDeviceEnrollmentDto {
  @IsString()
  @MinLength(32)
  token: string;
}
