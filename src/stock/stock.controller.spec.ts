import { Reflector } from '@nestjs/core';
import { RoleName } from '@prisma/client';
import { StockController } from './stock.controller';
import type { StockService } from './stock.service';

jest.mock('../auth/auth', () => ({
  auth: {
    api: {
      getSession: jest.fn(),
    },
  },
}));

jest.mock('better-auth/node', () => ({
  fromNodeHeaders: jest.fn(),
}));

describe('StockController', () => {
  let controller: StockController;
  let stockService: StockService;

  beforeEach(() => {
    jest.clearAllMocks();
    stockService = {
      getStockByProduct: jest.fn(),
      getMovementsByProduct: jest.fn(),
      adjustStock: jest.fn(),
    } as unknown as StockService;
    controller = new StockController(stockService);
  });

  describe('guards', () => {
    it('applies RolesGuard to the controller', () => {
      const guards = Reflect.getMetadata('__guards__', StockController);
      expect(guards).toBeDefined();
      expect(guards).toHaveLength(1);
      expect(guards[0].name).toBe('RolesGuard');
    });
  });

  describe('roles', () => {
    const reflector = new Reflector();

    it('allows all authenticated roles for getStockByProduct', () => {
      const roles = reflector.getAllAndOverride<RoleName[]>('roles', [
        StockController.prototype.getStockByProduct,
        StockController,
      ]);
      expect(roles).toEqual(
        expect.arrayContaining([
          RoleName.Admin,
          RoleName.Reception,
          RoleName.Mechanic,
          RoleName.Warehouse,
          RoleName.Purchasing,
          RoleName.ReadOnly,
        ])
      );
      expect(roles).toHaveLength(6);
    });

    it('allows all authenticated roles for getMovementsByProduct', () => {
      const roles = reflector.getAllAndOverride<RoleName[]>('roles', [
        StockController.prototype.getMovementsByProduct,
        StockController,
      ]);
      expect(roles).toHaveLength(6);
    });

    it('restricts createMovement to Admin, Warehouse and Purchasing', () => {
      const roles = reflector.getAllAndOverride<RoleName[]>('roles', [
        StockController.prototype.createMovement,
        StockController,
      ]);
      expect(roles).toEqual([
        RoleName.Admin,
        RoleName.Warehouse,
        RoleName.Purchasing,
      ]);
    });
  });

  describe('getStockByProduct', () => {
    it('returns stock for the requested product', async () => {
      const stock = { productId: 'product-1', stock: 10 };
      mockResolved(stockService.getStockByProduct, stock);

      const result = await controller.getStockByProduct('product-1');

      expect(stockService.getStockByProduct).toHaveBeenCalledWith('product-1');
      expect(result).toEqual(stock);
    });
  });

  describe('getMovementsByProduct', () => {
    it('returns movements for the requested product', async () => {
      const movements = [{ id: 'movement-1' }];
      mockResolved(stockService.getMovementsByProduct, movements);

      const result = await controller.getMovementsByProduct('product-1');

      expect(stockService.getMovementsByProduct).toHaveBeenCalledWith(
        'product-1'
      );
      expect(result).toEqual(movements);
    });
  });

  describe('createMovement', () => {
    it('creates a stock movement using the provided dto', async () => {
      const dto = {
        productId: 'product-1',
        type: 'adjustment',
        quantity: 5,
        reason: 'Found extra',
      };
      const created = { id: 'movement-1', ...dto };
      mockResolved(stockService.adjustStock, created);

      const result = await controller.createMovement(dto as never);

      expect(stockService.adjustStock).toHaveBeenCalledWith(dto);
      expect(result).toEqual(created);
    });
  });
});

const mockResolved = (fn: unknown, value: unknown) => {
  (fn as unknown as jest.Mock).mockResolvedValue(value);
};
