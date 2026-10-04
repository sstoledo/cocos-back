import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { BrandsService } from './brands.service';

describe('BrandsService', () => {
  let service: BrandsService;
  let prisma: PrismaService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      brand: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    } as unknown as PrismaService;
    service = new BrandsService(prisma);
  });

  describe('findAll', () => {
    it('returns all brands ordered by name', async () => {
      const brands = [
        { id: 'brand-2', name: 'Mobil' },
        { id: 'brand-1', name: 'Shell' },
      ];
      (prisma.brand.findMany as unknown as jest.Mock).mockResolvedValue(brands);

      const result = await service.findAll();

      expect(prisma.brand.findMany).toHaveBeenCalledWith({
        orderBy: { name: 'asc' },
      });
      expect(result).toEqual(brands);
    });
  });

  describe('findOne', () => {
    it('returns the brand with the requested id', async () => {
      const brand = { id: 'brand-1', name: 'Shell' };
      (prisma.brand.findUnique as unknown as jest.Mock).mockResolvedValue(
        brand
      );

      const result = await service.findOne('brand-1');

      expect(prisma.brand.findUnique).toHaveBeenCalledWith({
        where: { id: 'brand-1' },
      });
      expect(result).toEqual(brand);
    });

    it('throws NotFoundException when the brand does not exist', async () => {
      (prisma.brand.findUnique as unknown as jest.Mock).mockResolvedValue(null);

      await expect(service.findOne('non-existent-id')).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('create', () => {
    it('creates a brand with the provided data', async () => {
      const dto = { name: 'Shell' };
      const created = { id: 'brand-1', ...dto };
      (prisma.brand.create as unknown as jest.Mock).mockResolvedValue(created);

      const result = await service.create(dto);

      expect(prisma.brand.create).toHaveBeenCalledWith({ data: dto });
      expect(result).toEqual(created);
    });

    it('throws ConflictException when name already exists', async () => {
      const dto = { name: 'Shell' };
      const error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint',
        {
          code: 'P2002',
          clientVersion: '6.0.0',
        }
      );
      (prisma.brand.create as unknown as jest.Mock).mockRejectedValue(error);

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('updates a brand', async () => {
      const dto = { name: 'Shell Updated' };
      const updated = { id: 'brand-1', ...dto };
      (prisma.brand.findUnique as unknown as jest.Mock).mockResolvedValue({
        id: 'brand-1',
      });
      (prisma.brand.update as unknown as jest.Mock).mockResolvedValue(updated);

      const result = await service.update('brand-1', dto);

      expect(prisma.brand.findUnique).toHaveBeenCalledWith({
        where: { id: 'brand-1' },
      });
      expect(prisma.brand.update).toHaveBeenCalledWith({
        where: { id: 'brand-1' },
        data: dto,
      });
      expect(result).toEqual(updated);
    });

    it('throws NotFoundException when the brand does not exist', async () => {
      (prisma.brand.findUnique as unknown as jest.Mock).mockResolvedValue(null);

      await expect(
        service.update('non-existent-id', { name: 'X' })
      ).rejects.toThrow(NotFoundException);
      expect(prisma.brand.update).not.toHaveBeenCalled();
    });

    it('throws ConflictException when name already exists', async () => {
      const dto = { name: 'Existing' };
      (prisma.brand.findUnique as unknown as jest.Mock).mockResolvedValue({
        id: 'brand-1',
      });
      const error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint',
        {
          code: 'P2002',
          clientVersion: '6.0.0',
        }
      );
      (prisma.brand.update as unknown as jest.Mock).mockRejectedValue(error);

      await expect(service.update('brand-1', dto)).rejects.toThrow(
        ConflictException
      );
    });
  });

  describe('remove', () => {
    it('deletes a brand', async () => {
      const deleted = { id: 'brand-1', name: 'Shell' };
      (prisma.brand.findUnique as unknown as jest.Mock).mockResolvedValue({
        id: 'brand-1',
      });
      (prisma.brand.delete as unknown as jest.Mock).mockResolvedValue(deleted);

      const result = await service.remove('brand-1');

      expect(prisma.brand.findUnique).toHaveBeenCalledWith({
        where: { id: 'brand-1' },
      });
      expect(prisma.brand.delete).toHaveBeenCalledWith({
        where: { id: 'brand-1' },
      });
      expect(result).toEqual(deleted);
      expect(prisma.brand.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the brand does not exist', async () => {
      (prisma.brand.findUnique as unknown as jest.Mock).mockResolvedValue(null);

      await expect(service.remove('non-existent-id')).rejects.toThrow(
        NotFoundException
      );
      expect(prisma.brand.delete).not.toHaveBeenCalled();
      expect(prisma.brand.update).not.toHaveBeenCalled();
    });
  });
});
