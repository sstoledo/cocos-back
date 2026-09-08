import { Exclude, Expose, Transform, Type } from 'class-transformer';

@Exclude()
export class SaleProductItemResponseDto {
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
}

@Exclude()
export class SaleProductResponseDto {
  @Expose()
  id: string;

  @Expose()
  productId: string;

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
  @Type(() => SaleProductItemResponseDto)
  product: SaleProductItemResponseDto;

  @Expose()
  @Type(() => Date)
  createdAt: Date;

  @Expose()
  @Type(() => Date)
  updatedAt: Date;
}

@Exclude()
export class SaleServiceItemResponseDto {
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
}

@Exclude()
export class SaleServiceResponseDto {
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
  @Type(() => SaleServiceItemResponseDto)
  service: SaleServiceItemResponseDto;

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
export class SaleResponseDto {
  @Expose()
  id: string;

  @Expose()
  saleNumber: string;

  @Expose()
  clientId: string | null;

  @Expose()
  branchId: string | null;

  @Expose()
  employeeId: string | null;

  @Expose()
  status: 'completed' | 'cancelled';

  @Expose()
  paymentMethod: 'cash' | 'card' | 'transfer';

  @Expose()
  @Transform(({ value }) => String(value))
  totalAmount: string;

  @Expose()
  isActive: boolean;

  @Expose()
  @Type(() => ClientSummaryDto)
  client: ClientSummaryDto | null;

  @Expose()
  @Type(() => BranchSummaryDto)
  branch: BranchSummaryDto | null;

  @Expose()
  @Type(() => EmployeeSummaryDto)
  employee: EmployeeSummaryDto | null;

  @Expose()
  @Type(() => SaleProductResponseDto)
  products: SaleProductResponseDto[];

  @Expose()
  @Type(() => SaleServiceResponseDto)
  services: SaleServiceResponseDto[];

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
