import {
  IsOptional,
  IsEnum,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsString,
  MaxLength,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
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

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([1, 7, 14, 30])
  period?: number;
}
