import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { CashClosingsService } from './cash-closings.service';
import type { CreateCashClosingDto } from './dto/create-cash-closing.dto';

const NOW = new Date('2026-10-02T14:00:00.000Z');
const LAST_PERIOD_END = new Date('2026-09-30T22:00:00.000Z');
const EARLIEST_SALE_AT = new Date('2026-09-15T10:30:00.000Z');

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
        create: jest.fn(),
      },
      sale: {
        findFirst: jest.fn(),
        groupBy: jest.fn(),
        count: jest.fn(),
      },
      $transaction: jest.fn(),
    } as unknown as PrismaService;
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

    it('closes an empty first period starting at now', async () => {
      (prisma.cashClosing.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.sale.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.sale.groupBy as jest.Mock).mockResolvedValue([]);
      (prisma.sale.count as jest.Mock).mockResolvedValue(0);

      const result = await service.close('user-1', { declaredCash: '15' });

      const createData = (prisma.cashClosing.create as jest.Mock).mock
        .calls[0][0].data;
      expect(createData.periodStart).toEqual(NOW);
      expect(result.expectedCash).toBe('0.00');
      expect(result.difference).toBe('15.00');
      expect(result.salesCount).toBe(0);
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
});
