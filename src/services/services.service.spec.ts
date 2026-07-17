import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { ServicesService } from './services.service';

describe('ServicesService', () => {
  let service: ServicesService;
  let prisma: PrismaService;

  const serviceRecord = {
    id: 'svc-1',
    code: 'OIL-001',
    name: 'Oil change',
    description: 'Standard oil change',
    price: 25.5,
    estimatedDuration: 30,
    isActive: true,
    deletedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  const createPrismaError = (code: string) =>
    new Prisma.PrismaClientKnownRequestError('constraint', {
      code,
      clientVersion: '6.0.0',
    });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      service: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
    } as unknown as PrismaService;
    service = new ServicesService(prisma);
  });

  describe('create', () => {
    it('creates a service and returns a response DTO with price as string', async () => {
      const dto: CreateServiceDto = {
        code: 'OIL-001',
        name: 'Oil change',
        description: 'Standard oil change',
        price: 25.5,
        estimatedDuration: 30,
      };
      (prisma.service.create as unknown as jest.Mock).mockResolvedValue(
        serviceRecord
      );

      const result = await service.create(dto);

      expect(prisma.service.create).toHaveBeenCalledWith({ data: dto });
      expect(result).toMatchObject({
        id: 'svc-1',
        code: 'OIL-001',
        price: '25.5',
      });
    });

    it('throws ConflictException when the code already exists', async () => {
      const dto: CreateServiceDto = {
        code: 'OIL-001',
        name: 'Oil change',
        price: 25.5,
      };
      (prisma.service.create as unknown as jest.Mock).mockRejectedValue(
        createPrismaError('P2002')
      );

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('findAll', () => {
    it('returns active services with pagination metadata', async () => {
      const records = [serviceRecord];
      (prisma.service.findMany as unknown as jest.Mock).mockResolvedValue(
        records
      );
      (prisma.service.count as unknown as jest.Mock).mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(prisma.service.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { name: 'asc' },
        skip: 0,
        take: 10,
      });
      expect(result).toEqual({
        data: expect.any(Array),
        meta: { page: 1, limit: 10, total: 1 },
      });
    });

    it('searches active services by code and name', async () => {
      (prisma.service.findMany as unknown as jest.Mock).mockResolvedValue([]);
      (prisma.service.count as unknown as jest.Mock).mockResolvedValue(0);

      await service.findAll({ query: 'oil', page: 1, limit: 10 });

      expect(prisma.service.findMany).toHaveBeenCalledWith({
        where: {
          isActive: true,
          OR: [
            { code: { contains: 'oil', mode: 'insensitive' } },
            { name: { contains: 'oil', mode: 'insensitive' } },
          ],
        },
        orderBy: { name: 'asc' },
        skip: 0,
        take: 10,
      });
    });
  });

  describe('findOne', () => {
    it('returns an active service by id', async () => {
      (prisma.service.findUnique as unknown as jest.Mock).mockResolvedValue(
        serviceRecord
      );

      const result = await service.findOne('svc-1');

      expect(prisma.service.findUnique).toHaveBeenCalledWith({
        where: { id: 'svc-1', isActive: true },
      });
      expect(result).toMatchObject({ id: 'svc-1', price: '25.5' });
    });

    it('throws NotFoundException when the service is inactive', async () => {
      (prisma.service.findUnique as unknown as jest.Mock).mockResolvedValue(
        null
      );

      await expect(service.findOne('svc-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('updates an active service', async () => {
      const dto: UpdateServiceDto = { name: 'Premium oil change' };
      const updated = { ...serviceRecord, ...dto };
      (prisma.service.findUnique as unknown as jest.Mock).mockResolvedValue(
        serviceRecord
      );
      (prisma.service.update as unknown as jest.Mock).mockResolvedValue(
        updated
      );

      const result = await service.update('svc-1', dto);

      expect(prisma.service.update).toHaveBeenCalledWith({
        where: { id: 'svc-1' },
        data: dto,
      });
      expect(result).toMatchObject({ id: 'svc-1', name: 'Premium oil change' });
    });

    it('throws NotFoundException when the service is inactive', async () => {
      (prisma.service.findUnique as unknown as jest.Mock).mockResolvedValue(
        null
      );

      await expect(service.update('svc-1', { name: 'X' })).rejects.toThrow(
        NotFoundException
      );
    });

    it('throws ConflictException when the new code already exists', async () => {
      (prisma.service.findUnique as unknown as jest.Mock).mockResolvedValue(
        serviceRecord
      );
      (prisma.service.update as unknown as jest.Mock).mockRejectedValue(
        createPrismaError('P2002')
      );

      await expect(
        service.update('svc-1', { code: 'TIRE-001' })
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    it('soft-deletes an active service', async () => {
      const removed = {
        ...serviceRecord,
        isActive: false,
        deletedAt: new Date(),
      };
      (prisma.service.findUnique as unknown as jest.Mock).mockResolvedValue(
        serviceRecord
      );
      (prisma.service.update as unknown as jest.Mock).mockResolvedValue(
        removed
      );

      const result = await service.remove('svc-1');

      expect(prisma.service.update).toHaveBeenCalledWith({
        where: { id: 'svc-1' },
        data: { isActive: false, deletedAt: expect.any(Date) },
      });
      expect(result).toMatchObject({
        isActive: false,
        deletedAt: expect.any(Date),
      });
    });

    it('throws NotFoundException when the service is inactive', async () => {
      (prisma.service.findUnique as unknown as jest.Mock).mockResolvedValue(
        null
      );

      await expect(service.remove('svc-1')).rejects.toThrow(NotFoundException);
    });
  });
});
