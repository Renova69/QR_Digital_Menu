import {
  IsString,
  IsEmail,
  IsOptional,
  IsIn,
  IsNotEmpty,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateStaffDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsIn(['STAFF', 'MANAGER', 'WAITER', 'KITCHEN'])
  role: string;
}
