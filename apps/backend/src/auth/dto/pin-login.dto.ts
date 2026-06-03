import { IsString, Length, MinLength } from 'class-validator';

export class PinLoginDto {
  @IsString()
  restaurantId: string;

  @IsString()
  @MinLength(32)
  deviceToken: string;

  @IsString()
  @Length(4, 4)
  pin: string;
}
