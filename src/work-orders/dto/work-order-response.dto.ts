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
  @Type(() => String)
  @Transform(({ value }) => Number(value).toFixed(2))
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
  @Type(() => String)
  @Transform(({ value }) => Number(value).toFixed(2))
  unitPriceSnapshot: string;

  @Expose()
  @Type(() => String)
  @Transform(({ value }) => Number(value).toFixed(2))
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
export class WorkOrderProductItemResponseDto {
  @Expose()
  id: string;

  @Expose()
  code: string;

  @Expose()
  name: string;

  @Expose()
  description?: string | null;

  @Expose()
  @Type(() => String)
  @Transform(({ value }) => Number(value).toFixed(2))
  price: string;
}

@Exclude()
export class WorkOrderProductResponseDto {
  @Expose()
  id: string;

  @Expose()
  productId: string;

  @Expose()
  @Type(() => Number)
  quantity: number;

  @Expose()
  @Type(() => String)
  @Transform(({ value }) => Number(value).toFixed(2))
  unitPriceSnapshot: string;

  @Expose()
  @Type(() => String)
  @Transform(({ value }) => Number(value).toFixed(2))
  subtotal: string;

  @Expose()
  @Type(() => WorkOrderProductItemResponseDto)
  product: WorkOrderProductItemResponseDto;

  @Expose()
  @Type(() => Date)
  createdAt: Date;

  @Expose()
  @Type(() => Date)
  updatedAt: Date;
}

@Exclude()
export class EmployeeSummaryDto {
  @Expose()
  id: string;

  @Expose()
  name: string;
}

@Exclude()
export class BranchSummaryDto {
  @Expose()
  id: string;

  @Expose()
  name: string;
}

@Exclude()
export class ClientSummaryDto {
  @Expose()
  id: string;

  @Expose()
  name: string;
}

@Exclude()
export class VehicleSummaryDto {
  @Expose()
  id: string;

  @Expose()
  plate: string;

  @Expose()
  brand: string;

  @Expose()
  model: string;
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
  @Type(() => String)
  @Transform(({ value }) => Number(value).toFixed(2))
  totalAmount: string;

  @Expose()
  isActive: boolean;

  @Expose()
  @Type(() => EmployeeSummaryDto)
  employee: EmployeeSummaryDto | null;

  @Expose()
  @Type(() => BranchSummaryDto)
  branch: BranchSummaryDto | null;

  @Expose()
  @Type(() => ClientSummaryDto)
  client?: ClientSummaryDto;

  @Expose()
  @Type(() => VehicleSummaryDto)
  vehicle?: VehicleSummaryDto;

  @Expose()
  @Type(() => WorkOrderServiceResponseDto)
  services: WorkOrderServiceResponseDto[];

  @Expose()
  @Type(() => WorkOrderProductResponseDto)
  products: WorkOrderProductResponseDto[];

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
