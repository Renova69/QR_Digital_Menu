import {
  IsOptional,
  IsEnum,
  IsArray,
  IsDateString,
  IsString,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { OrderStatus } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class OrderQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  restaurantId?: string;

  @IsOptional()
  @IsArray()
  @IsEnum(OrderStatus, { each: true })
  @Transform(({ value }) =>
    Array.isArray(value)
      ? value.flatMap((entry) => String(entry).split(','))
      : value
        ? String(value).split(',')
        : undefined,
  )
  statuses?: OrderStatus[];

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
