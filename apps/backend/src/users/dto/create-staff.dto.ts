import { IsString, IsEmail, IsOptional, IsIn } from 'class-validator';

export class CreateStaffDto {
  @IsString()
  name: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsIn(['MANAGER', 'WAITER', 'KITCHEN'])
  role: string;
}
