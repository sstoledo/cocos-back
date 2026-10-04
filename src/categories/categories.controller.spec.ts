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
      findOne: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
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

    it('allows all authenticated roles for findOne', () => {
      const roles = reflector.getAllAndOverride<RoleName[]>('roles', [
        CategoriesController.prototype.findOne,
        CategoriesController,
      ]);
      expect(roles).toHaveLength(6);
    });

    it('restricts create to Admin', () => {
      const roles = reflector.getAllAndOverride<RoleName[]>('roles', [
        CategoriesController.prototype.create,
        CategoriesController,
      ]);
      expect(roles).toEqual([RoleName.Admin]);
    });

    it('restricts update to Admin', () => {
      const roles = reflector.getAllAndOverride<RoleName[]>('roles', [
        CategoriesController.prototype.update,
        CategoriesController,
      ]);
      expect(roles).toEqual([RoleName.Admin]);
    });

    it('restricts remove to Admin', () => {
      const roles = reflector.getAllAndOverride<RoleName[]>('roles', [
        CategoriesController.prototype.remove,
        CategoriesController,
      ]);
      expect(roles).toEqual([RoleName.Admin]);
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

  describe('findOne', () => {
    it('returns the category with the requested id', async () => {
      const category = {
        id: 'cat-1',
        name: 'Repuestos',
        parentId: 'cat-2',
        parent: { id: 'cat-2', name: 'Lubricantes' },
      };
      (categoriesService.findOne as unknown as jest.Mock).mockResolvedValue(
        category
      );

      const result = await controller.findOne('cat-1');

      expect(categoriesService.findOne).toHaveBeenCalledWith('cat-1');
      expect(result).toEqual(category);
    });
  });

  describe('create', () => {
    it('creates a category using the provided dto', async () => {
      const dto = { name: 'Repuestos', parentId: 'cat-2' };
      const created = { id: 'cat-1', ...dto, parent: null };
      (categoriesService.create as unknown as jest.Mock).mockResolvedValue(
        created
      );

      const result = await controller.create(dto as never);

      expect(categoriesService.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(created);
    });
  });

  describe('update', () => {
    it('updates a category using the provided id and dto', async () => {
      const dto = { name: 'Repuestos Updated', parentId: 'cat-2' };
      const updated = { id: 'cat-1', ...dto, parent: null };
      (categoriesService.update as unknown as jest.Mock).mockResolvedValue(
        updated
      );

      const result = await controller.update('cat-1', dto as never);

      expect(categoriesService.update).toHaveBeenCalledWith('cat-1', dto);
      expect(result).toEqual(updated);
    });
  });

  describe('remove', () => {
    it('deletes the category with the requested id', async () => {
      const removed = { id: 'cat-1', name: 'Repuestos' };
      (categoriesService.remove as unknown as jest.Mock).mockResolvedValue(
        removed
      );

      const result = await controller.remove('cat-1');

      expect(categoriesService.remove).toHaveBeenCalledWith('cat-1');
      expect(result).toEqual(removed);
    });
  });
});
