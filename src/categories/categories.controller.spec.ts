import { Reflector } from '@nestjs/core';
import { RoleName } from '@prisma/client';
import { CategoriesController } from './categories.controller';
import type { CategoriesService } from './categories.service';

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

describe('CategoriesController', () => {
  let controller: CategoriesController;
  let categoriesService: CategoriesService;

  beforeEach(() => {
    jest.clearAllMocks();
    categoriesService = {
      findAll: jest.fn(),
    } as unknown as CategoriesService;
    controller = new CategoriesController(categoriesService);
  });

  describe('guards', () => {
    it('applies RolesGuard to the controller', () => {
      const guards = Reflect.getMetadata('__guards__', CategoriesController);
      expect(guards).toBeDefined();
      expect(guards).toHaveLength(1);
      expect(guards[0].name).toBe('RolesGuard');
    });
  });

  describe('roles', () => {
    const reflector = new Reflector();

    it('allows all authenticated roles for findAll', () => {
      const roles = reflector.getAllAndOverride<RoleName[]>('roles', [
        CategoriesController.prototype.findAll,
        CategoriesController,
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
    it('returns the list of categories from the service', async () => {
      const categories = [
        { id: 'cat-1', name: 'Repuestos', parentId: 'cat-2', parent: null },
        { id: 'cat-2', name: 'Lubricantes', parentId: null, parent: null },
      ];
      (categoriesService.findAll as unknown as jest.Mock).mockResolvedValue(
        categories
      );

      const result = await controller.findAll();

      expect(categoriesService.findAll).toHaveBeenCalled();
      expect(result).toEqual(categories);
    });
  });
});
