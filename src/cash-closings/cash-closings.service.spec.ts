import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { CashClosingsService } from './cash-closings.service';
import type { CreateCashClosingDto } from './dto/create-cash-closing.dto';

const NOW = new Date('2026-10-02T14:00:00.000Z');
const LAST_PERIOD_END = new Date('2026-09-30T22:00:00.000Z');
const EARLIEST_SALE_AT = new Date('2026-09-15T10:30:00.000Z');

const CLOSING_RECORD = {
  id: 'closing-1',
  periodStart: LAST_PERIOD_END,
  periodEnd: NOW,
  expectedCash: new Prisma.Decimal('250.50'),
  expectedCard: new Prisma.Decimal('100'),
  expectedTransfer: new Prisma.Decimal('0'),
  declaredCash: new Prisma.Decimal('300.75'),
  difference: new Prisma.Decimal('50.25'),
  salesCount: 5,
  workOrderPaymentsCash: new Prisma.Decimal('0'),
  workOrderPaymentsCard: new Prisma.Decimal('0'),
  workOrderPaymentsTransfer: new Prisma.Decimal('0'),
  workOrderPaymentsCount: 0,
  notes: 'Cierre turno tarde',
  createdAt: NOW,
  closedBy: { id: 'user-1', name: 'Ada Admin' },
};

const CLOSING_RESPONSE = {
  id: 'closing-1',
  periodStart: LAST_PERIOD_END,
  periodEnd: NOW,
  expectedCash: '250.50',
  expectedCard: '100.00',
  expectedTransfer: '0.00',
  declaredCash: '300.75',
  difference: '50.25',
  salesCount: 5,
  workOrderPaymentsCash: '0.00',
  workOrderPaymentsCard: '0.00',
  workOrderPaymentsTransfer: '0.00',
  workOrderPaymentsCount: 0,
  notes: 'Cierre turno tarde',
  createdAt: NOW,
  closedBy: { id: 'user-1', name: 'Ada Admin' },
};

const createPrismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('unique constraint', {
    code,
    clientVersion: '6.0.0',
  });

