import { ParseFilePipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleName } from '@prisma/client';
import { ProductsController } from './products.controller';
import type { ProductsService } from './products.service';

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

describe('ProductsController', () => {
  let controller: ProductsController;
  let productsService: ProductsService;

  beforeEach(() => {
    jest.clearAllMocks();
    productsService = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      removeImage: jest.fn(),
    } as unknown as ProductsService;
    controller = new ProductsController(productsService);
  });

  describe('guards', () => {
    it('applies RolesGuard to the controller', () => {
      const guards = Reflect.getMetadata('__guards__', ProductsController);
      expect(guards).toBeDefined();
      expect(guards).toHaveLength(1);
      expect(guards[0].name).toBe('RolesGuard');
    });
  });

  describe('roles', () => {
    const reflector = new Reflector();

    it('allows all authenticated roles for findAll', () => {
      const roles = reflector.getAllAndOverride<RoleName[]>('roles', [
        ProductsController.prototype.findAll,
        ProductsController,
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
        ProductsController.prototype.findOne,
        ProductsController,
      ]);
      expect(roles).toHaveLength(6);
    });

    it('restricts create to Admin', () => {
      const roles = reflector.getAllAndOverride<RoleName[]>('roles', [
        ProductsController.prototype.create,
        ProductsController,
      ]);
      expect(roles).toEqual([RoleName.Admin]);
    });

    it('restricts update to Admin', () => {
      const roles = reflector.getAllAndOverride<RoleName[]>('roles', [
        ProductsController.prototype.update,
        ProductsController,
      ]);
      expect(roles).toEqual([RoleName.Admin]);
    });

    it('restricts remove to Admin', () => {
      const roles = reflector.getAllAndOverride<RoleName[]>('roles', [
        ProductsController.prototype.remove,
        ProductsController,
      ]);
      expect(roles).toEqual([RoleName.Admin]);
    });

    it('restricts removeImage to Admin', () => {
      const roles = reflector.getAllAndOverride<RoleName[]>('roles', [
        ProductsController.prototype.removeImage,
        ProductsController,
      ]);
      expect(roles).toEqual([RoleName.Admin]);
    });
  });

  describe('interceptors', () => {
    it('attaches a file interceptor to create', () => {
      const interceptors = Reflect.getMetadata(
        '__interceptors__',
        ProductsController.prototype.create
      );
      expect(interceptors).toBeDefined();
      expect(interceptors).toHaveLength(1);
    });

    it('attaches a file interceptor to update', () => {
      const interceptors = Reflect.getMetadata(
        '__interceptors__',
        ProductsController.prototype.update
      );
      expect(interceptors).toBeDefined();
      expect(interceptors).toHaveLength(1);
    });
  });

  describe('file validation', () => {
    it('uses a ParseFilePipe on the create image parameter', () => {
      const args =
        Reflect.getMetadata(
          '__routeArguments__',
          ProductsController,
          'create'
        ) || {};
      const fileArg = args['8:1'];
      expect(fileArg).toBeDefined();
      expect(fileArg.pipes[0]).toBeInstanceOf(ParseFilePipe);
    });

    it('uses a ParseFilePipe on the update image parameter', () => {
      const args =
        Reflect.getMetadata(
          '__routeArguments__',
          ProductsController,
          'update'
        ) || {};
      const fileArg = args['8:2'];
      expect(fileArg).toBeDefined();
      expect(fileArg.pipes[0]).toBeInstanceOf(ParseFilePipe);
    });
  });

  describe('findAll', () => {
    it('returns the list of products from the service', async () => {
      const products = [
        { id: 'product-1', name: 'Engine oil', price: '30' },
        { id: 'product-2', name: 'Brake pads', price: '50' },
      ];
      (productsService.findAll as unknown as jest.Mock).mockResolvedValue(
        products
      );

      const result = await controller.findAll();

      expect(productsService.findAll).toHaveBeenCalled();
      expect(result).toEqual(products);
    });
  });

  describe('findOne', () => {
    it('returns the product with the requested id', async () => {
      const product = { id: 'product-1', name: 'Engine oil', price: '30' };
      (productsService.findOne as unknown as jest.Mock).mockResolvedValue(
        product
      );

      const result = await controller.findOne('product-1');

      expect(productsService.findOne).toHaveBeenCalledWith('product-1');
      expect(result).toEqual(product);
    });
  });

  describe('create', () => {
    it('creates a product using the provided dto and image', async () => {
      const dto = {
        code: 'OIL-001',
        name: 'Engine oil',
        description: 'Synthetic engine oil',
        price: 30,
        isActive: true,
        presentationId: 'pres-1',
        brandId: 'brand-1',
        categoryId: 'cat-1',
        barcode: '123456789012',
        taxRate: 21,
        notes: 'Keep away from heat sources',
      };
      const image = { buffer: Buffer.from('image') } as Express.Multer.File;
      const created = { id: 'product-1', ...dto, price: '30' };
      (productsService.create as unknown as jest.Mock).mockResolvedValue(
        created
      );

      const result = await controller.create(dto as never, image);

      expect(productsService.create).toHaveBeenCalledWith(dto, image);
      expect(result).toEqual(created);
    });
  });

  describe('update', () => {
    it('updates a product using the provided id, dto, and image', async () => {
      const dto = {
        name: 'Engine oil premium',
        brandId: 'brand-2',
        taxRate: 10.5,
      };
      const image = { buffer: Buffer.from('image') } as Express.Multer.File;
      const updated = { id: 'product-1', ...dto, price: '30' };
      (productsService.update as unknown as jest.Mock).mockResolvedValue(
        updated
      );

      const result = await controller.update('product-1', dto as never, image);

      expect(productsService.update).toHaveBeenCalledWith(
        'product-1',
        dto,
        image
      );
      expect(result).toEqual(updated);
    });
  });

  describe('remove', () => {
    it('deletes the product with the requested id', async () => {
      const removed = { id: 'product-1', name: 'Engine oil' };
      (productsService.remove as unknown as jest.Mock).mockResolvedValue(
        removed
      );

      const result = await controller.remove('product-1');

      expect(productsService.remove).toHaveBeenCalledWith('product-1');
      expect(result).toEqual(removed);
    });
  });

  describe('removeImage', () => {
    it('removes the image of the product with the requested id', async () => {
      const updated = { id: 'product-1', name: 'Engine oil' };
      (productsService.removeImage as unknown as jest.Mock).mockResolvedValue(
        updated
      );

      const result = await controller.removeImage('product-1');

      expect(productsService.removeImage).toHaveBeenCalledWith('product-1');
      expect(result).toEqual(updated);
    });
  });
});
