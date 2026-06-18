import { IsString, Length, Matches, MinLength } from 'class-validator';

export class PinLoginDto {
  @IsString()
  restaurantId: string;

  @IsString()
  @MinLength(32)
  deviceToken: string;

  @IsString()
  @Length(4, 4)
  @Matches(/^\d{4}$/)
  pin: string;
}
