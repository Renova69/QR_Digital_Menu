import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateStaffDto {
  @IsString()
  @IsIn(['STAFF', 'MANAGER', 'WAITER', 'KITCHEN'])
  @IsOptional()
  role?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
