import { IsIn, IsOptional, IsString } from 'class-validator';

export class CreateDeviceEnrollmentDto {
  @IsOptional()
  @IsString()
  @IsIn(['STAFF_DEVICE'])
  mode?: 'STAFF_DEVICE';
}
