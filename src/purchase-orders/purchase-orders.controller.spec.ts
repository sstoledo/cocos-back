import { Reflector } from '@nestjs/core';
import { RoleName } from '@prisma/client';
import type { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import type { ListPurchaseOrdersQueryDto } from './dto/list-purchase-orders-query.dto';
import type { ReceivePurchaseOrderDto } from './dto/receive-purchase-order.dto';
import type { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto';
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
      updateDraft: jest.fn(),
      order: jest.fn(),
      cancel: jest.fn(),
      receive: jest.fn(),
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

    it.each(['updateDraft', 'order', 'cancel'] as const)(
      'restricts %s to Admin and Purchasing (S12 partial)',
      (method) => {
        const roles = reflector.getAllAndOverride<RoleName[]>('roles', [
          PurchaseOrdersController.prototype[method],
          PurchaseOrdersController,
        ]);
        expect(roles).toEqual([RoleName.Admin, RoleName.Purchasing]);
      }
    );

    it('allows receive for Admin, Purchasing and Warehouse (S12 partial)', () => {
      const roles = reflector.getAllAndOverride<RoleName[]>('roles', [
        PurchaseOrdersController.prototype.receive,
        PurchaseOrdersController,
      ]);
      expect(roles).toEqual(readRoles);
    });
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

  describe('updateDraft', () => {
    it('delegates to the service with the id and DTO', async () => {
      const dto = {
        lines: [
          {
            productId: 'prod-1',
            quantityOrdered: 15,
            estimatedCostPrice: '5.00',
          },
        ],
      } as UpdatePurchaseOrderDto;
      (purchaseOrdersService.updateDraft as jest.Mock).mockResolvedValue({
        id: 'po-1',
      });

      const result = await controller.updateDraft('po-1', dto);

      expect(purchaseOrdersService.updateDraft).toHaveBeenCalledWith(
        'po-1',
        dto
      );
      expect(result).toEqual({ id: 'po-1' });
    });
  });

  describe('order', () => {
    it('delegates to the service with the id', async () => {
      (purchaseOrdersService.order as jest.Mock).mockResolvedValue({
        id: 'po-1',
        status: 'ordered',
      });

      const result = await controller.order('po-1');

      expect(purchaseOrdersService.order).toHaveBeenCalledWith('po-1');
      expect(result).toEqual({ id: 'po-1', status: 'ordered' });
    });
  });

  describe('cancel', () => {
    it('delegates to the service with the id', async () => {
      (purchaseOrdersService.cancel as jest.Mock).mockResolvedValue({
        id: 'po-1',
        status: 'cancelled',
      });

      const result = await controller.cancel('po-1');

      expect(purchaseOrdersService.cancel).toHaveBeenCalledWith('po-1');
      expect(result).toEqual({ id: 'po-1', status: 'cancelled' });
    });
  });

  describe('receive', () => {
    it('delegates to the service with the id and DTO (S8)', async () => {
      const dto = {
        lines: [
          {
            lineId: 'line-1',
            receivedQty: 10,
            expirationDate: '2027-06-01T00:00:00.000Z',
            actualCostPrice: '5.50',
          },
        ],
      } as ReceivePurchaseOrderDto;
      (purchaseOrdersService.receive as jest.Mock).mockResolvedValue({
        id: 'po-1',
        status: 'received',
        lotIds: ['lot-1'],
      });

      const result = await controller.receive('po-1', dto);

      expect(purchaseOrdersService.receive).toHaveBeenCalledWith('po-1', dto);
      expect(result).toEqual({
        id: 'po-1',
        status: 'received',
        lotIds: ['lot-1'],
      });
    });
  });
});
