import { PaymentMethod } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class ConvertProformaDto {
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;
}
