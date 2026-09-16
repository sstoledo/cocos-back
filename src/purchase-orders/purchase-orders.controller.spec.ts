import { Reflector } from '@nestjs/core';
import { RoleName } from '@prisma/client';
import type { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import type { ListPurchaseOrdersQueryDto } from './dto/list-purchase-orders-query.dto';
import { PurchaseOrdersController } from './purchase-orders.controller';
import type { PurchaseOrdersService } from './purchase-orders.service';

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

describe('PurchaseOrdersController', () => {
  let controller: PurchaseOrdersController;
  let purchaseOrdersService: PurchaseOrdersService;

  beforeEach(() => {
    jest.clearAllMocks();
    purchaseOrdersService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
    } as unknown as PurchaseOrdersService;
    controller = new PurchaseOrdersController(purchaseOrdersService);
  });

  describe('guards', () => {
    it('applies RolesGuard to the controller', () => {
      const guards = Reflect.getMetadata(
        '__guards__',
        PurchaseOrdersController
      );
      expect(guards).toBeDefined();
      expect(guards).toHaveLength(1);
      expect(guards[0].name).toBe('RolesGuard');
    });
  });

  describe('roles (S12 partial)', () => {
    const reflector = new Reflector();
    const readRoles = [RoleName.Admin, RoleName.Purchasing, RoleName.Warehouse];

    it('restricts create to Admin and Purchasing', () => {
      const roles = reflector.getAllAndOverride<RoleName[]>('roles', [
        PurchaseOrdersController.prototype.create,
        PurchaseOrdersController,
      ]);
      expect(roles).toEqual([RoleName.Admin, RoleName.Purchasing]);
    });

    it.each(['findAll', 'findOne'] as const)(
      'allows %s for Admin, Purchasing and Warehouse',
      (method) => {
        const roles = reflector.getAllAndOverride<RoleName[]>('roles', [
          PurchaseOrdersController.prototype[method],
          PurchaseOrdersController,
        ]);
        expect(roles).toEqual(readRoles);
      }
    );
  });

  describe('create', () => {
    it('delegates to the service with the DTO', async () => {
      const dto = {
        supplierId: 'sup-1',
        lines: [
          {
            productId: 'prod-1',
            quantityOrdered: 10,
            estimatedCostPrice: '5.00',
          },
        ],
      } as CreatePurchaseOrderDto;
      (purchaseOrdersService.create as jest.Mock).mockResolvedValue({
        id: 'po-1',
      });

      const result = await controller.create(dto);

      expect(purchaseOrdersService.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual({ id: 'po-1' });
    });
  });

  describe('findAll', () => {
    it('delegates to the service with the query DTO', async () => {
      const query = { page: 2, limit: 5 } as ListPurchaseOrdersQueryDto;
      (purchaseOrdersService.findAll as jest.Mock).mockResolvedValue({
        data: [],
        meta: { page: 2, limit: 5, total: 0 },
      });

      const result = await controller.findAll(query);

      expect(purchaseOrdersService.findAll).toHaveBeenCalledWith(query);
      expect(result).toEqual({
        data: [],
        meta: { page: 2, limit: 5, total: 0 },
      });
    });
  });

  describe('findOne', () => {
    it('delegates to the service with the id', async () => {
      (purchaseOrdersService.findOne as jest.Mock).mockResolvedValue({
        id: 'po-1',
      });

      const result = await controller.findOne('po-1');

      expect(purchaseOrdersService.findOne).toHaveBeenCalledWith('po-1');
      expect(result).toEqual({ id: 'po-1' });
    });
  });
});