describe('CashClosingsService', () => {
  let service: CashClosingsService;
  let prisma: PrismaService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    prisma = {
      cashClosing: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
      },
      sale: {
        findFirst: jest.fn(),
        groupBy: jest.fn(),
        count: jest.fn(),
      },
      workOrder: {
        count: jest.fn(),
        findFirst: jest.fn(),
      },
      workOrderPayment: {
        groupBy: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
      },
      $transaction: jest.fn(),
    } as unknown as PrismaService;
    (prisma.workOrderPayment.groupBy as jest.Mock).mockResolvedValue([]);
    (prisma.workOrderPayment.count as jest.Mock).mockResolvedValue(0);
    (prisma.workOrderPayment.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.$transaction as jest.Mock).mockImplementation(
      (callback: (tx: unknown) => unknown) => callback(prisma)
    );
    (prisma.cashClosing.create as jest.Mock).mockImplementation(
      (args: { data: Record<string, unknown> }) => ({
        id: 'closing-1',
        ...args.data,
        createdAt: NOW,
        closedBy: { id: 'user-1', name: 'Ada Admin' },
      })
    );
    service = new CashClosingsService(prisma);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('preview', () => {
    it('aggregates only completed active sales of the open period (SAL-NF4)', async () => {
      (prisma.cashClosing.findFirst as jest.Mock).mockResolvedValue({
        periodEnd: LAST_PERIOD_END,
      });
      (prisma.sale.groupBy as jest.Mock).mockResolvedValue([]);
      (prisma.sale.count as jest.Mock).mockResolvedValue(0);

      await service.preview('user-1');

      const where = {
        status: 'completed',
        isActive: true,
        createdAt: { gte: LAST_PERIOD_END, lt: NOW },
      };
      expect(prisma.sale.groupBy).toHaveBeenCalledWith({
        by: ['paymentMethod'],
        where,
        _sum: { totalAmount: true },
      });
      expect(prisma.sale.count).toHaveBeenCalledWith({ where });
    });

    it('uses the last closing periodEnd as periodStart', async () => {
      (prisma.cashClosing.findFirst as jest.Mock).mockResolvedValue({
        periodEnd: LAST_PERIOD_END,
      });
      (prisma.sale.groupBy as jest.Mock).mockResolvedValue([]);
      (prisma.sale.count as jest.Mock).mockResolvedValue(0);

      const result = await service.preview('user-1');

      expect(prisma.cashClosing.findFirst).toHaveBeenCalledWith({
        orderBy: { periodEnd: 'desc' },
      });
      expect(prisma.sale.findFirst).not.toHaveBeenCalled();
      expect(result.periodStart).toEqual(LAST_PERIOD_END);
    });

    it('uses the earliest completed active sale when no closing exists', async () => {
      (prisma.cashClosing.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.sale.findFirst as jest.Mock).mockResolvedValue({
        createdAt: EARLIEST_SALE_AT,
      });
      (prisma.sale.groupBy as jest.Mock).mockResolvedValue([]);
      (prisma.sale.count as jest.Mock).mockResolvedValue(1);

      const result = await service.preview('user-1');

      expect(prisma.sale.findFirst).toHaveBeenCalledWith({
        where: { status: 'completed', isActive: true },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      });
      expect(result.periodStart).toEqual(EARLIEST_SALE_AT);
    });

    it('returns a null periodStart when there are no closings and no sales', async () => {
      (prisma.cashClosing.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.sale.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.sale.groupBy as jest.Mock).mockResolvedValue([]);
      (prisma.sale.count as jest.Mock).mockResolvedValue(0);

      const result = await service.preview('user-1');

      expect(result).toEqual({
        periodStart: null,
        expectedCash: '0.00',
        expectedCard: '0.00',
        expectedTransfer: '0.00',
        salesCount: 0,
        workOrderPaymentsCash: '0.00',
        workOrderPaymentsCard: '0.00',
        workOrderPaymentsTransfer: '0.00',
        workOrderPaymentsCount: 0,
      });
    });

    it('zero-fills payment methods without sales in the period', async () => {
      (prisma.cashClosing.findFirst as jest.Mock).mockResolvedValue({
        periodEnd: LAST_PERIOD_END,
      });
      (prisma.sale.groupBy as jest.Mock).mockResolvedValue([
        {
          paymentMethod: 'cash',
          _sum: { totalAmount: new Prisma.Decimal('250.50') },
        },
      ]);
      (prisma.sale.count as jest.Mock).mockResolvedValue(3);

      const result = await service.preview('user-1');

      expect(result).toEqual({
        periodStart: LAST_PERIOD_END,
        expectedCash: '250.50',
        expectedCard: '0.00',
        expectedTransfer: '0.00',
        salesCount: 3,
        workOrderPaymentsCash: '0.00',
        workOrderPaymentsCard: '0.00',
        workOrderPaymentsTransfer: '0.00',
        workOrderPaymentsCount: 0,
      });
    });

    it('formats expected totals as two-decimal strings without floats', async () => {
      (prisma.cashClosing.findFirst as jest.Mock).mockResolvedValue({
        periodEnd: LAST_PERIOD_END,
      });
      (prisma.sale.groupBy as jest.Mock).mockResolvedValue([
        {
          paymentMethod: 'cash',
          _sum: { totalAmount: new Prisma.Decimal('100.1') },
        },
        {
          paymentMethod: 'card',
          _sum: { totalAmount: new Prisma.Decimal('0.1') },
        },
        {
          paymentMethod: 'transfer',
          _sum: { totalAmount: new Prisma.Decimal('0.2') },
        },
      ]);
      (prisma.sale.count as jest.Mock).mockResolvedValue(3);

      const result = await service.preview('user-1');

      expect(result.expectedCash).toBe('100.10');
      expect(result.expectedCard).toBe('0.10');
      expect(result.expectedTransfer).toBe('0.20');
    });

    it('aggregates work order payments by paidAt, broken down per method', async () => {
      (prisma.cashClosing.findFirst as jest.Mock).mockResolvedValue({
        periodEnd: LAST_PERIOD_END,
      });
      (prisma.sale.groupBy as jest.Mock).mockResolvedValue([
        {
          paymentMethod: 'cash',
          _sum: { totalAmount: new Prisma.Decimal('100.00') },
        },
      ]);
      (prisma.sale.count as jest.Mock).mockResolvedValue(1);
      (prisma.workOrderPayment.groupBy as jest.Mock).mockResolvedValue([
        {
          paymentMethod: 'cash',
          _sum: { amount: new Prisma.Decimal('40.00') },
        },
        {
          paymentMethod: 'transfer',
          _sum: { amount: new Prisma.Decimal('60.00') },
        },
      ]);
      (prisma.workOrderPayment.count as jest.Mock).mockResolvedValue(2);

      const result = await service.preview('user-1');

      const paymentWhere = {
        paidAt: { gte: LAST_PERIOD_END, lt: NOW },
        workOrder: { isActive: true },
      };
      expect(prisma.workOrderPayment.groupBy).toHaveBeenCalledWith({
        by: ['paymentMethod'],
        where: paymentWhere,
        _sum: { amount: true },
      });
      expect(prisma.workOrderPayment.count).toHaveBeenCalledWith({
        where: paymentWhere,
      });
      // expectedCash combines sale cash (100) + WO payment cash (40).
      expect(result.expectedCash).toBe('140.00');
      expect(result.expectedCard).toBe('0.00');
      expect(result.expectedTransfer).toBe('60.00');
      expect(result.workOrderPaymentsCash).toBe('40.00');
      expect(result.workOrderPaymentsCard).toBe('0.00');
      expect(result.workOrderPaymentsTransfer).toBe('60.00');
      expect(result.workOrderPaymentsCount).toBe(2);
    });

    it('persists nothing', async () => {
      (prisma.cashClosing.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.sale.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.sale.groupBy as jest.Mock).mockResolvedValue([]);
      (prisma.sale.count as jest.Mock).mockResolvedValue(0);

      await service.preview('user-1');

      expect(prisma.cashClosing.create).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('close', () => {
    const dto: CreateCashClosingDto = {
      declaredCash: '300.75',
      notes: 'Cierre turno tarde',
    };

    beforeEach(() => {
      (prisma.cashClosing.findFirst as jest.Mock).mockResolvedValue({
        periodEnd: LAST_PERIOD_END,
      });
      (prisma.sale.groupBy as jest.Mock).mockResolvedValue([
        {
          paymentMethod: 'cash',
          _sum: { totalAmount: new Prisma.Decimal('250.50') },
        },
        {
          paymentMethod: 'card',
          _sum: { totalAmount: new Prisma.Decimal('100') },
        },
      ]);
      (prisma.sale.count as jest.Mock).mockResolvedValue(5);
      (prisma.workOrder.count as jest.Mock).mockResolvedValue(0);
    });

    it('persists the snapshot inside a transaction with the period bounds', async () => {
      await service.close('user-1', dto);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.sale.groupBy).toHaveBeenCalledWith({
        by: ['paymentMethod'],
        where: {
          status: 'completed',
          isActive: true,
          createdAt: { gte: LAST_PERIOD_END, lt: NOW },
        },
        _sum: { totalAmount: true },
      });

      const createArgs = (prisma.cashClosing.create as jest.Mock).mock
        .calls[0][0];
      expect(createArgs.data.periodStart).toEqual(LAST_PERIOD_END);
      expect(createArgs.data.periodEnd).toEqual(NOW);
      expect(createArgs.data.expectedCash.toFixed(2)).toBe('250.50');
      expect(createArgs.data.expectedCard.toFixed(2)).toBe('100.00');
      expect(createArgs.data.expectedTransfer.toFixed(2)).toBe('0.00');
      expect(createArgs.data.declaredCash.toFixed(2)).toBe('300.75');
      expect(createArgs.data.salesCount).toBe(5);
      expect(createArgs.data.notes).toBe('Cierre turno tarde');
      expect(createArgs.data.closedById).toBe('user-1');
      expect(createArgs.include).toEqual({
        closedBy: { select: { id: true, name: true } },
      });
    });

    it('returns the response DTO with decimals as strings and closedBy summary', async () => {
      const result = await service.close('user-1', dto);

      expect(result).toEqual({
        id: 'closing-1',
        periodStart: LAST_PERIOD_END,
        periodEnd: NOW,
        expectedCash: '250.50',
        expectedCard: '100.00',
        expectedTransfer: '0.00',
        declaredCash: '300.75',
        difference: '50.25',
        salesCount: 5,
        workOrderPaymentsCash: '0.00',
        workOrderPaymentsCard: '0.00',
        workOrderPaymentsTransfer: '0.00',
        workOrderPaymentsCount: 0,
        notes: 'Cierre turno tarde',
        createdAt: NOW,
        closedBy: { id: 'user-1', name: 'Ada Admin' },
      });
    });

    it('records a negative difference when declared cash is short', async () => {
      const result = await service.close('user-1', { declaredCash: '200' });

      expect(result.difference).toBe('-50.50');
      const createData = (prisma.cashClosing.create as jest.Mock).mock
        .calls[0][0].data;
      expect(createData.difference.toFixed(2)).toBe('-50.50');
    });

    it('records a zero difference when declared cash matches exactly', async () => {
      const result = await service.close('user-1', { declaredCash: '250.50' });

      expect(result.difference).toBe('0.00');
    });

    it('computes the difference with decimal arithmetic, not floats', async () => {
      (prisma.sale.groupBy as jest.Mock).mockResolvedValue([
        {
          paymentMethod: 'cash',
          _sum: { totalAmount: new Prisma.Decimal('0.1') },
        },
      ]);
      (prisma.sale.count as jest.Mock).mockResolvedValue(1);

      const result = await service.close('user-1', { declaredCash: '0.3' });

      // 0.3 - 0.1 is 0.19999999999999998 in IEEE 754 — must be exactly 0.20.
      expect(result.difference).toBe('0.20');
    });

    it('defaults notes to null when omitted', async () => {
      await service.close('user-1', { declaredCash: '250.50' });

      const createData = (prisma.cashClosing.create as jest.Mock).mock
        .calls[0][0].data;
      expect(createData.notes).toBeNull();
    });

    it('throws 400 CLOSING_NO_ACTIVITY when the open period has no activity', async () => {
      (prisma.cashClosing.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.sale.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.sale.groupBy as jest.Mock).mockResolvedValue([]);
      (prisma.sale.count as jest.Mock).mockResolvedValue(0);
      (prisma.workOrder.count as jest.Mock).mockResolvedValue(0);

      const error = await service
        .close('user-1', { declaredCash: '15' })
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        message: 'No activity in the open period',
        errorCode: 'CLOSING_NO_ACTIVITY',
      });
      expect(prisma.cashClosing.create).not.toHaveBeenCalled();
    });

    it('closes with no sales when done work orders exist in the period', async () => {
      const doneWorkOrderAt = new Date('2026-01-03T09:00:00.000Z');
      (prisma.cashClosing.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.sale.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.sale.groupBy as jest.Mock).mockResolvedValue([]);
      (prisma.sale.count as jest.Mock).mockResolvedValue(0);
      (prisma.workOrder.count as jest.Mock).mockResolvedValue(2);
      (prisma.workOrder.findFirst as jest.Mock).mockResolvedValue({
        updatedAt: doneWorkOrderAt,
      });

      const result = await service.close('user-1', { declaredCash: '15' });

      expect(result.salesCount).toBe(0);
      expect(result.expectedCash).toBe('0.00');
      expect(prisma.cashClosing.create).toHaveBeenCalledTimes(1);
      // Anchors to the earliest done work order, never to `now`: anchoring
      // to now would make periodStart == periodEnd and permanently brick
      // the next closing via the @@unique([periodStart]) collision.
      expect(prisma.cashClosing.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ periodStart: doneWorkOrderAt }),
        })
      );
    });

    it('counts only done active work orders completed inside the period', async () => {
      await service.close('user-1', dto);

      expect(prisma.workOrder.count).toHaveBeenCalledWith({
        where: {
          status: 'done',
          isActive: true,
          updatedAt: { gte: LAST_PERIOD_END, lt: NOW },
        },
      });
    });

    it('rejects when only cancelled work orders exist (they are not activity)', async () => {
      (prisma.sale.groupBy as jest.Mock).mockResolvedValue([]);
      (prisma.sale.count as jest.Mock).mockResolvedValue(0);
      // The done-status filter excludes cancelled orders, so the count is 0.
      (prisma.workOrder.count as jest.Mock).mockResolvedValue(0);

      const error = await service
        .close('user-1', dto)
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        errorCode: 'CLOSING_NO_ACTIVITY',
      });
      expect(prisma.cashClosing.create).not.toHaveBeenCalled();
    });

    it('starts the first closing at the earliest completed sale', async () => {
      (prisma.cashClosing.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.sale.findFirst as jest.Mock).mockResolvedValue({
        createdAt: EARLIEST_SALE_AT,
      });

      await service.close('user-1', dto);

      const createData = (prisma.cashClosing.create as jest.Mock).mock
        .calls[0][0].data;
      expect(createData.periodStart).toEqual(EARLIEST_SALE_AT);
      expect(prisma.sale.groupBy).toHaveBeenCalledWith({
        by: ['paymentMethod'],
        where: {
          status: 'completed',
          isActive: true,
          createdAt: { gte: EARLIEST_SALE_AT, lt: NOW },
        },
        _sum: { totalAmount: true },
      });
    });

    it('persists the work order payment breakdown in the snapshot', async () => {
      (prisma.workOrderPayment.groupBy as jest.Mock).mockResolvedValue([
        {
          paymentMethod: 'cash',
          _sum: { amount: new Prisma.Decimal('75.25') },
        },
      ]);
      (prisma.workOrderPayment.count as jest.Mock).mockResolvedValue(1);

      await service.close('user-1', dto);

      const createData = (prisma.cashClosing.create as jest.Mock).mock
        .calls[0][0].data;
      // 250.50 sale cash + 75.25 WO payment cash.
      expect(createData.expectedCash.toFixed(2)).toBe('325.75');
      expect(createData.workOrderPaymentsCash.toFixed(2)).toBe('75.25');
      expect(createData.workOrderPaymentsCard.toFixed(2)).toBe('0.00');
      expect(createData.workOrderPaymentsTransfer.toFixed(2)).toBe('0.00');
      expect(createData.workOrderPaymentsCount).toBe(1);
    });

    it('closes with no sales when work order payments exist in the period', async () => {
      const paymentAt = new Date('2026-01-04T09:00:00.000Z');
      (prisma.cashClosing.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.sale.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.sale.groupBy as jest.Mock).mockResolvedValue([]);
      (prisma.sale.count as jest.Mock).mockResolvedValue(0);
      (prisma.workOrder.count as jest.Mock).mockResolvedValue(0);
      (prisma.workOrder.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.workOrderPayment.findFirst as jest.Mock).mockResolvedValue({
        paidAt: paymentAt,
      });
      (prisma.workOrderPayment.groupBy as jest.Mock).mockResolvedValue([
        {
          paymentMethod: 'cash',
          _sum: { amount: new Prisma.Decimal('80.00') },
        },
      ]);
      (prisma.workOrderPayment.count as jest.Mock).mockResolvedValue(1);

      const result = await service.close('user-1', { declaredCash: '80' });

      // Payments are activity: CLOSING_NO_ACTIVITY must not fire.
      expect(prisma.cashClosing.create).toHaveBeenCalledTimes(1);
      expect(result.expectedCash).toBe('80.00');
      expect(result.workOrderPaymentsCount).toBe(1);
      // First-ever closing anchors to the earliest payment.
      expect(prisma.cashClosing.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ periodStart: paymentAt }),
        })
      );
    });

    it('maps a concurrent close (P2002 on periodStart) to CLOSING_CONFLICT', async () => {
      (prisma.cashClosing.create as jest.Mock).mockRejectedValue(
        createPrismaError('P2002')
      );

      const error = await service
        .close('user-1', dto)
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        errorCode: 'CLOSING_CONFLICT',
      });
    });

    it('rethrows non-unique-constraint errors untouched', async () => {
      const failure = createPrismaError('P2003');
      (prisma.cashClosing.create as jest.Mock).mockRejectedValue(failure);

      await expect(service.close('user-1', dto)).rejects.toBe(failure);
    });
  });

  describe('findAll', () => {
    beforeEach(() => {
      (prisma.cashClosing.findMany as jest.Mock).mockResolvedValue([
        CLOSING_RECORD,
      ]);
      (prisma.cashClosing.count as jest.Mock).mockResolvedValue(35);
    });

    it('lists closings newest first with pagination and closedBy summary', async () => {
      await service.findAll({ page: 2, limit: 10 });

      expect(prisma.cashClosing.findMany).toHaveBeenCalledWith({
        orderBy: { periodEnd: 'desc' },
        skip: 10,
        take: 10,
        include: { closedBy: { select: { id: true, name: true } } },
      });
      expect(prisma.cashClosing.count).toHaveBeenCalledWith();
    });

    it('defaults to page 1 and limit 20', async () => {
      await service.findAll({});

      expect(prisma.cashClosing.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20 })
      );
    });

    it('returns the {data, meta} shape with decimals as strings', async () => {
      const result = await service.findAll({ page: 2, limit: 10 });

      expect(result).toEqual({
        data: [CLOSING_RESPONSE],
        meta: { page: 2, limit: 10, total: 35 },
      });
    });

    it('returns an empty page when there are no closings', async () => {
      (prisma.cashClosing.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.cashClosing.count as jest.Mock).mockResolvedValue(0);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result).toEqual({
        data: [],
        meta: { page: 1, limit: 20, total: 0 },
      });
    });
  });

  describe('findOne', () => {
    it('returns the closing with decimals as strings and closedBy summary', async () => {
      (prisma.cashClosing.findUnique as jest.Mock).mockResolvedValue(
        CLOSING_RECORD
      );

      const result = await service.findOne('closing-1');

      expect(prisma.cashClosing.findUnique).toHaveBeenCalledWith({
        where: { id: 'closing-1' },
        include: { closedBy: { select: { id: true, name: true } } },
      });
      expect(result).toEqual(CLOSING_RESPONSE);
    });

    it('throws NotFoundException with CASH_CLOSING_NOT_FOUND when missing', async () => {
      (prisma.cashClosing.findUnique as jest.Mock).mockResolvedValue(null);

      const error = await service
        .findOne('missing-id')
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as NotFoundException).getResponse()).toMatchObject({
        errorCode: 'CASH_CLOSING_NOT_FOUND',
      });
    });
  });
});
