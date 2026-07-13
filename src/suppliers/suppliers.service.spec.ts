import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { SuppliersService } from './suppliers.service';

describe('SuppliersService', () => {
  let service: SuppliersService;
  let prisma: PrismaService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      supplier: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    } as unknown as PrismaService;
    service = new SuppliersService(prisma);
  });

  describe('findAll', () => {
    it('returns all suppliers ordered by name', async () => {
      const suppliers = [
        { id: 'supplier-2', name: 'Acme Parts' },
        { id: 'supplier-1', name: 'Shell' },
      ];
      (prisma.supplier.findMany as unknown as jest.Mock).mockResolvedValue(
        suppliers
      );

      const result = await service.findAll();

      expect(prisma.supplier.findMany).toHaveBeenCalledWith({
        orderBy: { name: 'asc' },
      });
      expect(result).toEqual(suppliers);
    });
  });

  describe('findOne', () => {
    it('returns the supplier with the requested id', async () => {
      const supplier = { id: 'supplier-1', name: 'Shell' };
      (prisma.supplier.findUnique as unknown as jest.Mock).mockResolvedValue(
        supplier
      );

      const result = await service.findOne('supplier-1');

      expect(prisma.supplier.findUnique).toHaveBeenCalledWith({
        where: { id: 'supplier-1' },
      });
      expect(result).toEqual(supplier);
    });
  });

  describe('create', () => {
    it('creates a supplier with the provided data', async () => {
      const dto = {
        name: 'Shell',
        phone: '555-0100',
        email: 'shell@example.com',
        address: '123 Main St',
      };
      const created = { id: 'supplier-1', ...dto };
      (prisma.supplier.create as unknown as jest.Mock).mockResolvedValue(
        created
      );

      const result = await service.create(dto);

      expect(prisma.supplier.create).toHaveBeenCalledWith({ data: dto });
      expect(result).toEqual(created);
    });
  });

  describe('update', () => {
    it('updates a supplier when it exists', async () => {
      const dto = { name: 'Shell Updated', email: 'new@example.com' };
      const updated = { id: 'supplier-1', ...dto };
      (prisma.supplier.findUnique as unknown as jest.Mock).mockResolvedValue({
        id: 'supplier-1',
      });
      (prisma.supplier.update as unknown as jest.Mock).mockResolvedValue(
        updated
      );

      const result = await service.update('supplier-1', dto);

      expect(prisma.supplier.findUnique).toHaveBeenCalledWith({
        where: { id: 'supplier-1' },
      });
      expect(prisma.supplier.update).toHaveBeenCalledWith({
        where: { id: 'supplier-1' },
        data: dto,
      });
      expect(result).toEqual(updated);
    });

    it('throws NotFoundException when the supplier does not exist', async () => {
      (prisma.supplier.findUnique as unknown as jest.Mock).mockResolvedValue(
        null
      );

      await expect(service.update('missing-id', { name: 'X' })).rejects.toThrow(
        NotFoundException
      );
      expect(prisma.supplier.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deletes a supplier when it exists', async () => {
      const removed = { id: 'supplier-1', name: 'Shell' };
      (prisma.supplier.findUnique as unknown as jest.Mock).mockResolvedValue({
        id: 'supplier-1',
      });
      (prisma.supplier.delete as unknown as jest.Mock).mockResolvedValue(
        removed
      );

      const result = await service.remove('supplier-1');

      expect(prisma.supplier.findUnique).toHaveBeenCalledWith({
        where: { id: 'supplier-1' },
      });
      expect(prisma.supplier.delete).toHaveBeenCalledWith({
        where: { id: 'supplier-1' },
      });
      expect(result).toEqual(removed);
    });

    it('throws NotFoundException when the supplier does not exist', async () => {
      (prisma.supplier.findUnique as unknown as jest.Mock).mockResolvedValue(
        null
      );

      await expect(service.remove('missing-id')).rejects.toThrow(
        NotFoundException
      );
      expect(prisma.supplier.delete).not.toHaveBeenCalled();
    });
  });
});
