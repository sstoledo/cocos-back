import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { CreateLotItemDto } from '../../lots/dto/create-lot-item.dto';

export class ConfirmLotDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  lotNumber?: string;

  @IsString()
  @IsNotEmpty()
  supplierId: string;

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
