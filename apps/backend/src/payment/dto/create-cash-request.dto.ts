import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

// Public "I'll pay cash" request body. `restaurantId` is re-checked against the
// session token in the service (findFirst on token + restaurantId + OPEN), and
// `orderIds`, when present, are validated against the session's orders. This DTO
// just enforces the shape at the boundary.
export class CreateCashRequestDto {
  @IsString()
  @IsNotEmpty()
  restaurantId!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  orderIds?: string[];
}
