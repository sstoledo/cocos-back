import { ConsumptionEventType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';

export class CreateConsumptionEventDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsEnum(ConsumptionEventType)
  type: ConsumptionEventType;

  @IsOptional()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  quantity?: number;
}
