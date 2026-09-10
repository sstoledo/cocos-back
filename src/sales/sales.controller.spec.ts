import { Reflector } from '@nestjs/core';
import { PaymentMethod, RoleName } from '@prisma/client';
import type { CreateSaleDto } from './dto/create-sale.dto';
import type { ListSalesQueryDto } from './dto/list-sales-query.dto';
import { SalesController } from './sales.controller';
import type { SalesService } from './sales.service';

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

describe('SalesController', () => {
  let controller: SalesController;
  let salesService: SalesService;

  beforeEach(() => {
    jest.clearAllMocks();
    salesService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      cancelSale: jest.fn(),
    } as unknown as SalesService;
    controller = new SalesController(salesService);
  });

  describe('guards', () => {
    it('applies RolesGuard to the controller', () => {
      const guards = Reflect.getMetadata('__guards__', SalesController);
      expect(guards).toBeDefined();
      expect(guards).toHaveLength(1);
      expect(guards[0].name).toBe('RolesGuard');
    });
  });

  describe('roles', () => {
    const reflector = new Reflector();
    const expectedRoles = [RoleName.Admin, RoleName.Reception];

    it.each(['create', 'findAll', 'findOne', 'cancelSale'] as const)(
      'restricts %s to Admin and Reception (Mechanic 403)',
      (method) => {
        const roles = reflector.getAllAndOverride<RoleName[]>('roles', [
          SalesController.prototype[method],
          SalesController,
        ]);
        expect(roles).toEqual(expectedRoles);
      }
    );
  });

  describe('create', () => {
    it('delegates to the service with the DTO', async () => {
      const dto = {
        paymentMethod: PaymentMethod.cash,
        productLines: [{ productId: 'prod-1', quantity: 1 }],
      } as CreateSaleDto;
      (salesService.create as jest.Mock).mockResolvedValue({ id: 'sale-1' });

      const result = await controller.create(dto);

      expect(salesService.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual({ id: 'sale-1' });
    });
  });

  describe('findAll', () => {
    it('delegates to the service with the query DTO', async () => {
      const query = { page: 2, limit: 5 } as ListSalesQueryDto;
      (salesService.findAll as jest.Mock).mockResolvedValue({
        data: [],
        meta: { page: 2, limit: 5, total: 0 },
      });

      const result = await controller.findAll(query);

      expect(salesService.findAll).toHaveBeenCalledWith(query);
      expect(result).toEqual({
        data: [],
        meta: { page: 2, limit: 5, total: 0 },
      });
    });
  });

  describe('findOne', () => {
    it('delegates to the service with the id', async () => {
      (salesService.findOne as jest.Mock).mockResolvedValue({ id: 'sale-1' });

      const result = await controller.findOne('sale-1');

      expect(salesService.findOne).toHaveBeenCalledWith('sale-1');
      expect(result).toEqual({ id: 'sale-1' });
    });
  });

  describe('cancelSale', () => {
    it('delegates to the service with the id', async () => {
      (salesService.cancelSale as jest.Mock).mockResolvedValue({
        id: 'sale-1',
        status: 'cancelled',
      });

      const result = await controller.cancelSale('sale-1');

      expect(salesService.cancelSale).toHaveBeenCalledWith('sale-1');
      expect(result).toEqual({ id: 'sale-1', status: 'cancelled' });
    });
  });
});
