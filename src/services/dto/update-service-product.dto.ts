import { Type } from 'class-transformer';
import { IsInt, IsPositive } from 'class-validator';

export class UpdateServiceProductDto {
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  quantity: number;
}
