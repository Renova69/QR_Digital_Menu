import { IsString, Length } from 'class-validator';

export class SetPinDto {
  @IsString()
  @Length(4, 4)
  pin: string;
}
