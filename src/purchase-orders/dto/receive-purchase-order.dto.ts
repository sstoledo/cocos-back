import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumberString,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';

export class ReceivePurchaseOrderLineDto {
  @IsString()
  @IsNotEmpty()
  lineId: string;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  receivedQty: number;

  @IsDateString()
  expirationDate: string;

  // The pattern already rejects negative values; @Min does not apply to
  // string-typed properties (it only validates numbers).
  @IsNumberString()
  @Matches(/^\d+(\.\d{1,2})?$/)
  actualCostPrice: string;
}

export class ReceivePurchaseOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReceivePurchaseOrderLineDto)
  lines: ReceivePurchaseOrderLineDto[];
}
