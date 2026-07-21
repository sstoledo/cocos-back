import { WorkOrderStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class WorkOrderServiceLineDto {
  @IsUUID()
  @IsNotEmpty()
  serviceId: string;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  quantity: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Type(() => Number)
  unitPrice?: number;
}

export class CreateWorkOrderDto {
  @IsUUID()
  @IsNotEmpty()
  clientId: string;

  @IsUUID()
  @IsNotEmpty()
  vehicleId: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsEnum(WorkOrderStatus)
  status?: WorkOrderStatus;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => WorkOrderServiceLineDto)
  services: WorkOrderServiceLineDto[];
}
