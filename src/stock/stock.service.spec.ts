import { BadRequestException } from '@nestjs/common';
import { StockMovementType } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { StockService } from './stock.service';

const movementInclude = { lotItem: { include: { lot: true } } };

const baseDto = {
  productId: 'product-1',
  type: StockMovementType.adjustment,
  reason: 'Reason',
};

const mockResolved = (fn: unknown, value: unknown) => {
  (fn as unknown as jest.Mock).mockResolvedValue(value);
};

const mockRejected = (fn: unknown, error: unknown) => {
  (fn as unknown as jest.Mock).mockRejectedValue(error);
};

describe('StockService', () => {
  let service: StockService;
  let prisma: PrismaService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      lotItem: {
        aggregate: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      stockMovement: {
        findMany: jest.fn(),
        create: jest.fn(),
      },
      product: {
        findUnique: jest.fn(),
      },
      workOrderConsumptionEvent: {
        count: jest.fn(),
        findFirst: jest.fn(),
      },
      $transaction: jest.fn(async (callback) => callback(prisma)),
    } as unknown as PrismaService;
    service = new StockService(prisma);
  });

  describe('getStockByProduct', () => {
    it('returns the aggregated remaining quantity for a product', async () => {
      mockResolved(prisma.lotItem.aggregate, {
        _sum: { remainingQuantity: 42 },
      });

      const result = await service.getStockByProduct('product-1');

      expect(prisma.lotItem.aggregate).toHaveBeenCalledWith({
        _sum: { remainingQuantity: true },
        where: { productId: 'product-1' },
      });
      expect(result).toEqual({ productId: 'product-1', stock: 42 });
    });

    it('returns zero when there is no remaining quantity', async () => {
      mockResolved(prisma.lotItem.aggregate, {
        _sum: { remainingQuantity: null },
      });

      const result = await service.getStockByProduct('product-1');

      expect(result).toEqual({ productId: 'product-1', stock: 0 });
    });
  });

  describe('getMovementsByProduct', () => {
    it('returns movements ordered by creation date with lot details', async () => {
      const movements = [{ id: 'movement-1' }];
      mockResolved(prisma.stockMovement.findMany, movements);

      const result = await service.getMovementsByProduct('product-1');

      expect(prisma.stockMovement.findMany).toHaveBeenCalledWith({
        where: { productId: 'product-1' },
        orderBy: { createdAt: 'desc' },
        include: movementInclude,
      });
      expect(result).toEqual(movements);
    });
  });

  describe('adjustStock', () => {
    it('increments the most recent lot item with stock for a positive adjustment', async () => {
      const dto = { ...baseDto, quantity: 5 };
      const lotItems = [
        {
          id: 'item-1',
          remainingQuantity: 0,
          lot: { receivedAt: new Date('2026-07-13') },
        },
        {
          id: 'item-2',
          remainingQuantity: 10,
          lot: { receivedAt: new Date('2026-07-12') },
        },
      ];
      const movement = { id: 'movement-1', ...dto };
      mockResolved(prisma.lotItem.findMany, lotItems);
      mockResolved(prisma.lotItem.update, {
        id: 'item-2',
        remainingQuantity: 15,
      });
      mockResolved(prisma.stockMovement.create, movement);

      const result = await service.adjustStock(dto);

      expect(prisma.lotItem.findMany).toHaveBeenCalledWith({
        where: { productId: 'product-1' },
        orderBy: { lot: { receivedAt: 'desc' } },
        include: { lot: true },
      });
      expect(prisma.lotItem.update).toHaveBeenCalledWith({
        where: { id: 'item-2' },
        data: { remainingQuantity: { increment: 5 } },
      });
      expect(prisma.stockMovement.create).toHaveBeenCalledWith({
        data: {
          productId: 'product-1',
          lotItemId: 'item-2',
          type: StockMovementType.adjustment,
          quantity: 5,
          reason: 'Reason',
        },
      });
      expect(result).toEqual(movement);
    });

    it('uses the most recent lot item when no stock exists for a positive adjustment', async () => {
      const dto = { ...baseDto, quantity: 5 };
      const lotItems = [
        {
          id: 'item-1',
          remainingQuantity: 0,
          lot: { receivedAt: new Date('2026-07-13') },
        },
      ];
      const movement = { id: 'movement-1', ...dto };
      mockResolved(prisma.lotItem.findMany, lotItems);
      mockResolved(prisma.lotItem.update, {
        id: 'item-1',
        remainingQuantity: 5,
      });
      mockResolved(prisma.stockMovement.create, movement);

      await service.adjustStock(dto);

      expect(prisma.lotItem.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: { remainingQuantity: { increment: 5 } },
      });
      expect(prisma.stockMovement.create).toHaveBeenCalledWith({
        data: {
          productId: 'product-1',
          lotItemId: 'item-1',
          type: StockMovementType.adjustment,
          quantity: 5,
          reason: 'Reason',
        },
      });
    });

    it('decrements the most recent lot item with stock for a negative adjustment', async () => {
      const dto = { ...baseDto, quantity: -3 };
      const lotItems = [
        {
          id: 'item-1',
          remainingQuantity: 10,
          lot: { receivedAt: new Date('2026-07-13') },
        },
      ];
      const movement = { id: 'movement-1', ...dto };
      mockResolved(prisma.lotItem.findMany, lotItems);
      mockResolved(prisma.lotItem.update, {
        id: 'item-1',
        remainingQuantity: 7,
      });
      mockResolved(prisma.stockMovement.create, movement);

      await service.adjustStock(dto);

      expect(prisma.lotItem.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: { remainingQuantity: { increment: -3 } },
      });
      expect(prisma.stockMovement.create).toHaveBeenCalledWith({
        data: {
          productId: 'product-1',
          lotItemId: 'item-1',
          type: StockMovementType.adjustment,
          quantity: -3,
          reason: 'Reason',
        },
      });
    });

    it('throws when there are no lot items for the product', async () => {
      const dto = { ...baseDto, quantity: 5 };
      mockResolved(prisma.lotItem.findMany, []);

      await expect(service.adjustStock(dto)).rejects.toThrow(
        BadRequestException
      );
      expect(prisma.lotItem.update).not.toHaveBeenCalled();
      expect(prisma.stockMovement.create).not.toHaveBeenCalled();
    });

    it('throws when decreasing stock and no lot item has available stock', async () => {
      const dto = { ...baseDto, quantity: -3 };
      const lotItems = [
        {
          id: 'item-1',
          remainingQuantity: 0,
          lot: { receivedAt: new Date('2026-07-13') },
        },
      ];
      mockResolved(prisma.lotItem.findMany, lotItems);

      await expect(service.adjustStock(dto)).rejects.toThrow(
        BadRequestException
      );
      expect(prisma.lotItem.update).not.toHaveBeenCalled();
      expect(prisma.stockMovement.create).not.toHaveBeenCalled();
    });

    it('throws when decreasing more than the available stock in the target lot item', async () => {
      const dto = { ...baseDto, quantity: -10 };
      const lotItems = [
        {
          id: 'item-1',
          remainingQuantity: 5,
          lot: { receivedAt: new Date('2026-07-13') },
        },
      ];
      mockResolved(prisma.lotItem.findMany, lotItems);

      await expect(service.adjustStock(dto)).rejects.toThrow(
        BadRequestException
      );
      expect(prisma.lotItem.update).not.toHaveBeenCalled();
      expect(prisma.stockMovement.create).not.toHaveBeenCalled();
    });

    it('throws when the movement type is not adjustment', async () => {
      const dto = {
        productId: 'product-1',
        type: StockMovementType.entry,
        quantity: 5,
        reason: 'Reason',
      };
      mockResolved(prisma.lotItem.findMany, []);

      await expect(service.adjustStock(dto)).rejects.toThrow(
        BadRequestException
      );
      expect(prisma.lotItem.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getOpenContainers', () => {
    const productRecord = {
      id: 'product-1',
      code: 'OIL-5W30',
      name: 'Engine oil 5W-30',
      consumptionType: 'partial',
      isActive: true,
      deletedAt: null,
    };

    it('returns the open-container balance with last opened info', async () => {
      mockResolved(prisma.product.findUnique, productRecord);
      (
        prisma.workOrderConsumptionEvent.count as unknown as jest.Mock
      ).mockImplementation(({ where }) =>
        Promise.resolve(where.type === 'opened' ? 3 : 1)
      );
      mockResolved(prisma.workOrderConsumptionEvent.findFirst, {
        workOrderId: 'wo-1',
        workOrder: { orderNumber: 'OC-2026-000001' },
        registeredBy: { id: 'user-1', name: 'Juan' },
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
      });

      const result = await service.getOpenContainers('product-1');

      expect(result).toEqual({
        productId: 'product-1',
        openContainers: 2,
        lastOpened: {
          workOrderId: 'wo-1',
          workOrderNumber: 'OC-2026-000001',
          registeredBy: { id: 'user-1', name: 'Juan' },
          createdAt: new Date('2026-01-02T00:00:00.000Z'),
        },
      });
    });

    it('returns zero balance and null lastOpened when nothing was opened', async () => {
      mockResolved(prisma.product.findUnique, productRecord);
      mockResolved(prisma.workOrderConsumptionEvent.count, 0);
      mockResolved(prisma.workOrderConsumptionEvent.findFirst, null);

      const result = await service.getOpenContainers('product-1');

      expect(result).toEqual({
        productId: 'product-1',
        openContainers: 0,
        lastOpened: null,
      });
    });

    it('throws NotFoundException when the product does not exist', async () => {
      mockResolved(prisma.product.findUnique, null);

      await expect(service.getOpenContainers('missing')).rejects.toMatchObject({
        response: { errorCode: 'PRODUCT_NOT_FOUND' },
      });
      expect(prisma.workOrderConsumptionEvent.count).not.toHaveBeenCalled();
    });
  });

  describe('consumeFifo', () => {
    const asTx = () =>
      prisma as unknown as Parameters<StockService['consumeFifo']>[0];

    it('availableStock sums remainingQuantity greater than zero', async () => {
      mockResolved(prisma.lotItem.aggregate, {
        _sum: { remainingQuantity: 7 },
      });

      expect(await service.availableStock(asTx(), 'product-1')).toBe(7);
      expect(prisma.lotItem.aggregate).toHaveBeenCalledWith({
        _sum: { remainingQuantity: true },
        where: { productId: 'product-1', remainingQuantity: { gt: 0 } },
      });
    });

    const baseMovement = {
      movementType: StockMovementType.sale,
      reason: 'Sale VTA-2026-000001',
      saleId: 'sale-1',
    };

    it('walks FIFO across two real lots, draining the older first', async () => {
      mockResolved(prisma.lotItem.aggregate, {
        _sum: { remainingQuantity: 8 },
      });
      mockResolved(prisma.lotItem.findMany, [
        { id: 'lot-a', productId: 'product-1', remainingQuantity: 3 },
        { id: 'lot-b', productId: 'product-1', remainingQuantity: 10 },
      ]);
      mockResolved(prisma.lotItem.updateMany, { count: 1 });
      mockResolved(prisma.stockMovement.create, {});

      await service.consumeFifo(
        asTx(),
        'product-1',
        5,
        baseMovement,
        'Fail msg'
      );

      expect(prisma.lotItem.updateMany).toHaveBeenNthCalledWith(1, {
        where: { id: 'lot-a', remainingQuantity: { gte: 3 } },
        data: { remainingQuantity: { decrement: 3 } },
      });
      expect(prisma.lotItem.updateMany).toHaveBeenNthCalledWith(2, {
        where: { id: 'lot-b', remainingQuantity: { gte: 2 } },
        data: { remainingQuantity: { decrement: 2 } },
      });
      expect(prisma.stockMovement.create).toHaveBeenNthCalledWith(1, {
        data: {
          productId: 'product-1',
          lotItemId: 'lot-a',
          saleId: 'sale-1',
          type: StockMovementType.sale,
          quantity: -3,
          reason: 'Sale VTA-2026-000001',
        },
      });
      expect(prisma.stockMovement.create).toHaveBeenNthCalledWith(2, {
        data: {
          productId: 'product-1',
          lotItemId: 'lot-b',
          saleId: 'sale-1',
          type: StockMovementType.sale,
          quantity: -2,
          reason: 'Sale VTA-2026-000001',
        },
      });
    });

    it('consumes the exact available boundary and creates no extra movement', async () => {
      mockResolved(prisma.lotItem.aggregate, {
        _sum: { remainingQuantity: 3 },
      });
      mockResolved(prisma.lotItem.findMany, [
        { id: 'lot-a', productId: 'product-1', remainingQuantity: 3 },
      ]);
      mockResolved(prisma.lotItem.updateMany, { count: 1 });
      mockResolved(prisma.stockMovement.create, {});

      await service.consumeFifo(
        asTx(),
        'product-1',
        3,
        baseMovement,
        'Fail msg'
      );

      expect(prisma.lotItem.updateMany).toHaveBeenCalledTimes(1);
      expect(prisma.stockMovement.create).toHaveBeenCalledTimes(1);
      expect(prisma.lotItem.updateMany).toHaveBeenCalledWith({
        where: { id: 'lot-a', remainingQuantity: { gte: 3 } },
        data: { remainingQuantity: { decrement: 3 } },
      });
    });

    it('throws INSUFFICIENT_STOCK before any mutation when the aggregate is short', async () => {
      mockResolved(prisma.lotItem.aggregate, {
        _sum: { remainingQuantity: 2 },
      });

      await expect(
        service.consumeFifo(asTx(), 'product-1', 5, baseMovement, 'Fail msg')
      ).rejects.toMatchObject({
        response: {
          message: 'Fail msg',
          errorCode: 'INSUFFICIENT_STOCK',
          details: [{ productId: 'product-1', requested: 5, available: 2 }],
        },
      });
      expect(prisma.lotItem.findMany).not.toHaveBeenCalled();
      expect(prisma.lotItem.updateMany).not.toHaveBeenCalled();
      expect(prisma.stockMovement.create).not.toHaveBeenCalled();
    });

    it('throws INSUFFICIENT_STOCK when the guarded decrement matches zero rows', async () => {
      mockResolved(prisma.lotItem.aggregate, {
        _sum: { remainingQuantity: 3 },
      });
      mockResolved(prisma.lotItem.findMany, [
        { id: 'lot-a', productId: 'product-1', remainingQuantity: 3 },
      ]);
      mockResolved(prisma.lotItem.updateMany, { count: 0 });

      await expect(
        service.consumeFifo(asTx(), 'product-1', 3, baseMovement, 'Fail msg')
      ).rejects.toMatchObject({
        response: {
          errorCode: 'INSUFFICIENT_STOCK',
          details: [{ productId: 'product-1', requested: 3, available: 0 }],
        },
      });
      expect(prisma.stockMovement.create).not.toHaveBeenCalled();
    });

    it('omits saleId/workOrderId from the movement when not provided', async () => {
      mockResolved(prisma.lotItem.aggregate, {
        _sum: { remainingQuantity: 1 },
      });
      mockResolved(prisma.lotItem.findMany, [
        { id: 'lot-a', productId: 'product-1', remainingQuantity: 1 },
      ]);
      mockResolved(prisma.lotItem.updateMany, { count: 1 });
      mockResolved(prisma.stockMovement.create, {});

      await service.consumeFifo(
        asTx(),
        'product-1',
        1,
        { movementType: StockMovementType.service_usage, reason: 'WO usage' },
        'Fail msg'
      );

      const arg = (prisma.stockMovement.create as jest.Mock).mock.calls[0][0];
      expect(arg.data.saleId).toBeUndefined();
      expect(arg.data.workOrderId).toBeUndefined();
      expect(arg.data.type).toBe(StockMovementType.service_usage);
    });
  });
});
