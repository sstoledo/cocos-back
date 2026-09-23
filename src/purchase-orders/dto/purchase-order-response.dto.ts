import { Exclude, Expose, Transform, Type } from 'class-transformer';

@Exclude()
export class PurchaseOrderSupplierResponseDto {
  @Expose()
  id: string;

  @Expose()
  name: string;
}

@Exclude()
export class PurchaseOrderLineProductResponseDto {
  @Expose()
  id: string;

  @Expose()
  code: string;

  @Expose()
  name: string;
}

@Exclude()
export class PurchaseOrderLineResponseDto {
  @Expose()
  id: string;

  @Expose()
  productId: string;

  @Expose()
  @Type(() => Number)
  quantityOrdered: number;

  @Expose()
  @Type(() => Number)
  quantityReceived: number;

  @Expose()
  @Transform(({ value }) => String(value))
  estimatedCostPrice: string;

  @Expose()
  @Type(() => PurchaseOrderLineProductResponseDto)
  product: PurchaseOrderLineProductResponseDto;
}

@Exclude()
export class PurchaseOrderReceiptItemResponseDto {
  @Expose()
  productId: string;

  @Expose()
  @Type(() => Number)
  quantity: number;

  @Expose()
  @Transform(({ value }) => String(value))
  costPrice: string;

  @Expose()
  @Type(() => Date)
  expirationDate: Date;
}

@Exclude()
export class PurchaseOrderReceiptResponseDto {
  @Expose()
  lotId: string;

  @Expose()
  lotNumber: string;

  @Expose()
  @Type(() => Date)
  receivedAt: Date;

  @Expose()
  @Type(() => PurchaseOrderReceiptItemResponseDto)
  items: PurchaseOrderReceiptItemResponseDto[];
}

@Exclude()
export class PurchaseOrderResponseDto {
  @Expose()
  id: string;

  @Expose()
  purchaseOrderNumber: string;

  @Expose()
  supplierId: string;

  @Expose()
  status: 'draft' | 'ordered' | 'partially_received' | 'received' | 'cancelled';

  @Expose()
  notes?: string | null;

  @Expose()
  @Transform(({ value }) => String(value))
  estimatedTotal: string;

  @Expose()
  @Type(() => PurchaseOrderSupplierResponseDto)
  supplier: PurchaseOrderSupplierResponseDto;

  @Expose()
  @Type(() => PurchaseOrderLineResponseDto)
  lines: PurchaseOrderLineResponseDto[];

  @Expose()
  @Type(() => PurchaseOrderReceiptResponseDto)
  receipts?: PurchaseOrderReceiptResponseDto[];

  @Expose()
  lotIds?: string[];

  @Expose()
  @Type(() => Date)
  createdAt: Date;

  @Expose()
  @Type(() => Date)
  updatedAt: Date;
}
