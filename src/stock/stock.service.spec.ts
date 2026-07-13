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
      },
      stockMovement: {
        findMany: jest.fn(),
        create: jest.fn(),
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
});
