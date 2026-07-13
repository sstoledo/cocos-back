import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDate,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { CreateLotItemDto } from './create-lot-item.dto';

export class CreateLotDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  lotNumber: string;

  @IsString()
  @IsNotEmpty()
  supplierId: string;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  receivedAt?: Date;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ValidateNested({ each: true })
  @Type(() => CreateLotItemDto)
  @IsArray()
  @ArrayMinSize(1)
  items: CreateLotItemDto[];
}
