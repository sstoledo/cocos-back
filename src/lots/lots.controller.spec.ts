import { Reflector } from '@nestjs/core';
import { RoleName } from '@prisma/client';
import { LotsController } from './lots.controller';
import type { LotsService } from './lots.service';

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

describe('LotsController', () => {
  let controller: LotsController;
  let lotsService: LotsService;

  beforeEach(() => {
    jest.clearAllMocks();
    lotsService = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    } as unknown as LotsService;
    controller = new LotsController(lotsService);
  });

  describe('guards', () => {
    it('applies RolesGuard to the controller', () => {
      const guards = Reflect.getMetadata('__guards__', LotsController);
      expect(guards).toBeDefined();
      expect(guards).toHaveLength(1);
      expect(guards[0].name).toBe('RolesGuard');
    });
  });

  describe('roles', () => {
    const reflector = new Reflector();

    it('allows all authenticated roles for findAll', () => {
      const roles = reflector.getAllAndOverride<RoleName[]>('roles', [
        LotsController.prototype.findAll,
        LotsController,
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

    it('allows all authenticated roles for findOne', () => {
      const roles = reflector.getAllAndOverride<RoleName[]>('roles', [
        LotsController.prototype.findOne,
        LotsController,
      ]);
      expect(roles).toHaveLength(6);
    });

    it('restricts create to Admin, Purchasing and Warehouse', () => {
      const roles = reflector.getAllAndOverride<RoleName[]>('roles', [
        LotsController.prototype.create,
        LotsController,
      ]);
      expect(roles).toEqual([
        RoleName.Admin,
        RoleName.Purchasing,
        RoleName.Warehouse,
      ]);
    });

    it('restricts update to Admin, Purchasing and Warehouse', () => {
      const roles = reflector.getAllAndOverride<RoleName[]>('roles', [
        LotsController.prototype.update,
        LotsController,
      ]);
      expect(roles).toEqual([
        RoleName.Admin,
        RoleName.Purchasing,
        RoleName.Warehouse,
      ]);
    });

    it('restricts remove to Admin and Warehouse', () => {
      const roles = reflector.getAllAndOverride<RoleName[]>('roles', [
        LotsController.prototype.remove,
        LotsController,
      ]);
      expect(roles).toEqual([RoleName.Admin, RoleName.Warehouse]);
    });
  });

  describe('findAll', () => {
    it('returns the list of lots from the service', async () => {
      const lots = [
        { id: 'lot-1', lotNumber: 'LOT-001' },
        { id: 'lot-2', lotNumber: 'LOT-002' },
      ];
      (lotsService.findAll as unknown as jest.Mock).mockResolvedValue(lots);

      const result = await controller.findAll();

      expect(lotsService.findAll).toHaveBeenCalled();
      expect(result).toEqual(lots);
    });
  });

  describe('findOne', () => {
    it('returns the lot with the requested id', async () => {
      const lot = { id: 'lot-1', lotNumber: 'LOT-001' };
      (lotsService.findOne as unknown as jest.Mock).mockResolvedValue(lot);

      const result = await controller.findOne('lot-1');

      expect(lotsService.findOne).toHaveBeenCalledWith('lot-1');
      expect(result).toEqual(lot);
    });
  });

  describe('create', () => {
    it('creates a lot using the provided dto', async () => {
      const dto = {
        lotNumber: 'LOT-001',
        supplierId: 'supplier-1',
        items: [
          {
            productId: 'product-1',
            quantity: 5,
            costPrice: 10.5,
            expirationDate: new Date('2026-12-31'),
          },
        ],
      };
      const created = { id: 'lot-1', ...dto };
      (lotsService.create as unknown as jest.Mock).mockResolvedValue(created);

      const result = await controller.create(dto as never);

      expect(lotsService.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(created);
    });
  });

  describe('update', () => {
    it('updates a lot using the provided id and dto', async () => {
      const dto = { lotNumber: 'LOT-002' };
      const updated = { id: 'lot-1', ...dto };
      (lotsService.update as unknown as jest.Mock).mockResolvedValue(updated);

      const result = await controller.update('lot-1', dto as never);

      expect(lotsService.update).toHaveBeenCalledWith('lot-1', dto);
      expect(result).toEqual(updated);
    });
  });

  describe('remove', () => {
    it('deletes the lot with the requested id', async () => {
      const removed = { id: 'lot-1', lotNumber: 'LOT-001' };
      (lotsService.remove as unknown as jest.Mock).mockResolvedValue(removed);

      const result = await controller.remove('lot-1');

      expect(lotsService.remove).toHaveBeenCalledWith('lot-1');
      expect(result).toEqual(removed);
    });
  });
});
