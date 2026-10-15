import { Exclude, Expose, Transform, Type } from 'class-transformer';

@Exclude()
export class WorkOrderPaymentResponseDto {
  @Expose()
  id: string;

  @Expose()
  workOrderId: string;

  @Expose()
  @Type(() => String)
  @Transform(({ value }) => Number(value).toFixed(2))
  amount: string;

  @Expose()
  paymentMethod: 'cash' | 'card' | 'transfer';

  @Expose()
  note: string | null;

  @Expose()
  @Type(() => Date)
  paidAt: Date;

  @Expose()
  @Type(() => Date)
  createdAt: Date;

  @Expose()
  @Type(() => Date)
  updatedAt: Date;
}
