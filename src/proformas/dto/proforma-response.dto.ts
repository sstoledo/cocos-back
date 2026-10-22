import { Exclude, Expose, Transform, Type } from 'class-transformer';

@Exclude()
export class ProformaProductItemResponseDto {
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
export class ProformaProductResponseDto {
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
  @Type(() => ProformaProductItemResponseDto)
  product: ProformaProductItemResponseDto;

  @Expose()
  @Type(() => Date)
  createdAt: Date;

  @Expose()
  @Type(() => Date)
  updatedAt: Date;
}

@Exclude()
export class NamedSummaryDto {
  @Expose()
  id: string;

  @Expose()
  name: string;
}

@Exclude()
export class ProformaResponseDto {
  @Expose()
  id: string;

  @Expose()
  proformaNumber: string;

  @Expose()
  clientId: string | null;

  @Expose()
  branchId: string | null;

  @Expose()
  employeeId: string | null;

  @Expose()
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'converted';

  @Expose()
  @Type(() => String)
  @Transform(({ value }) => Number(value).toFixed(2))
  totalAmount: string;

  @Expose()
  notes: string | null;

  @Expose()
  convertedSaleId: string | null;

  @Expose()
  isActive: boolean;

  @Expose()
  @Type(() => NamedSummaryDto)
  client: NamedSummaryDto | null;

  @Expose()
  @Type(() => NamedSummaryDto)
  branch: NamedSummaryDto | null;

  @Expose()
  @Type(() => NamedSummaryDto)
  employee: NamedSummaryDto | null;

  @Expose()
  @Type(() => ProformaProductResponseDto)
  products: ProformaProductResponseDto[];

  @Expose()
  @Type(() => Date)
  createdAt: Date;

  @Expose()
  @Type(() => Date)
  updatedAt: Date;
}
