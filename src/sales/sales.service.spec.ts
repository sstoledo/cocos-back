import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PaymentMethod, Prisma } from '@prisma/client';
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
      },
      stockMovement: { create: jest.fn() },
      saleNumberSequence: { upsert: jest.fn() },
      sale: { create: jest.fn() },
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
});
