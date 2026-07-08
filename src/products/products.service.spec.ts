import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { ProductsService } from './products.service';

describe('ProductsService', () => {
  let service: ProductsService;
  let prisma: PrismaService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      product: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    } as unknown as PrismaService;
    service = new ProductsService(prisma);
  });

  describe('findAll', () => {
    it('returns all products ordered by name ascending', async () => {
      const products = [
        { id: 'product-2', name: 'Brake pads', price: 50 },
        { id: 'product-1', name: 'Engine oil', price: 30 },
      ];
      (prisma.product.findMany as unknown as jest.Mock).mockResolvedValue(
        products
      );

      const result = await service.findAll();

      expect(prisma.product.findMany).toHaveBeenCalledWith({
        orderBy: { name: 'asc' },
      });
      expect(result).toEqual(products);
    });
  });

  describe('findOne', () => {
    it('returns a product by id', async () => {
      const product = { id: 'product-1', name: 'Engine oil', price: 30 };
      (prisma.product.findUnique as unknown as jest.Mock).mockResolvedValue(
        product
      );

      const result = await service.findOne('product-1');

      expect(prisma.product.findUnique).toHaveBeenCalledWith({
        where: { id: 'product-1' },
      });
      expect(result).toEqual(product);
    });
  });

  describe('create', () => {
    it('creates a product with the provided data', async () => {
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
      (prisma.product.create as unknown as jest.Mock).mockResolvedValue(
        created
      );

      const result = await service.create(dto as never);

      expect(prisma.product.create).toHaveBeenCalledWith({ data: dto });
      expect(result).toEqual(created);
    });
  });

  describe('update', () => {
    it('updates a product when it exists', async () => {
      const existing = { id: 'product-1', name: 'Engine oil', price: 30 };
      const dto = { name: 'Engine oil premium' };
      const updated = { ...existing, ...dto };
      (prisma.product.findUnique as unknown as jest.Mock).mockResolvedValue(
        existing
      );
      (prisma.product.update as unknown as jest.Mock).mockResolvedValue(
        updated
      );

      const result = await service.update('product-1', dto as never);

      expect(prisma.product.findUnique).toHaveBeenCalledWith({
        where: { id: 'product-1' },
      });
      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: 'product-1' },
        data: dto,
      });
      expect(result).toEqual(updated);
    });

    it('throws NotFoundException when the product does not exist', async () => {
      (prisma.product.findUnique as unknown as jest.Mock).mockResolvedValue(
        null
      );

      await expect(service.update('missing-id', {} as never)).rejects.toThrow(
        NotFoundException
      );
      expect(prisma.product.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deletes a product when it exists', async () => {
      const existing = { id: 'product-1', name: 'Engine oil' };
      (prisma.product.findUnique as unknown as jest.Mock).mockResolvedValue(
        existing
      );
      (prisma.product.delete as unknown as jest.Mock).mockResolvedValue(
        existing
      );

      const result = await service.remove('product-1');

      expect(prisma.product.findUnique).toHaveBeenCalledWith({
        where: { id: 'product-1' },
      });
      expect(prisma.product.delete).toHaveBeenCalledWith({
        where: { id: 'product-1' },
      });
      expect(result).toEqual(existing);
    });

    it('throws NotFoundException when the product does not exist', async () => {
      (prisma.product.findUnique as unknown as jest.Mock).mockResolvedValue(
        null
      );

      await expect(service.remove('missing-id')).rejects.toThrow(
        NotFoundException
      );
      expect(prisma.product.delete).not.toHaveBeenCalled();
    });
  });
});
