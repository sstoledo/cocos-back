import { Exclude, Expose, Transform, Type } from 'class-transformer';

@Exclude()
export class WorkOrderServiceItemResponseDto {
  @Expose()
  id: string;

  @Expose()
  code: string;

  @Expose()
  name: string;

  @Expose()
  description?: string | null;

  @Expose()
  @Transform(({ value }) => String(value))
  price: string;

  @Expose()
  estimatedDuration?: number | null;
}

@Exclude()
export class WorkOrderServiceResponseDto {
  @Expose()
  id: string;

  @Expose()
  serviceId: string;

  @Expose()
  @Type(() => Number)
  quantity: number;

  @Expose()
  @Transform(({ value }) => String(value))
  unitPriceSnapshot: string;

  @Expose()
  @Transform(({ value }) => String(value))
  subtotal: string;

  @Expose()
  @Type(() => WorkOrderServiceItemResponseDto)
  service: WorkOrderServiceItemResponseDto;

  @Expose()
  @Type(() => Date)
  createdAt: Date;

  @Expose()
  @Type(() => Date)
  updatedAt: Date;
}

@Exclude()
export class WorkOrderResponseDto {
  @Expose()
  id: string;

  @Expose()
  orderNumber: string;

  @Expose()
  clientId: string;

  @Expose()
  vehicleId: string;

  @Expose()
  description?: string | null;

  @Expose()
  status: 'pending' | 'in_progress' | 'done' | 'cancelled';

  @Expose()
  @Transform(({ value }) => String(value))
  totalAmount: string;

  @Expose()
  isActive: boolean;

  @Expose()
  @Type(() => WorkOrderServiceResponseDto)
  services: WorkOrderServiceResponseDto[];

  @Expose()
  @Type(() => Date)
  createdAt: Date;

  @Expose()
  @Type(() => Date)
  updatedAt: Date;

  @Expose()
  @Type(() => Date)
  deletedAt?: Date | null;
}
