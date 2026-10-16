import { Exclude, Expose, Type } from 'class-transformer';

@Exclude()
export class ServiceProductResponseDto {
  @Expose()
  id: string;

  @Expose()
  serviceId: string;

  @Expose()
  productId: string;

  @Expose()
  quantity: number;

  @Expose()
  product: {
    id: string;
    code: string;
    name: string;
    consumptionType: 'direct' | 'partial';
  };

  @Expose()
  @Type(() => Date)
  createdAt: Date;

  @Expose()
  @Type(() => Date)
  updatedAt: Date;
}
