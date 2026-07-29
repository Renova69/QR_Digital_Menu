import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsString,
  MaxLength,
} from 'class-validator';
import { OrderStatus } from '@prisma/client';

export const MAX_BULK_ORDER_STATUS_UPDATES = 100;

export class BulkUpdateOrderStatusDto {
  @IsString()
  @MaxLength(64)
  restaurantId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_BULK_ORDER_STATUS_UPDATES)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  orderIds: string[];

  @IsEnum(OrderStatus)
  fromStatus: OrderStatus;

  @IsEnum(OrderStatus)
  status: OrderStatus;
}
