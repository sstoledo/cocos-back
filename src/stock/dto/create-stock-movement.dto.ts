import { StockMovementType } from '@prisma/client';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  type ValidationOptions,
  registerDecorator,
} from 'class-validator';

function IsNonZeroInt(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isNonZeroInt',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return (
            typeof value === 'number' && Number.isInteger(value) && value !== 0
          );
        },
        defaultMessage() {
          return '$property must be a non-zero integer';
        },
      },
    });
  };
}

export class CreateStockMovementDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsEnum(StockMovementType)
  type: StockMovementType;

  @IsNonZeroInt()
  quantity: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
