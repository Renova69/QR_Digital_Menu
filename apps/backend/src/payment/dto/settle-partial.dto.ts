import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum SplitMode {
  ITEM = 'ITEM',
  EVEN = 'EVEN',
  CUSTOM = 'CUSTOM',
}

// Only in-person POS providers use settlePartial. Online self-pay split uses
// checkout scope metadata on the provider payment instead.
export enum SplitProvider {
  CASH = 'CASH',
  MYPOS = 'MYPOS',
}

export class SettleAllocationDto {
  @IsString()
  @IsNotEmpty()
  orderItemId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;
}

export class SettlePartialDto {
  @IsString()
  @IsNotEmpty()
  restaurantId!: string;

  @IsEnum(SplitMode)
  mode!: SplitMode;

  @IsEnum(SplitProvider)
  provider!: SplitProvider;

  // ITEM mode: which order-item units this payment covers. Ignored for EVEN/CUSTOM.
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => SettleAllocationDto)
  allocations?: SettleAllocationDto[];

  // CUSTOM mode: the exact amount to settle. EVEN mode: derived from `splitCount`.
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount?: number;

  // EVEN mode: number of ways the remaining balance is divided; this payment
  // settles one share (remaining / splitCount).
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  splitCount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  tipPercent?: number;
}
