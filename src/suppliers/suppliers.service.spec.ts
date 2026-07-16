import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { SuppliersService } from './suppliers.service';

const activeWhere = { isActive: true };

const softDeleteData = { isActive: false, deletedAt: expect.any(Date) };

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
    it('returns only active suppliers ordered by name', async () => {
      const suppliers = [
        { id: 'supplier-2', name: 'Acme Parts', isActive: true },
        { id: 'supplier-1', name: 'Shell', isActive: true },
      ];
      (prisma.supplier.findMany as unknown as jest.Mock).mockResolvedValue(
        suppliers
      );

      const result = await service.findAll();

      expect(prisma.supplier.findMany).toHaveBeenCalledWith({
        where: activeWhere,
        orderBy: { name: 'asc' },
      });
      expect(result).toEqual(suppliers);
    });
  });

  describe('findOne', () => {
    it('returns the active supplier with the requested id', async () => {
      const supplier = { id: 'supplier-1', name: 'Shell', isActive: true };
      (prisma.supplier.findUnique as unknown as jest.Mock).mockResolvedValue(
        supplier
      );

      const result = await service.findOne('supplier-1');

      expect(prisma.supplier.findUnique).toHaveBeenCalledWith({
        where: { id: 'supplier-1', ...activeWhere },
      });
      expect(result).toEqual(supplier);
    });

    it('throws NotFoundException when the supplier is inactive', async () => {
      (prisma.supplier.findUnique as unknown as jest.Mock).mockResolvedValue(
        null
      );

      await expect(service.findOne('inactive-id')).rejects.toThrow(
        NotFoundException
      );
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
      const created = { id: 'supplier-1', ...dto, isActive: true };
      (prisma.supplier.create as unknown as jest.Mock).mockResolvedValue(
        created
      );

      const result = await service.create(dto);

      expect(prisma.supplier.create).toHaveBeenCalledWith({ data: dto });
      expect(result).toEqual(created);
    });
  });

  describe('update', () => {
    it('updates an active supplier', async () => {
      const dto = { name: 'Shell Updated', email: 'new@example.com' };
      const updated = { id: 'supplier-1', ...dto, isActive: true };
      (prisma.supplier.findUnique as unknown as jest.Mock).mockResolvedValue({
        id: 'supplier-1',
        isActive: true,
      });
      (prisma.supplier.update as unknown as jest.Mock).mockResolvedValue(
        updated
      );

      const result = await service.update('supplier-1', dto);

      expect(prisma.supplier.findUnique).toHaveBeenCalledWith({
        where: { id: 'supplier-1', ...activeWhere },
      });
      expect(prisma.supplier.update).toHaveBeenCalledWith({
        where: { id: 'supplier-1' },
        data: dto,
      });
      expect(result).toEqual(updated);
    });

    it('throws NotFoundException when the supplier is inactive', async () => {
      (prisma.supplier.findUnique as unknown as jest.Mock).mockResolvedValue(
        null
      );

      await expect(
        service.update('inactive-id', { name: 'X' })
      ).rejects.toThrow(NotFoundException);
      expect(prisma.supplier.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('soft-deletes an active supplier', async () => {
      const removed = {
        id: 'supplier-1',
        name: 'Shell',
        isActive: false,
        deletedAt: new Date(),
      };
      (prisma.supplier.findUnique as unknown as jest.Mock).mockResolvedValue({
        id: 'supplier-1',
        isActive: true,
      });
      (prisma.supplier.update as unknown as jest.Mock).mockResolvedValue(
        removed
      );

      const result = await service.remove('supplier-1');

      expect(prisma.supplier.findUnique).toHaveBeenCalledWith({
        where: { id: 'supplier-1', ...activeWhere },
      });
      expect(prisma.supplier.update).toHaveBeenCalledWith({
        where: { id: 'supplier-1' },
        data: softDeleteData,
      });
      expect(result).toEqual(removed);
      expect(prisma.supplier.delete).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the supplier is inactive', async () => {
      (prisma.supplier.findUnique as unknown as jest.Mock).mockResolvedValue(
        null
      );

      await expect(service.remove('inactive-id')).rejects.toThrow(
        NotFoundException
      );
      expect(prisma.supplier.update).not.toHaveBeenCalled();
      expect(prisma.supplier.delete).not.toHaveBeenCalled();
    });
  });
});
