import { Exclude, Expose, Type } from 'class-transformer';

@Exclude()
export class WorkOrderStatusCountsDto {
  @Expose()
  pending: number;

  @Expose()
  inProgress: number;

  @Expose()
  done: number;

  @Expose()
  cancelled: number;
}

@Exclude()
export class PurchaseOrderStatusCountsDto {
  @Expose()
  draft: number;

  @Expose()
  ordered: number;

  @Expose()
  partiallyReceived: number;

  @Expose()
  received: number;

  @Expose()
  cancelled: number;
}

@Exclude()
export class DashboardSummaryResponseDto {
  @Expose()
  salesTodayCount: number;

  @Expose()
  salesMonthCount: number;

  @Expose()
  @Type(() => WorkOrderStatusCountsDto)
  workOrders: WorkOrderStatusCountsDto;

  @Expose()
  @Type(() => PurchaseOrderStatusCountsDto)
  purchaseOrders: PurchaseOrderStatusCountsDto;

  @Expose()
  notificationsUnread: number;

  @Expose()
  generatedAt: string;
}
