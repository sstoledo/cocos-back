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
  });

  describe('findAll', () => {
    it('returns the list of brands from the service', async () => {
      const brands = [
        { id: 'brand-1', name: 'Shell' },
        { id: 'brand-2', name: 'Mobil' },
      ];
      (brandsService.findAll as unknown as jest.Mock).mockResolvedValue(brands);

      const result = await controller.findAll();

      expect(brandsService.findAll).toHaveBeenCalled();
      expect(result).toEqual(brands);
    });
  });
});
