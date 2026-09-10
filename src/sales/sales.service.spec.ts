import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PaymentMethod, Prisma, SaleStatus } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { CreateSaleDto } from './dto/create-sale.dto';
import { SalesService } from './sales.service';

describe('SalesService', () => {
  let service: SalesService;
  let prisma: PrismaService;

  const productRecord = {
    id: 'prod-1',
    code: 'OIL-5W30',
    name: 'Engine oil 5W-30',
    description: 'Synthetic engine oil',
    price: new Prisma.Decimal(10.0),
    isActive: true,
    deletedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  const serviceRecord = {
    id: 'svc-1',
    code: 'OIL-CHANGE',
    name: 'Oil change',
    description: 'Standard oil change',
    price: new Prisma.Decimal(35.5),
    estimatedDuration: 30,
    isActive: true,
    deletedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  const lotItemA = {
    id: 'lot-a',
    productId: 'prod-1',
    remainingQuantity: 3,
  };
  const lotItemB = {
    id: 'lot-b',
    productId: 'prod-1',
    remainingQuantity: 4,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      product: { findUnique: jest.fn() },
      service: { findUnique: jest.fn() },
      client: { findUnique: jest.fn() },
      branch: { findUnique: jest.fn() },
      employee: { findUnique: jest.fn() },
      lotItem: {
        aggregate: jest.fn(),
        findMany: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
      stockMovement: { create: jest.fn() },
      saleNumberSequence: { upsert: jest.fn() },
      sale: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn(),
    } as unknown as PrismaService;
    (prisma.$transaction as jest.Mock).mockImplementation(
      (callback: (tx: unknown) => unknown) => callback(prisma)
    );
    (prisma.saleNumberSequence.upsert as jest.Mock).mockResolvedValue({
      id: 'seq-1',
      year: 2026,
      lastNumber: 7,
    });
    (prisma.sale.create as jest.Mock).mockImplementation(
      (args: {
        data: Record<string, unknown>;
      }) => ({
        id: 'sale-1',
        saleNumber: args.data.saleNumber,
        clientId: args.data.clientId ?? null,
        branchId: args.data.branchId ?? null,
        employeeId: args.data.employeeId ?? null,
        status: 'completed',
        paymentMethod: args.data.paymentMethod,
        totalAmount: args.data.totalAmount,
        isActive: true,
        deletedAt: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      })
    );
    service = new SalesService(prisma);
  });

  describe('create', () => {
    it('creates a products-only sale consuming stock FIFO across two lots (S1)', async () => {
      const dto: CreateSaleDto = {
        paymentMethod: PaymentMethod.cash,
        productLines: [{ productId: 'prod-1', quantity: 5 }],
      };

      (prisma.product.findUnique as jest.Mock).mockResolvedValue(productRecord);
      (prisma.lotItem.aggregate as jest.Mock).mockResolvedValue({
        _sum: { remainingQuantity: 7 },
      });
      (prisma.lotItem.findMany as jest.Mock).mockResolvedValue([
        lotItemA,
        lotItemB,
      ]);
      (prisma.lotItem.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      const result = await service.create(dto);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.lotItem.updateMany).toHaveBeenNthCalledWith(1, {
        where: { id: 'lot-a', remainingQuantity: { gte: 3 } },
        data: { remainingQuantity: { decrement: 3 } },
      });
      expect(prisma.lotItem.updateMany).toHaveBeenNthCalledWith(2, {
        where: { id: 'lot-b', remainingQuantity: { gte: 2 } },
        data: { remainingQuantity: { decrement: 2 } },
      });
      expect(prisma.stockMovement.create).toHaveBeenCalledTimes(2);
      expect(prisma.stockMovement.create).toHaveBeenNthCalledWith(1, {
        data: {
          productId: 'prod-1',
          lotItemId: 'lot-a',
          saleId: 'sale-1',
          type: 'sale',
          quantity: -3,
          reason: 'Sale VTA-2026-000007',
        },
      });
      expect(result.saleNumber).toBe('VTA-2026-000007');
      expect(Number(result.totalAmount).toFixed(2)).toBe('50.00');
      const createArgs = (prisma.sale.create as jest.Mock).mock.calls[0][0];
      expect(Number(createArgs.data.totalAmount).toFixed(2)).toBe('50.00');
      expect(createArgs.data.products.create[0]).toMatchObject({
        productId: 'prod-1',
        quantity: 5,
      });
      expect(
        Number(createArgs.data.products.create[0].unitPriceSnapshot).toFixed(2)
      ).toBe('10.00');
    });

    it('creates a services-only sale with zero stock movements (S2)', async () => {
      const dto: CreateSaleDto = {
        paymentMethod: PaymentMethod.card,
        serviceLines: [{ serviceId: 'svc-1', quantity: 2 }],
      };

      (prisma.service.findUnique as jest.Mock).mockResolvedValue(serviceRecord);

      const result = await service.create(dto);

      expect(prisma.stockMovement.create).not.toHaveBeenCalled();
      expect(prisma.lotItem.aggregate).not.toHaveBeenCalled();
      expect(prisma.lotItem.updateMany).not.toHaveBeenCalled();
      expect(Number(result.totalAmount).toFixed(2)).toBe('71.00');
    });

    it('creates a mixed walk-in sale without optional references (S3)', async () => {
      const dto: CreateSaleDto = {
        paymentMethod: PaymentMethod.transfer,
        productLines: [{ productId: 'prod-1', quantity: 1 }],
        serviceLines: [{ serviceId: 'svc-1', quantity: 1 }],
      };

      (prisma.product.findUnique as jest.Mock).mockResolvedValue({
        ...productRecord,
        price: new Prisma.Decimal(10),
      });
      (prisma.service.findUnique as jest.Mock).mockResolvedValue({
        ...serviceRecord,
        price: new Prisma.Decimal(20),
      });
      (prisma.lotItem.aggregate as jest.Mock).mockResolvedValue({
        _sum: { remainingQuantity: 3 },
      });
      (prisma.lotItem.findMany as jest.Mock).mockResolvedValue([lotItemA]);
      (prisma.lotItem.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      const result = await service.create(dto);

      expect(prisma.client.findUnique).not.toHaveBeenCalled();
      expect(prisma.branch.findUnique).not.toHaveBeenCalled();
      expect(prisma.employee.findUnique).not.toHaveBeenCalled();
      expect(prisma.stockMovement.create).toHaveBeenCalledTimes(1);
      expect(Number(result.totalAmount).toFixed(2)).toBe('30.00');
    });

    it('ignores client-sent unit prices and snapshots catalog prices (SAL-F4)', async () => {
      const dto = {
        paymentMethod: PaymentMethod.cash,
        productLines: [{ productId: 'prod-1', quantity: 2, unitPrice: 0.01 }],
      } as unknown as CreateSaleDto;

      (prisma.product.findUnique as jest.Mock).mockResolvedValue(productRecord);
      (prisma.lotItem.aggregate as jest.Mock).mockResolvedValue({
        _sum: { remainingQuantity: 5 },
      });
      (prisma.lotItem.findMany as jest.Mock).mockResolvedValue([lotItemA]);
      (prisma.lotItem.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      await service.create(dto);

      const createArgs = (prisma.sale.create as jest.Mock).mock.calls[0][0];
      expect(
        Number(createArgs.data.products.create[0].unitPriceSnapshot).toFixed(2)
      ).toBe('10.00');
      expect(Number(createArgs.data.totalAmount).toFixed(2)).toBe('20.00');
    });

    it('computes Decimal totals exactly across mixed lines', async () => {
      const dto: CreateSaleDto = {
        paymentMethod: PaymentMethod.cash,
        productLines: [{ productId: 'prod-1', quantity: 3 }],
        serviceLines: [{ serviceId: 'svc-1', quantity: 1 }],
      };

      (prisma.product.findUnique as jest.Mock).mockResolvedValue({
        ...productRecord,
        price: new Prisma.Decimal('10.10'),
      });
      (prisma.service.findUnique as jest.Mock).mockResolvedValue({
        ...serviceRecord,
        price: new Prisma.Decimal('20.20'),
      });
      (prisma.lotItem.aggregate as jest.Mock).mockResolvedValue({
        _sum: { remainingQuantity: 10 },
      });
      (prisma.lotItem.findMany as jest.Mock).mockResolvedValue([lotItemB]);
      (prisma.lotItem.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      await service.create(dto);

      const createArgs = (prisma.sale.create as jest.Mock).mock.calls[0][0];
      expect(createArgs.data.totalAmount.toFixed(2)).toBe('50.50');
    });

    it('generates the sale number inside the transaction via sequence upsert (S8)', async () => {
      const dto: CreateSaleDto = {
        paymentMethod: PaymentMethod.cash,
        serviceLines: [{ serviceId: 'svc-1', quantity: 1 }],
      };

      (prisma.service.findUnique as jest.Mock).mockResolvedValue(serviceRecord);

      await service.create(dto);

      const txMock = (prisma.$transaction as jest.Mock).mock.calls[0][0];
      expect(typeof txMock).toBe('function');
      expect(prisma.saleNumberSequence.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { year: expect.any(Number) },
          update: { lastNumber: { increment: 1 } },
        })
      );
      const sequenceOrder = (prisma.saleNumberSequence.upsert as jest.Mock).mock
        .invocationCallOrder[0];
      const saleOrder = (prisma.sale.create as jest.Mock).mock
        .invocationCallOrder[0];
      expect(sequenceOrder).toBeLessThan(saleOrder);
    });

    it('throws 400 SALE_EMPTY_LINES when no lines are provided (S5)', async () => {
      await expect(
        service.create({ paymentMethod: PaymentMethod.cash })
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.create({
          paymentMethod: PaymentMethod.cash,
          productLines: [],
          serviceLines: [],
        })
      ).rejects.toMatchObject({
        response: { errorCode: 'SALE_EMPTY_LINES' },
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws 400 when a product line is duplicated', async () => {
      await expect(
        service.create({
          paymentMethod: PaymentMethod.cash,
          productLines: [
            { productId: 'prod-1', quantity: 1 },
            { productId: 'prod-1', quantity: 2 },
          ],
        })
      ).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws 404 PRODUCT_NOT_FOUND for unknown or inactive product (S6)', async () => {
      (prisma.product.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.create({
          paymentMethod: PaymentMethod.cash,
          productLines: [{ productId: 'prod-x', quantity: 1 }],
        })
      ).rejects.toMatchObject({ response: { errorCode: 'PRODUCT_NOT_FOUND' } });
      await expect(
        service.create({
          paymentMethod: PaymentMethod.cash,
          productLines: [{ productId: 'prod-x', quantity: 1 }],
        })
      ).rejects.toThrow(NotFoundException);
    });

    it('throws 404 SERVICE_NOT_FOUND for unknown or inactive service (S6)', async () => {
      (prisma.service.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.create({
          paymentMethod: PaymentMethod.cash,
          serviceLines: [{ serviceId: 'svc-x', quantity: 1 }],
        })
      ).rejects.toMatchObject({ response: { errorCode: 'SERVICE_NOT_FOUND' } });
    });

    it('throws 404 CLIENT_NOT_FOUND for unknown or inactive client (S6)', async () => {
      (prisma.service.findUnique as jest.Mock).mockResolvedValue(serviceRecord);
      (prisma.client.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.create({
          paymentMethod: PaymentMethod.cash,
          clientId: 'client-x',
          serviceLines: [{ serviceId: 'svc-1', quantity: 1 }],
        })
      ).rejects.toMatchObject({ response: { errorCode: 'CLIENT_NOT_FOUND' } });
    });

    it('throws 404 BRANCH_NOT_FOUND / EMPLOYEE_NOT_FOUND (S6)', async () => {
      (prisma.service.findUnique as jest.Mock).mockResolvedValue(serviceRecord);
      (prisma.branch.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.create({
          paymentMethod: PaymentMethod.cash,
          branchId: 'branch-x',
          serviceLines: [{ serviceId: 'svc-1', quantity: 1 }],
        })
      ).rejects.toMatchObject({ response: { errorCode: 'BRANCH_NOT_FOUND' } });

      (prisma.branch.findUnique as jest.Mock).mockResolvedValue({
        id: 'branch-1',
      });
      (prisma.employee.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.create({
          paymentMethod: PaymentMethod.cash,
          branchId: 'branch-1',
          employeeId: 'emp-x',
          serviceLines: [{ serviceId: 'svc-1', quantity: 1 }],
        })
      ).rejects.toMatchObject({
        response: { errorCode: 'EMPLOYEE_NOT_FOUND' },
      });
    });

    it('aborts with 409 INSUFFICIENT_STOCK when aggregate stock is short and performs no writes (S4)', async () => {
      (prisma.product.findUnique as jest.Mock).mockResolvedValue(productRecord);
      (prisma.lotItem.aggregate as jest.Mock).mockResolvedValue({
        _sum: { remainingQuantity: 4 },
      });

      await expect(
        service.create({
          paymentMethod: PaymentMethod.cash,
          productLines: [{ productId: 'prod-1', quantity: 5 }],
        })
      ).rejects.toMatchObject({
        response: {
          errorCode: 'INSUFFICIENT_STOCK',
          details: [{ productId: 'prod-1', requested: 5, available: 4 }],
        },
      });
      await expect(
        service.create({
          paymentMethod: PaymentMethod.cash,
          productLines: [{ productId: 'prod-1', quantity: 5 }],
        })
      ).rejects.toThrow(ConflictException);

      expect(prisma.lotItem.updateMany).not.toHaveBeenCalled();
      expect(prisma.stockMovement.create).not.toHaveBeenCalled();
      expect(prisma.sale.create).not.toHaveBeenCalled();
    });

    it('aborts with 409 when a lot guard matches zero rows (S11)', async () => {
      (prisma.product.findUnique as jest.Mock).mockResolvedValue(productRecord);
      (prisma.lotItem.aggregate as jest.Mock).mockResolvedValue({
        _sum: { remainingQuantity: 5 },
      });
      (prisma.lotItem.findMany as jest.Mock).mockResolvedValue([
        { ...lotItemA, remainingQuantity: 5 },
      ]);
      (prisma.lotItem.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

      await expect(
        service.create({
          paymentMethod: PaymentMethod.cash,
          productLines: [{ productId: 'prod-1', quantity: 5 }],
        })
      ).rejects.toMatchObject({
        response: { errorCode: 'INSUFFICIENT_STOCK' },
      });

      expect(prisma.stockMovement.create).not.toHaveBeenCalled();
      // sale.create runs before the FIFO walk (stockMovement.saleId FK);
      // atomicity is guaranteed by the $transaction rollback on throw.
    });
  });

  describe('cancelSale', () => {
    const baseSale = {
      id: 'sale-1',
      saleNumber: 'VTA-2026-000042',
      clientId: 'client-1',
      branchId: null,
      employeeId: null,
      paymentMethod: 'cash',
      totalAmount: new Prisma.Decimal(50),
      isActive: true,
      deletedAt: null,
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
      updatedAt: new Date('2026-06-01T00:00:00.000Z'),
      client: { id: 'client-1', name: 'María García' },
      branch: null,
      employee: null,
      products: [],
      services: [],
    };

    const sliceA = {
      id: 'sm-1',
      productId: 'prod-1',
      lotItemId: 'lot-a',
      saleId: 'sale-1',
      type: 'sale',
      quantity: -3,
      reason: 'Sale VTA-2026-000042',
    };
    const sliceB = {
      id: 'sm-2',
      productId: 'prod-1',
      lotItemId: 'lot-b',
      saleId: 'sale-1',
      type: 'sale',
      quantity: -2,
      reason: 'Sale VTA-2026-000042',
    };
    const newestLotC = {
      id: 'sm-3',
      productId: 'prod-1',
      lotItemId: 'lot-c',
      saleId: 'sale-1',
      type: 'entry',
      quantity: 10,
      reason: null,
    };

    const completedSaleWithSlices = {
      ...baseSale,
      status: 'completed',
      stockMovements: [sliceA, sliceB, newestLotC],
    };

    const mockFindThenReRead = (
      found: Record<string, unknown> | null,
      refreshed: Record<string, unknown> | null
    ) => {
      (prisma.sale.findUnique as jest.Mock).mockImplementation(
        ({ include }: { include?: Record<string, unknown> }) =>
          include?.stockMovements ? found : refreshed
      );
    };

    beforeEach(() => {
      (prisma.sale.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    });

    it('restores stock per FIFO slice and writes one compensating movement per slice (S12)', async () => {
      mockFindThenReRead(completedSaleWithSlices, {
        ...baseSale,
        status: 'cancelled',
      });

      const result = await service.cancelSale('sale-1');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.sale.updateMany).toHaveBeenCalledWith({
        where: { id: 'sale-1', status: 'completed' },
        data: { status: 'cancelled' },
      });
      expect(prisma.lotItem.update).toHaveBeenCalledTimes(2);
      expect(prisma.lotItem.update).toHaveBeenNthCalledWith(1, {
        where: { id: 'lot-a' },
        data: { remainingQuantity: { increment: 3 } },
      });
      expect(prisma.lotItem.update).toHaveBeenNthCalledWith(2, {
        where: { id: 'lot-b' },
        data: { remainingQuantity: { increment: 2 } },
      });
      expect(prisma.stockMovement.create).toHaveBeenCalledTimes(2);
      expect(prisma.stockMovement.create).toHaveBeenNthCalledWith(1, {
        data: {
          productId: 'prod-1',
          lotItemId: 'lot-a',
          saleId: 'sale-1',
          type: 'cancel',
          quantity: 3,
          reason: 'Cancel VTA-2026-000042',
        },
      });
      expect(prisma.stockMovement.create).toHaveBeenNthCalledWith(2, {
        data: expect.objectContaining({
          lotItemId: 'lot-b',
          type: 'cancel',
          quantity: 2,
          reason: 'Cancel VTA-2026-000042',
        }),
      });
      expect(result.status).toBe('cancelled');
      expect(result.saleNumber).toBe('VTA-2026-000042');
      expect(result.totalAmount).toBe('50.00');
    });

    it('throws 404 SALE_NOT_FOUND for a missing or inactive sale with zero writes (S13)', async () => {
      mockFindThenReRead(null, null);

      await expect(service.cancelSale('sale-x')).rejects.toMatchObject({
        response: { errorCode: 'SALE_NOT_FOUND' },
      });
      await expect(service.cancelSale('sale-x')).rejects.toThrow(
        NotFoundException
      );
      expect(prisma.sale.updateMany).not.toHaveBeenCalled();
      expect(prisma.lotItem.update).not.toHaveBeenCalled();
      expect(prisma.stockMovement.create).not.toHaveBeenCalled();
    });

    it('throws 409 SALE_ALREADY_CANCELLED without double restoration (S14)', async () => {
      mockFindThenReRead(
        { ...completedSaleWithSlices, status: 'cancelled' },
        null
      );

      await expect(service.cancelSale('sale-1')).rejects.toMatchObject({
        response: { errorCode: 'SALE_ALREADY_CANCELLED' },
      });
      await expect(service.cancelSale('sale-1')).rejects.toThrow(
        ConflictException
      );
      expect(prisma.sale.updateMany).not.toHaveBeenCalled();
      expect(prisma.lotItem.update).not.toHaveBeenCalled();
      expect(prisma.stockMovement.create).not.toHaveBeenCalled();
    });

    it('restores only the consumed slices, leaving newer lots untouched (S17)', async () => {
      mockFindThenReRead(completedSaleWithSlices, {
        ...baseSale,
        status: 'cancelled',
      });

      await service.cancelSale('sale-1');

      const updatedLotIds = (prisma.lotItem.update as jest.Mock).mock.calls.map(
        (call: unknown[]) => (call[0] as { where: { id: string } }).where.id
      );
      expect(updatedLotIds).toEqual(['lot-a', 'lot-b']);
      const movementLotIds = (
        prisma.stockMovement.create as jest.Mock
      ).mock.calls.map(
        (call: unknown[]) =>
          (call[0] as { data: { lotItemId: string } }).data.lotItemId
      );
      expect(movementLotIds).toEqual(['lot-a', 'lot-b']);
    });

    it('aborts with 409 when the guarded flip matches zero rows (S18)', async () => {
      mockFindThenReRead(completedSaleWithSlices, null);
      (prisma.sale.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

      await expect(service.cancelSale('sale-1')).rejects.toMatchObject({
        response: { errorCode: 'SALE_ALREADY_CANCELLED' },
      });
      expect(prisma.lotItem.update).not.toHaveBeenCalled();
      expect(prisma.stockMovement.create).not.toHaveBeenCalled();
    });

    it('cancels a services-only sale with zero movements and keeps the DTO shape', async () => {
      mockFindThenReRead(
        { ...baseSale, status: 'completed', stockMovements: [] },
        { ...baseSale, status: 'cancelled' }
      );

      const result = await service.cancelSale('sale-1');

      expect(prisma.stockMovement.create).not.toHaveBeenCalled();
      expect(prisma.lotItem.update).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        id: 'sale-1',
        saleNumber: 'VTA-2026-000042',
        status: 'cancelled',
        totalAmount: '50.00',
        client: { id: 'client-1', name: 'María García' },
      });
    });
  });

  describe('findAll', () => {
    it('returns paginated active sales mapped through the response DTO (S10)', async () => {
      const base = {
        branchId: null,
        employeeId: null,
        status: 'completed',
        paymentMethod: 'cash',
        isActive: true,
        deletedAt: null,
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
        updatedAt: new Date('2026-06-01T00:00:00.000Z'),
      };
      (prisma.sale.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'sale-1',
          saleNumber: 'VTA-2026-000001',
          clientId: 'client-1',
          totalAmount: new Prisma.Decimal(50),
          ...base,
        },
        {
          id: 'sale-2',
          saleNumber: 'VTA-2026-000002',
          clientId: 'client-2',
          totalAmount: new Prisma.Decimal(30),
          ...base,
        },
      ]);
      (prisma.sale.count as jest.Mock).mockResolvedValue(2);

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(prisma.sale.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
          skip: 0,
          take: 10,
        })
      );
      expect(prisma.sale.count).toHaveBeenCalledWith({
        where: { isActive: true },
      });
      expect(result.meta).toEqual({ page: 1, limit: 10, total: 2 });
      expect(result.data).toHaveLength(2);
      expect(result.data[0].totalAmount).toBe('50.00');
      expect(result.data[0].products).toEqual([]);
      expect(result.data[0].client).toBeNull();
    });

    it('applies clientId, status, saleNumber contains-insensitive and date range filters', async () => {
      (prisma.sale.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.sale.count as jest.Mock).mockResolvedValue(0);

      await service.findAll({
        page: 2,
        limit: 5,
        clientId: 'client-1',
        status: SaleStatus.completed,
        saleNumber: 'vta-2026',
        from: '2026-01-01',
        to: '2026-12-31',
      });

      const findManyArgs = (prisma.sale.findMany as jest.Mock).mock.calls[0][0];
      expect(findManyArgs).toMatchObject({
        where: {
          isActive: true,
          clientId: 'client-1',
          status: SaleStatus.completed,
          saleNumber: { contains: 'vta-2026', mode: 'insensitive' },
          createdAt: {
            gte: new Date('2026-01-01'),
            lte: new Date('2026-12-31'),
          },
        },
        skip: 5,
        take: 5,
      });
    });
  });

  describe('findOne', () => {
    it('returns the sale through the response DTO', async () => {
      (prisma.sale.findUnique as jest.Mock).mockResolvedValue({
        id: 'sale-1',
        saleNumber: 'VTA-2026-000001',
        clientId: 'client-1',
        branchId: null,
        employeeId: null,
        status: 'completed',
        paymentMethod: 'cash',
        totalAmount: new Prisma.Decimal(50),
        isActive: true,
        deletedAt: null,
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
        updatedAt: new Date('2026-06-01T00:00:00.000Z'),
        client: { id: 'client-1', name: 'María García' },
        branch: null,
        employee: null,
        products: [],
        services: [],
      });

      const result = await service.findOne('sale-1');

      expect(prisma.sale.findUnique).toHaveBeenCalledWith({
        where: { id: 'sale-1', isActive: true },
        include: expect.anything(),
      });
      expect(result.id).toBe('sale-1');
      expect(result.totalAmount).toBe('50.00');
      expect(result.client).toEqual({ id: 'client-1', name: 'María García' });
    });

    it('throws 404 SALE_NOT_FOUND when the sale is missing or inactive', async () => {
      (prisma.sale.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.findOne('sale-x')).rejects.toMatchObject({
        response: { errorCode: 'SALE_NOT_FOUND' },
      });
      await expect(service.findOne('sale-x')).rejects.toThrow(
        NotFoundException
      );
    });
  });
});
