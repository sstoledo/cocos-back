import { PurchaseOrderStatus, WorkOrderStatus } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { DashboardService } from './dashboard.service';
import {
  DashboardSummaryResponseDto,
  PurchaseOrderStatusCountsDto,
  WorkOrderStatusCountsDto,
} from './dto/dashboard-summary.response.dto';

// Server-local window bounds for 2026-09-30 14:00 UTC. Built with the
// Date(y, m, d) constructor so the expectation holds in any TZ the suite runs in.
const START_OF_TODAY = new Date(2026, 8, 30);
const START_OF_MONTH = new Date(2026, 8, 1);

describe('DashboardService', () => {
  let service: DashboardService;
  let prisma: PrismaService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-30T14:00:00.000Z'));
    prisma = {
      sale: { count: jest.fn().mockResolvedValue(0) },
      workOrder: { groupBy: jest.fn().mockResolvedValue([]) },
      purchaseOrder: { groupBy: jest.fn().mockResolvedValue([]) },
      notification: { count: jest.fn().mockResolvedValue(0) },
    } as unknown as PrismaService;
    service = new DashboardService(prisma);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('summary', () => {
    it('returns the KPI shape with plain numbers and an ISO generatedAt', async () => {
      (prisma.sale.count as jest.Mock)
        .mockResolvedValueOnce(12)
        .mockResolvedValueOnce(87);
      (prisma.workOrder.groupBy as jest.Mock).mockResolvedValue([
        { status: WorkOrderStatus.pending, _count: { _all: 4 } },
        { status: WorkOrderStatus.in_progress, _count: { _all: 2 } },
        { status: WorkOrderStatus.done, _count: { _all: 6 } },
        { status: WorkOrderStatus.cancelled, _count: { _all: 1 } },
      ]);
      (prisma.purchaseOrder.groupBy as jest.Mock).mockResolvedValue([
        { status: PurchaseOrderStatus.draft, _count: { _all: 1 } },
        { status: PurchaseOrderStatus.ordered, _count: { _all: 3 } },
        {
          status: PurchaseOrderStatus.partially_received,
          _count: { _all: 2 },
        },
        { status: PurchaseOrderStatus.received, _count: { _all: 5 } },
        { status: PurchaseOrderStatus.cancelled, _count: { _all: 1 } },
      ]);
      (prisma.notification.count as jest.Mock).mockResolvedValue(3);

      const result = await service.summary('user-1');

      expect(result).toEqual({
        salesTodayCount: 12,
        salesMonthCount: 87,
        workOrders: {
          pending: 4,
          inProgress: 2,
          done: 6,
          cancelled: 1,
        },
        purchaseOrders: {
          draft: 1,
          ordered: 3,
          partiallyReceived: 2,
          received: 5,
          cancelled: 1,
        },
        notificationsUnread: 3,
        generatedAt: '2026-09-30T14:00:00.000Z',
      });
    });

    it('touches every KPI delegate so no metric is silently skipped', async () => {
      await service.summary('user-1');

      expect(prisma.sale.count).toHaveBeenCalledTimes(2);
      expect(prisma.workOrder.groupBy).toHaveBeenCalledTimes(1);
      expect(prisma.purchaseOrder.groupBy).toHaveBeenCalledTimes(1);
      expect(prisma.notification.count).toHaveBeenCalledTimes(1);
    });

    it('reports an ISO generatedAt taken from the server clock', async () => {
      const result = await service.summary('user-1');

      expect(result.generatedAt).toBe('2026-09-30T14:00:00.000Z');
    });

    it('returns the declared response DTO with nested bucket DTOs', async () => {
      const result = await service.summary('user-1');

      expect(result).toBeInstanceOf(DashboardSummaryResponseDto);
      expect(result.workOrders).toBeInstanceOf(WorkOrderStatusCountsDto);
      expect(result.purchaseOrders).toBeInstanceOf(
        PurchaseOrderStatusCountsDto
      );
    });
  });

  describe('sales windows', () => {
    it('counts completed active sales created since server-local start of today', async () => {
      await service.summary('user-1');

      expect(prisma.sale.count).toHaveBeenNthCalledWith(1, {
        where: {
          status: 'completed',
          isActive: true,
          createdAt: { gte: START_OF_TODAY },
        },
      });
    });

    it('counts completed active sales created since server-local start of month', async () => {
      await service.summary('user-1');

      expect(prisma.sale.count).toHaveBeenNthCalledWith(2, {
        where: {
          status: 'completed',
          isActive: true,
          createdAt: { gte: START_OF_MONTH },
        },
      });
    });

    it('uses two distinct windows in the middle of the month', async () => {
      await service.summary('user-1');

      const bounds = (prisma.sale.count as jest.Mock).mock.calls.map(
        ([args]) => args.where.createdAt.gte
      );
      expect(START_OF_TODAY).not.toEqual(START_OF_MONTH);
      expect(bounds).toEqual([START_OF_TODAY, START_OF_MONTH]);
    });

    it('rolls the month window over on the first day of the month', async () => {
      // Built with the local Date constructor so "00:30 on Oct 1" means
      // 00:30 *server-local* in whatever TZ the suite runs in.
      jest.setSystemTime(new Date(2026, 9, 1, 0, 30, 0));

      await service.summary('user-1');

      const startOfNewMonth = new Date(2026, 9, 1);
      expect(prisma.sale.count).toHaveBeenNthCalledWith(1, {
        where: {
          status: 'completed',
          isActive: true,
          createdAt: { gte: startOfNewMonth },
        },
      });
      expect(prisma.sale.count).toHaveBeenNthCalledWith(2, {
        where: {
          status: 'completed',
          isActive: true,
          createdAt: { gte: startOfNewMonth },
        },
      });
    });

    it('keeps today and month identical at 00:30 on the first of the month', async () => {
      jest.setSystemTime(new Date(2026, 9, 1, 0, 30, 0));

      await service.summary('user-1');

      const todayBound = (prisma.sale.count as jest.Mock).mock.calls[0][0].where
        .createdAt.gte;
      const monthBound = (prisma.sale.count as jest.Mock).mock.calls[1][0].where
        .createdAt.gte;
      expect(todayBound).toEqual(monthBound);
    });

    it('starts the month window on the 1st regardless of the day of the month', async () => {
      jest.setSystemTime(new Date(2026, 9, 28, 23, 59, 59));

      await service.summary('user-1');

      const todayBound = (prisma.sale.count as jest.Mock).mock.calls[0][0].where
        .createdAt.gte;
      const monthBound = (prisma.sale.count as jest.Mock).mock.calls[1][0].where
        .createdAt.gte;
      expect(todayBound).toEqual(new Date(2026, 9, 28));
      expect(monthBound).toEqual(new Date(2026, 9, 1));
    });
  });

  describe('workOrders buckets', () => {
    it('groups active work orders by status', async () => {
      await service.summary('user-1');

      expect(prisma.workOrder.groupBy).toHaveBeenCalledWith({
        by: ['status'],
        where: { isActive: true },
        _count: { _all: true },
      });
    });

    it('buckets every WorkOrderStatus member exactly once', async () => {
      const result = await service.summary('user-1');

      expect(Object.keys(result.workOrders).sort()).toEqual(
        Object.values(WorkOrderStatus)
          .map((status) =>
            status === WorkOrderStatus.in_progress ? 'inProgress' : status
          )
          .sort()
      );
      expect(result.workOrders).toEqual({
        pending: 0,
        inProgress: 0,
        done: 0,
        cancelled: 0,
      });
    });

    it('maps every enum member to a distinct camelCase key', async () => {
      (prisma.workOrder.groupBy as jest.Mock).mockResolvedValue([
        { status: WorkOrderStatus.pending, _count: { _all: 1 } },
        { status: WorkOrderStatus.in_progress, _count: { _all: 2 } },
        { status: WorkOrderStatus.done, _count: { _all: 3 } },
        { status: WorkOrderStatus.cancelled, _count: { _all: 4 } },
      ]);

      const result = await service.summary('user-1');

      expect(result.workOrders).toEqual({
        pending: 1,
        inProgress: 2,
        done: 3,
        cancelled: 4,
      });
    });

    it('reports 0 for a status with no rows', async () => {
      (prisma.workOrder.groupBy as jest.Mock).mockResolvedValue([
        { status: WorkOrderStatus.done, _count: { _all: 5 } },
      ]);

      const result = await service.summary('user-1');

      expect(result.workOrders).toEqual({
        pending: 0,
        inProgress: 0,
        done: 5,
        cancelled: 0,
      });
    });
  });

  describe('purchaseOrders buckets', () => {
    it('groups active purchase orders by status', async () => {
      await service.summary('user-1');

      expect(prisma.purchaseOrder.groupBy).toHaveBeenCalledWith({
        by: ['status'],
        where: { isActive: true },
        _count: { _all: true },
      });
    });

    it('buckets every PurchaseOrderStatus member exactly once', async () => {
      const result = await service.summary('user-1');

      expect(Object.keys(result.purchaseOrders).sort()).toEqual(
        Object.values(PurchaseOrderStatus)
          .map((status) =>
            status === PurchaseOrderStatus.partially_received
              ? 'partiallyReceived'
              : status
          )
          .sort()
      );
      expect(result.purchaseOrders).toEqual({
        draft: 0,
        ordered: 0,
        partiallyReceived: 0,
        received: 0,
        cancelled: 0,
      });
    });

    it('maps every enum member to a distinct camelCase key', async () => {
      (prisma.purchaseOrder.groupBy as jest.Mock).mockResolvedValue([
        { status: PurchaseOrderStatus.draft, _count: { _all: 1 } },
        { status: PurchaseOrderStatus.ordered, _count: { _all: 2 } },
        {
          status: PurchaseOrderStatus.partially_received,
          _count: { _all: 3 },
        },
        { status: PurchaseOrderStatus.received, _count: { _all: 4 } },
        { status: PurchaseOrderStatus.cancelled, _count: { _all: 5 } },
      ]);

      const result = await service.summary('user-1');

      expect(result.purchaseOrders).toEqual({
        draft: 1,
        ordered: 2,
        partiallyReceived: 3,
        received: 4,
        cancelled: 5,
      });
    });

    it('reports 0 for a status with no rows', async () => {
      (prisma.purchaseOrder.groupBy as jest.Mock).mockResolvedValue([
        { status: PurchaseOrderStatus.received, _count: { _all: 7 } },
      ]);

      const result = await service.summary('user-1');

      expect(result.purchaseOrders).toEqual({
        draft: 0,
        ordered: 0,
        partiallyReceived: 0,
        received: 7,
        cancelled: 0,
      });
    });
  });

  describe('notificationsUnread', () => {
    it("counts only the caller's own unread notifications", async () => {
      (prisma.notification.count as jest.Mock).mockResolvedValue(3);

      await service.summary('user-42');

      expect(prisma.notification.count).toHaveBeenCalledWith({
        where: { userId: 'user-42', readAt: null },
      });
    });
  });
});
