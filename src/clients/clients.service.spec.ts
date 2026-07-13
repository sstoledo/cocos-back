import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { ClientsService } from './clients.service';

describe('ClientsService', () => {
  let service: ClientsService;
  let prisma: PrismaService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      client: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
    } as unknown as PrismaService;
    service = new ClientsService(prisma);
  });

  const createPrismaError = (code: string) => {
    return new Prisma.PrismaClientKnownRequestError('unique constraint', {
      code,
      clientVersion: '6.0.0',
    });
  };

  const client = {
    id: 'client-1',
    name: 'Juan Pérez',
    phone: '555-0100',
    email: 'juan@example.com',
    address: 'Av. Principal 123',
    identification: '12345678',
    identificationType: 'DNI',
    isActive: true,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  describe('create', () => {
    it('creates a client with DNI identification', async () => {
      const dto = {
        name: 'Juan Pérez',
        identification: '12345678',
        identificationType: 'DNI',
      };
      (prisma.client.create as unknown as jest.Mock).mockResolvedValue(client);

      const result = await service.create(dto);

      expect(prisma.client.create).toHaveBeenCalledWith({ data: dto });
      expect(result).toEqual(client);
    });

    it('rethrows unexpected errors', async () => {
      const dto = {
        name: 'Juan Pérez',
        identification: '12345678',
        identificationType: 'DNI',
      };
      const error = new Error('database failure');
      (prisma.client.create as unknown as jest.Mock).mockRejectedValue(error);

      await expect(service.create(dto)).rejects.toThrow('database failure');
    });

    it('throws ConflictException when identification already exists', async () => {
      const dto = {
        name: 'Juan Pérez',
        identification: '12345678',
        identificationType: 'DNI',
      };
      const error = createPrismaError('P2002');
      (prisma.client.create as unknown as jest.Mock).mockRejectedValue(error);

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('findAll', () => {
    it('returns paginated active clients ordered by name', async () => {
      const clients = [
        { ...client, id: 'client-1', name: 'Ana López' },
        { ...client, id: 'client-2', name: 'Juan Pérez' },
      ];
      (prisma.client.findMany as unknown as jest.Mock).mockResolvedValue(
        clients
      );
      (prisma.client.count as unknown as jest.Mock).mockResolvedValue(2);

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(prisma.client.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { name: 'asc' },
        skip: 0,
        take: 10,
      });
      expect(prisma.client.count).toHaveBeenCalledWith({
        where: { isActive: true },
      });
      expect(result).toEqual({
        data: clients,
        meta: { page: 1, limit: 10, total: 2 },
      });
    });

    it('filters active clients by query on name and identification', async () => {
      const clients = [{ ...client, id: 'client-1' }];
      (prisma.client.findMany as unknown as jest.Mock).mockResolvedValue(
        clients
      );
      (prisma.client.count as unknown as jest.Mock).mockResolvedValue(1);

      const result = await service.findAll({
        query: 'juan',
        page: 1,
        limit: 10,
      });

      expect(prisma.client.findMany).toHaveBeenCalledWith({
        where: {
          isActive: true,
          OR: [
            { name: { contains: 'juan', mode: 'insensitive' } },
            { identification: { contains: 'juan', mode: 'insensitive' } },
          ],
        },
        orderBy: { name: 'asc' },
        skip: 0,
        take: 10,
      });
      expect(result).toEqual({
        data: clients,
        meta: { page: 1, limit: 10, total: 1 },
      });
    });
  });

  describe('findOne', () => {
    it('returns an active client by id', async () => {
      (prisma.client.findUnique as unknown as jest.Mock).mockResolvedValue(
        client
      );

      const result = await service.findOne('client-1');

      expect(prisma.client.findUnique).toHaveBeenCalledWith({
        where: { id: 'client-1', isActive: true },
        include: { vehicles: { where: { isActive: true } } },
      });
      expect(result).toEqual(client);
    });

    it('throws NotFoundException when the client is not active', async () => {
      (prisma.client.findUnique as unknown as jest.Mock).mockResolvedValue(
        null
      );

      await expect(service.findOne('missing-id')).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('exists', () => {
    it('returns true when an active client exists', async () => {
      (prisma.client.findUnique as unknown as jest.Mock).mockResolvedValue({
        id: 'client-1',
      });

      const result = await service.exists('client-1');

      expect(prisma.client.findUnique).toHaveBeenCalledWith({
        where: { id: 'client-1', isActive: true },
        select: { id: true },
      });
      expect(result).toBe(true);
    });

    it('returns false when the client is not active', async () => {
      (prisma.client.findUnique as unknown as jest.Mock).mockResolvedValue(
        null
      );

      const result = await service.exists('missing-id');

      expect(result).toBe(false);
    });
  });
  describe('update', () => {
    it('updates an active client when it exists', async () => {
      const dto = { name: 'Juan Pérez Actualizado' };
      const updated = { ...client, ...dto };
      (prisma.client.findUnique as unknown as jest.Mock).mockResolvedValue(
        client
      );
      (prisma.client.update as unknown as jest.Mock).mockResolvedValue(updated);

      const result = await service.update('client-1', dto);

      expect(prisma.client.findUnique).toHaveBeenCalledWith({
        where: { id: 'client-1', isActive: true },
        include: { vehicles: { where: { isActive: true } } },
      });
      expect(prisma.client.update).toHaveBeenCalledWith({
        where: { id: 'client-1' },
        data: dto,
      });
      expect(result).toEqual(updated);
    });

    it('throws NotFoundException when the client does not exist', async () => {
      (prisma.client.findUnique as unknown as jest.Mock).mockResolvedValue(
        null
      );

      await expect(service.update('missing-id', { name: 'X' })).rejects.toThrow(
        NotFoundException
      );
      expect(prisma.client.update).not.toHaveBeenCalled();
    });

    it('throws ConflictException when the new identification already exists', async () => {
      const dto = { identification: '87654321' };
      (prisma.client.findUnique as unknown as jest.Mock).mockResolvedValue(
        client
      );
      const error = createPrismaError('P2002');
      (prisma.client.update as unknown as jest.Mock).mockRejectedValue(error);

      await expect(service.update('client-1', dto)).rejects.toThrow(
        ConflictException
      );
    });
  });

  describe('remove', () => {
    it('soft-deletes an active client', async () => {
      const removed = { ...client, isActive: false, deletedAt: new Date() };
      (prisma.client.findUnique as unknown as jest.Mock).mockResolvedValue(
        client
      );
      (prisma.client.update as unknown as jest.Mock).mockResolvedValue(removed);

      const result = await service.remove('client-1');

      expect(prisma.client.findUnique).toHaveBeenCalledWith({
        where: { id: 'client-1', isActive: true },
        include: { vehicles: { where: { isActive: true } } },
      });
      expect(prisma.client.update).toHaveBeenCalledWith({
        where: { id: 'client-1' },
        data: { isActive: false, deletedAt: expect.any(Date) },
      });
      expect(result).toEqual(removed);
    });

    it('throws NotFoundException when the client does not exist', async () => {
      (prisma.client.findUnique as unknown as jest.Mock).mockResolvedValue(
        null
      );

      await expect(service.remove('missing-id')).rejects.toThrow(
        NotFoundException
      );
      expect(prisma.client.update).not.toHaveBeenCalled();
    });
  });
});
