import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { LotsService } from './lots.service';

const lotInclude = {
  supplier: true,
  items: { include: { product: true } },
};

describe('LotsService', () => {
  let service: LotsService;
  let prisma: PrismaService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      lot: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      lotItem: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      $transaction: jest.fn(async (callback) => callback(prisma)),
    } as unknown as PrismaService;
    service = new LotsService(prisma);
  });

  describe('findAll', () => {
    it('returns all lots ordered by receivedAt desc with supplier and items', async () => {
      const lots = [
        {
          id: 'lot-1',
          lotNumber: 'LOT-001',
          receivedAt: new Date('2026-07-13'),
          items: [],
        },
      ];
      (prisma.lot.findMany as unknown as jest.Mock).mockResolvedValue(lots);

      const result = await service.findAll();

      expect(prisma.lot.findMany).toHaveBeenCalledWith({
        orderBy: { receivedAt: 'desc' },
        include: lotInclude,
      });
      expect(result).toEqual(lots);
    });
  });

  describe('findOne', () => {
    it('returns the lot with the requested id and nested data', async () => {
      const lot = {
        id: 'lot-1',
        lotNumber: 'LOT-001',
        supplier: { id: 'supplier-1' },
        items: [{ id: 'item-1', product: { id: 'product-1' } }],
      };
      (prisma.lot.findUnique as unknown as jest.Mock).mockResolvedValue(lot);

      const result = await service.findOne('lot-1');

      expect(prisma.lot.findUnique).toHaveBeenCalledWith({
        where: { id: 'lot-1' },
        include: lotInclude,
      });
      expect(result).toEqual(lot);
    });
  });

  describe('create', () => {
    it('creates a lot and its items with remainingQuantity equal to quantity', async () => {
      const dto = {
        lotNumber: 'LOT-001',
        supplierId: 'supplier-1',
        receivedAt: new Date('2026-07-13'),
        notes: 'Inbound lot',
        items: [
          {
            productId: 'product-1',
            quantity: 5,
            costPrice: 10.5,
            expirationDate: new Date('2026-12-31'),
          },
        ],
      };
      const created = { id: 'lot-1', ...dto };
      const final = {
        ...created,
        supplier: { id: 'supplier-1' },
        items: [
          {
            id: 'item-1',
            lotId: 'lot-1',
            productId: 'product-1',
            quantity: 5,
            remainingQuantity: 5,
            costPrice: 10.5,
            expirationDate: dto.items[0].expirationDate,
            product: { id: 'product-1' },
          },
        ],
      };
      (prisma.lot.create as unknown as jest.Mock).mockResolvedValue(created);
      (prisma.lotItem.createMany as unknown as jest.Mock).mockResolvedValue({
        count: 1,
      });
      (prisma.lot.findUnique as unknown as jest.Mock).mockResolvedValue(final);

      const result = await service.create(dto as never);

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.lot.create).toHaveBeenCalledWith({
        data: {
          lotNumber: dto.lotNumber,
          supplierId: dto.supplierId,
          receivedAt: dto.receivedAt,
          notes: dto.notes,
        },
      });
      expect(prisma.lotItem.createMany).toHaveBeenCalledWith({
        data: [
          {
            lotId: 'lot-1',
            productId: 'product-1',
            quantity: 5,
            remainingQuantity: 5,
            costPrice: 10.5,
            expirationDate: dto.items[0].expirationDate,
          },
        ],
      });
      expect(prisma.lot.findUnique).toHaveBeenCalledWith({
        where: { id: 'lot-1' },
        include: lotInclude,
      });
      expect(result).toEqual(final);
    });
  });

  describe('update', () => {
    it('replaces all items and updates lot fields when items are provided', async () => {
      const dto = {
        lotNumber: 'LOT-002',
        items: [
          {
            productId: 'product-2',
            quantity: 3,
            costPrice: 20,
            expirationDate: new Date('2027-01-01'),
          },
        ],
      };
      const existing = { id: 'lot-1', lotNumber: 'LOT-001' };
      const updated = {
        id: 'lot-1',
        lotNumber: 'LOT-002',
        supplier: { id: 'supplier-1' },
        items: [
          {
            id: 'item-2',
            lotId: 'lot-1',
            productId: 'product-2',
            quantity: 3,
            remainingQuantity: 3,
            costPrice: 20,
            expirationDate: dto.items[0].expirationDate,
            product: { id: 'product-2' },
          },
        ],
      };
      (prisma.lot.findUnique as unknown as jest.Mock).mockResolvedValue(
        existing
      );
      (prisma.lotItem.deleteMany as unknown as jest.Mock).mockResolvedValue({
        count: 1,
      });
      (prisma.lot.update as unknown as jest.Mock).mockResolvedValue(updated);

      const result = await service.update('lot-1', dto as never);

      expect(prisma.lot.findUnique).toHaveBeenCalledWith({
        where: { id: 'lot-1' },
      });
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.lotItem.deleteMany).toHaveBeenCalledWith({
        where: { lotId: 'lot-1' },
      });
      expect(prisma.lot.update).toHaveBeenCalledWith({
        where: { id: 'lot-1' },
        data: {
          lotNumber: 'LOT-002',
          items: {
            create: [
              {
                productId: 'product-2',
                quantity: 3,
                remainingQuantity: 3,
                costPrice: 20,
                expirationDate: dto.items[0].expirationDate,
              },
            ],
          },
        },
        include: lotInclude,
      });
      expect(result).toEqual(updated);
    });

    it('updates only lot fields when items are not provided', async () => {
      const dto = { notes: 'Updated notes' };
      const updated = { id: 'lot-1', notes: 'Updated notes' };
      (prisma.lot.findUnique as unknown as jest.Mock).mockResolvedValue({
        id: 'lot-1',
      });
      (prisma.lot.update as unknown as jest.Mock).mockResolvedValue(updated);

      const result = await service.update('lot-1', dto as never);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.lot.update).toHaveBeenCalledWith({
        where: { id: 'lot-1' },
        data: { notes: 'Updated notes' },
        include: lotInclude,
      });
      expect(result).toEqual(updated);
    });

    it('throws NotFoundException when the lot does not exist', async () => {
      (prisma.lot.findUnique as unknown as jest.Mock).mockResolvedValue(null);

      await expect(
        service.update('missing-id', { notes: 'x' } as never)
      ).rejects.toThrow(NotFoundException);
      expect(prisma.lot.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deletes the lot when it exists', async () => {
      const removed = { id: 'lot-1', lotNumber: 'LOT-001' };
      (prisma.lot.findUnique as unknown as jest.Mock).mockResolvedValue({
        id: 'lot-1',
      });
      (prisma.lot.delete as unknown as jest.Mock).mockResolvedValue(removed);

      const result = await service.remove('lot-1');

      expect(prisma.lot.findUnique).toHaveBeenCalledWith({
        where: { id: 'lot-1' },
      });
      expect(prisma.lot.delete).toHaveBeenCalledWith({
        where: { id: 'lot-1' },
      });
      expect(result).toEqual(removed);
    });

    it('throws NotFoundException when the lot does not exist', async () => {
      (prisma.lot.findUnique as unknown as jest.Mock).mockResolvedValue(null);

      await expect(service.remove('missing-id')).rejects.toThrow(
        NotFoundException
      );
      expect(prisma.lot.delete).not.toHaveBeenCalled();
    });
  });
});
