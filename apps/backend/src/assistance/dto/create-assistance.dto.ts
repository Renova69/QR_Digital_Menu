import { IsString, IsNotEmpty } from 'class-validator';

export class CreateAssistanceDto {
  @IsString()
  @IsNotEmpty()
  tableId: string;

  @IsString()
  @IsNotEmpty()
  restaurantId: string;
}
