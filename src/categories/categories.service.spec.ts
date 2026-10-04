import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { CategoriesService } from './categories.service';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let prisma: PrismaService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      category: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    } as unknown as PrismaService;
    service = new CategoriesService(prisma);
  });

  describe('findAll', () => {
    it('returns all categories ordered by name with parent included', async () => {
      const categories = [
        {
          id: 'cat-2',
          name: 'Lubricantes',
          parentId: null,
          parent: null,
        },
        {
          id: 'cat-1',
          name: 'Repuestos',
          parentId: 'cat-2',
          parent: { id: 'cat-2', name: 'Lubricantes' },
        },
      ];
      (prisma.category.findMany as unknown as jest.Mock).mockResolvedValue(
        categories
      );

      const result = await service.findAll();

      expect(prisma.category.findMany).toHaveBeenCalledWith({
        orderBy: { name: 'asc' },
        include: { parent: true },
      });
      expect(result).toEqual(categories);
    });
  });

  describe('findOne', () => {
    it('returns the category with the requested id and parent included', async () => {
      const category = {
        id: 'cat-1',
        name: 'Repuestos',
        parentId: 'cat-2',
        parent: { id: 'cat-2', name: 'Lubricantes' },
      };
      (prisma.category.findUnique as unknown as jest.Mock).mockResolvedValue(
        category
      );

      const result = await service.findOne('cat-1');

      expect(prisma.category.findUnique).toHaveBeenCalledWith({
        where: { id: 'cat-1' },
        include: { parent: true },
      });
      expect(result).toEqual(category);
    });

    it('throws NotFoundException when the category does not exist', async () => {
      (prisma.category.findUnique as unknown as jest.Mock).mockResolvedValue(
        null
      );

      await expect(service.findOne('non-existent-id')).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('create', () => {
    it('creates a category with the provided data and includes parent', async () => {
      const dto = { name: 'Repuestos', parentId: 'cat-2' };
      const created = {
        id: 'cat-1',
        ...dto,
        parent: { id: 'cat-2', name: 'Lubricantes' },
      };
      (prisma.category.create as unknown as jest.Mock).mockResolvedValue(
        created
      );

      const result = await service.create(dto);

      expect(prisma.category.create).toHaveBeenCalledWith({
        data: dto,
        include: { parent: true },
      });
      expect(result).toEqual(created);
    });

    it('throws ConflictException when name already exists', async () => {
      const dto = { name: 'Repuestos' };
      const error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint',
        {
          code: 'P2002',
          clientVersion: '6.0.0',
        }
      );
      (prisma.category.create as unknown as jest.Mock).mockRejectedValue(error);

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('updates a category and includes parent', async () => {
      const dto = { name: 'Repuestos Updated', parentId: 'cat-2' };
      const updated = {
        id: 'cat-1',
        ...dto,
        parent: { id: 'cat-2', name: 'Lubricantes' },
      };
      (prisma.category.findUnique as unknown as jest.Mock).mockResolvedValue({
        id: 'cat-1',
      });
      (prisma.category.update as unknown as jest.Mock).mockResolvedValue(
        updated
      );

      const result = await service.update('cat-1', dto);

      expect(prisma.category.findUnique).toHaveBeenCalledWith({
        where: { id: 'cat-1' },
        include: { parent: true },
      });
      expect(prisma.category.update).toHaveBeenCalledWith({
        where: { id: 'cat-1' },
        data: dto,
        include: { parent: true },
      });
      expect(result).toEqual(updated);
    });

    it('throws NotFoundException when the category does not exist', async () => {
      (prisma.category.findUnique as unknown as jest.Mock).mockResolvedValue(
        null
      );

      await expect(
        service.update('non-existent-id', { name: 'X' })
      ).rejects.toThrow(NotFoundException);
      expect(prisma.category.update).not.toHaveBeenCalled();
    });

    it('throws ConflictException when name already exists', async () => {
      const dto = { name: 'Existing' };
      (prisma.category.findUnique as unknown as jest.Mock).mockResolvedValue({
        id: 'cat-1',
      });
      const error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint',
        {
          code: 'P2002',
          clientVersion: '6.0.0',
        }
      );
      (prisma.category.update as unknown as jest.Mock).mockRejectedValue(error);

      await expect(service.update('cat-1', dto)).rejects.toThrow(
        ConflictException
      );
    });
  });

  describe('remove', () => {
    it('deletes a category', async () => {
      const deleted = { id: 'cat-1', name: 'Repuestos' };
      (prisma.category.findUnique as unknown as jest.Mock).mockResolvedValue({
        id: 'cat-1',
      });
      (prisma.category.delete as unknown as jest.Mock).mockResolvedValue(
        deleted
      );

      const result = await service.remove('cat-1');

      expect(prisma.category.findUnique).toHaveBeenCalledWith({
        where: { id: 'cat-1' },
        include: { parent: true },
      });
      expect(prisma.category.delete).toHaveBeenCalledWith({
        where: { id: 'cat-1' },
      });
      expect(result).toEqual(deleted);
      expect(prisma.category.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the category does not exist', async () => {
      (prisma.category.findUnique as unknown as jest.Mock).mockResolvedValue(
        null
      );

      await expect(service.remove('non-existent-id')).rejects.toThrow(
        NotFoundException
      );
      expect(prisma.category.delete).not.toHaveBeenCalled();
      expect(prisma.category.update).not.toHaveBeenCalled();
    });
  });
});
