import { Injectable } from '@nestjs/common';
import { PurchaseOrderStatus, WorkOrderStatus } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { PrismaService } from '../prisma/prisma.service';
import { DashboardSummaryResponseDto } from './dto/dashboard-summary.response.dto';
import type {
  PurchaseOrderStatusCountsDto,
  WorkOrderStatusCountsDto,
} from './dto/dashboard-summary.response.dto';

type StatusBuckets<TKey extends string> = Record<TKey, number>;

type WorkOrderKey = keyof WorkOrderStatusCountsDto;
type PurchaseOrderKey = keyof PurchaseOrderStatusCountsDto;

/**
 * Record<TStatus, TKey> is exhaustive by construction: adding a member to the
 * Prisma enum turns a missing bucket into a compile error, which is the only
 * guarantee that every status is bucketed exactly once.
 */
const WORK_ORDER_STATUS_KEYS: Record<WorkOrderStatus, WorkOrderKey> = {
  [WorkOrderStatus.pending]: 'pending',
  [WorkOrderStatus.in_progress]: 'inProgress',
  [WorkOrderStatus.done]: 'done',
  [WorkOrderStatus.cancelled]: 'cancelled',
};

const PURCHASE_ORDER_STATUS_KEYS: Record<
  PurchaseOrderStatus,
  PurchaseOrderKey
> = {
  [PurchaseOrderStatus.draft]: 'draft',
  [PurchaseOrderStatus.ordered]: 'ordered',
  [PurchaseOrderStatus.partially_received]: 'partiallyReceived',
  [PurchaseOrderStatus.received]: 'received',
  [PurchaseOrderStatus.cancelled]: 'cancelled',
};

function zeroBuckets<TStatus extends string, TKey extends string>(
  keys: Record<TStatus, TKey>
): StatusBuckets<TKey> {
  const buckets = {} as StatusBuckets<TKey>;
  for (const key of Object.values(keys)) {
    buckets[key as TKey] = 0;
  }
  return buckets;
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * B12 KPIs: counts only, no money, safe for every role. All reads run
   * concurrently against one snapshot of `now` so the two sales windows and
   * generatedAt can never straddle a day or month rollover.
   *
   * Date bounds are server-local (`new Date(y, m, d)`); the backend has no TZ
   * awareness yet — a shop-TZ config is the agreed follow-up.
   */
  async summary(userId: string): Promise<DashboardSummaryResponseDto> {
    const now = new Date();

    const [
      salesTodayCount,
      salesMonthCount,
      workOrderGroups,
      purchaseOrderGroups,
      notificationsUnread,
    ] = await Promise.all([
      this.prisma.sale.count({
        where: {
          status: 'completed',
          isActive: true,
          createdAt: { gte: startOfDay(now) },
        },
      }),
      this.prisma.sale.count({
        where: {
          status: 'completed',
          isActive: true,
          createdAt: { gte: startOfMonth(now) },
        },
      }),
      this.prisma.workOrder.groupBy({
        by: ['status'],
        where: { isActive: true },
        _count: { _all: true },
      }),
      this.prisma.purchaseOrder.groupBy({
        by: ['status'],
        where: { isActive: true },
        _count: { _all: true },
      }),
      this.prisma.notification.count({
        where: { userId, readAt: null },
      }),
    ]);

    return plainToInstance(
      DashboardSummaryResponseDto,
      {
        salesTodayCount,
        salesMonthCount,
        workOrders: this.toWorkOrderBuckets(workOrderGroups),
        purchaseOrders: this.toPurchaseOrderBuckets(purchaseOrderGroups),
        notificationsUnread,
        generatedAt: now.toISOString(),
      },
      { excludeExtraneousValues: true }
    );
  }

  private toWorkOrderBuckets(
    groups: Array<{ status: WorkOrderStatus; _count: { _all: number } }>
  ): WorkOrderStatusCountsDto {
    const buckets = zeroBuckets(WORK_ORDER_STATUS_KEYS);

    for (const group of groups) {
      buckets[WORK_ORDER_STATUS_KEYS[group.status]] = group._count._all;
    }

    return buckets;
  }

  private toPurchaseOrderBuckets(
    groups: Array<{
      status: PurchaseOrderStatus;
      _count: { _all: number };
    }>
  ): PurchaseOrderStatusCountsDto {
    const buckets = zeroBuckets(PURCHASE_ORDER_STATUS_KEYS);

    for (const group of groups) {
      buckets[PURCHASE_ORDER_STATUS_KEYS[group.status]] = group._count._all;
    }

    return buckets;
  }
}

function startOfDay(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function startOfMonth(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}
