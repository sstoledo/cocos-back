import { RoleName } from '@prisma/client';
import type { ProductsService } from './products.service';
import { ProductsController } from './products.controller';

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
    } as unknown as ProductsService;
    controller = new ProductsController(productsService);
  });

  describe('findAll', () => {
    it('returns the list of products from the service', async () => {
      const products = [
        { id: 'product-1', name: 'Engine oil' },
        { id: 'product-2', name: 'Brake pads' },
      ];
      (productsService.findAll as unknown as jest.Mock).mockResolvedValue(products);

      const result = await controller.findAll();

      expect(productsService.findAll).toHaveBeenCalled();
      expect(result).toEqual(products);
    });
  });

  describe('findOne', () => {
    it('returns the product with the requested id', async () => {
      const product = { id: 'product-1', name: 'Engine oil' };
      (productsService.findOne as unknown as jest.Mock).mockResolvedValue(product);

      const result = await controller.findOne('product-1');

      expect(productsService.findOne).toHaveBeenCalledWith('product-1');
      expect(result).toEqual(product);
    });
  });

  describe('create', () => {
    it('creates a product using the provided dto', async () => {
      const dto = {
        code: 'OIL-001',
        name: 'Engine oil',
        description: 'Synthetic engine oil',
        price: 30,
        minStock: 10,
        unit: 'liter',
        isActive: true,
      };
      const created = { id: 'product-1', ...dto };
      (productsService.create as unknown as jest.Mock).mockResolvedValue(created);

      const result = await controller.create(dto as never);

      expect(productsService.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(created);
    });
  });

  describe('update', () => {
    it('updates a product using the provided id and dto', async () => {
      const dto = { name: 'Engine oil premium' };
      const updated = { id: 'product-1', ...dto };
      (productsService.update as unknown as jest.Mock).mockResolvedValue(updated);

      const result = await controller.update('product-1', dto as never);

      expect(productsService.update).toHaveBeenCalledWith('product-1', dto);
      expect(result).toEqual(updated);
    });
  });

  describe('remove', () => {
    it('deletes the product with the requested id', async () => {
      const removed = { id: 'product-1', name: 'Engine oil' };
      (productsService.remove as unknown as jest.Mock).mockResolvedValue(removed);

      const result = await controller.remove('product-1');

      expect(productsService.remove).toHaveBeenCalledWith('product-1');
      expect(result).toEqual(removed);
    });
  });
});
