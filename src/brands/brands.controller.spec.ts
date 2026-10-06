import { Reflector } from '@nestjs/core';
import { RoleName } from '@prisma/client';
import { BrandsController } from './brands.controller';
import type { BrandsService } from './brands.service';

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

describe('BrandsController', () => {
  let controller: BrandsController;
  let brandsService: BrandsService;

  beforeEach(() => {
    jest.clearAllMocks();
    brandsService = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    } as unknown as BrandsService;
    controller = new BrandsController(brandsService);
  });

  describe('guards', () => {
    it('applies RolesGuard to the controller', () => {
      const guards = Reflect.getMetadata('__guards__', BrandsController);
      expect(guards).toBeDefined();
      expect(guards).toHaveLength(1);
      expect(guards[0].name).toBe('RolesGuard');
    });
  });

  describe('roles', () => {
    const reflector = new Reflector();

    it('allows all authenticated roles for findAll', () => {
      const roles = reflector.getAllAndOverride<RoleName[]>('roles', [
        BrandsController.prototype.findAll,
        BrandsController,
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
        BrandsController.prototype.findOne,
        BrandsController,
      ]);
      expect(roles).toHaveLength(6);
    });

    it('restricts create to Admin', () => {
      const roles = reflector.getAllAndOverride<RoleName[]>('roles', [
        BrandsController.prototype.create,
        BrandsController,
      ]);
      expect(roles).toEqual([RoleName.Admin]);
    });

    it('restricts update to Admin', () => {
      const roles = reflector.getAllAndOverride<RoleName[]>('roles', [
        BrandsController.prototype.update,
        BrandsController,
      ]);
      expect(roles).toEqual([RoleName.Admin]);
    });

    it('restricts remove to Admin', () => {
      const roles = reflector.getAllAndOverride<RoleName[]>('roles', [
        BrandsController.prototype.remove,
        BrandsController,
      ]);
      expect(roles).toEqual([RoleName.Admin]);
    });
  });

  describe('findAll', () => {
    it('returns the paginated list of brands from the service', async () => {
      const paginatedResult = {
        data: [
          { id: 'brand-1', name: 'Shell' },
          { id: 'brand-2', name: 'Mobil' },
        ],
        meta: { page: 1, limit: 10, total: 2 },
      };
      (brandsService.findAll as unknown as jest.Mock).mockResolvedValue(
        paginatedResult
      );

      const result = await controller.findAll({});

      expect(brandsService.findAll).toHaveBeenCalledWith({});
      expect(result).toEqual(paginatedResult);
    });
  });

  describe('findOne', () => {
    it('returns the brand with the requested id', async () => {
      const brand = { id: 'brand-1', name: 'Shell' };
      (brandsService.findOne as unknown as jest.Mock).mockResolvedValue(brand);

      const result = await controller.findOne('brand-1');

      expect(brandsService.findOne).toHaveBeenCalledWith('brand-1');
      expect(result).toEqual(brand);
    });
  });

  describe('create', () => {
    it('creates a brand using the provided dto', async () => {
      const dto = { name: 'Shell' };
      const created = { id: 'brand-1', ...dto };
      (brandsService.create as unknown as jest.Mock).mockResolvedValue(created);

      const result = await controller.create(dto as never);

      expect(brandsService.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(created);
    });
  });

  describe('update', () => {
    it('updates a brand using the provided id and dto', async () => {
      const dto = { name: 'Shell Updated' };
      const updated = { id: 'brand-1', ...dto };
      (brandsService.update as unknown as jest.Mock).mockResolvedValue(updated);

      const result = await controller.update('brand-1', dto as never);

      expect(brandsService.update).toHaveBeenCalledWith('brand-1', dto);
      expect(result).toEqual(updated);
    });
  });

  describe('remove', () => {
    it('deletes the brand with the requested id', async () => {
      const removed = { id: 'brand-1', name: 'Shell' };
      (brandsService.remove as unknown as jest.Mock).mockResolvedValue(removed);

      const result = await controller.remove('brand-1');

      expect(brandsService.remove).toHaveBeenCalledWith('brand-1');
      expect(result).toEqual(removed);
    });
  });
});
