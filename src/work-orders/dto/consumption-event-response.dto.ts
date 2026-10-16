import { Exclude, Expose, Type } from 'class-transformer';

@Exclude()
export class ConsumptionEventResponseDto {
  @Expose()
  id: string;

  @Expose()
  workOrderId: string;

  @Expose()
  productId: string;

  @Expose()
  product: {
    id: string;
    code: string;
    name: string;
    consumptionType: 'direct' | 'partial';
  };

  @Expose()
  type: 'used' | 'opened' | 'depleted';

  @Expose()
  quantity: number | null;

  @Expose()
  registeredById: string;

  @Expose()
  registeredBy: { id: string; name: string };

  @Expose()
  @Type(() => Date)
  createdAt: Date;
}
