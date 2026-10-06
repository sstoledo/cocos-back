import { Reflector } from '@nestjs/core';
import { RoleName } from '@prisma/client';
import { SuppliersController } from './suppliers.controller';
import type { SuppliersService } from './suppliers.service';

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

describe('SuppliersController', () => {
  let controller: SuppliersController;
  let suppliersService: SuppliersService;

  beforeEach(() => {
    jest.clearAllMocks();
    suppliersService = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    } as unknown as SuppliersService;
    controller = new SuppliersController(suppliersService);
  });

  describe('guards', () => {
    it('applies RolesGuard to the controller', () => {
      const guards = Reflect.getMetadata('__guards__', SuppliersController);
      expect(guards).toBeDefined();
      expect(guards).toHaveLength(1);
      expect(guards[0].name).toBe('RolesGuard');
    });
  });

  describe('roles', () => {
    const reflector = new Reflector();

    it('allows all authenticated roles for findAll', () => {
      const roles = reflector.getAllAndOverride<RoleName[]>('roles', [
        SuppliersController.prototype.findAll,
        SuppliersController,
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
        SuppliersController.prototype.findOne,
        SuppliersController,
      ]);
      expect(roles).toHaveLength(6);
    });

    it('restricts create to Admin and Purchasing', () => {
      const roles = reflector.getAllAndOverride<RoleName[]>('roles', [
        SuppliersController.prototype.create,
        SuppliersController,
      ]);
      expect(roles).toEqual([RoleName.Admin, RoleName.Purchasing]);
    });

    it('restricts update to Admin and Purchasing', () => {
      const roles = reflector.getAllAndOverride<RoleName[]>('roles', [
        SuppliersController.prototype.update,
        SuppliersController,
      ]);
      expect(roles).toEqual([RoleName.Admin, RoleName.Purchasing]);
    });

    it('restricts remove to Admin and Purchasing', () => {
      const roles = reflector.getAllAndOverride<RoleName[]>('roles', [
        SuppliersController.prototype.remove,
        SuppliersController,
      ]);
      expect(roles).toEqual([RoleName.Admin, RoleName.Purchasing]);
    });
  });

  describe('findAll', () => {
    it('returns the paginated list of suppliers from the service', async () => {
      const paginatedResult = {
        data: [
          { id: 'supplier-1', name: 'Shell', isActive: true },
          { id: 'supplier-2', name: 'Acme Parts', isActive: true },
        ],
        meta: { page: 1, limit: 10, total: 2 },
      };
      (suppliersService.findAll as unknown as jest.Mock).mockResolvedValue(
        paginatedResult
      );

      const result = await controller.findAll({});

      expect(suppliersService.findAll).toHaveBeenCalledWith({});
      expect(result).toEqual(paginatedResult);
    });
  });

  describe('findOne', () => {
    it('returns the supplier with the requested id', async () => {
      const supplier = { id: 'supplier-1', name: 'Shell' };
      (suppliersService.findOne as unknown as jest.Mock).mockResolvedValue(
        supplier
      );

      const result = await controller.findOne('supplier-1');

      expect(suppliersService.findOne).toHaveBeenCalledWith('supplier-1');
      expect(result).toEqual(supplier);
    });
  });

  describe('create', () => {
    it('creates a supplier using the provided dto', async () => {
      const dto = {
        name: 'Shell',
        phone: '555-0100',
        email: 'shell@example.com',
        address: '123 Main St',
      };
      const created = { id: 'supplier-1', ...dto };
      (suppliersService.create as unknown as jest.Mock).mockResolvedValue(
        created
      );

      const result = await controller.create(dto as never);

      expect(suppliersService.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(created);
    });
  });

  describe('update', () => {
    it('updates a supplier using the provided id and dto', async () => {
      const dto = { name: 'Shell Updated' };
      const updated = { id: 'supplier-1', ...dto };
      (suppliersService.update as unknown as jest.Mock).mockResolvedValue(
        updated
      );

      const result = await controller.update('supplier-1', dto as never);

      expect(suppliersService.update).toHaveBeenCalledWith('supplier-1', dto);
      expect(result).toEqual(updated);
    });
  });

  describe('remove', () => {
    it('deletes the supplier with the requested id', async () => {
      const removed = { id: 'supplier-1', name: 'Shell' };
      (suppliersService.remove as unknown as jest.Mock).mockResolvedValue(
        removed
      );

      const result = await controller.remove('supplier-1');

      expect(suppliersService.remove).toHaveBeenCalledWith('supplier-1');
      expect(result).toEqual(removed);
    });
  });
});
