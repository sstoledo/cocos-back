import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ClientsService } from '../clients/clients.service';
import type { PrismaService } from '../prisma/prisma.service';
import { VehiclesService } from './vehicles.service';

describe('VehiclesService', () => {
  let service: VehiclesService;
  let prisma: PrismaService;
  let clientsService: ClientsService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      vehicle: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
    } as unknown as PrismaService;
    clientsService = {
      exists: jest.fn(),
    } as unknown as ClientsService;
    service = new VehiclesService(prisma, clientsService);
  });

  const createPrismaError = (code: string) => {
    return new Prisma.PrismaClientKnownRequestError('constraint', {
      code,
      clientVersion: '6.0.0',
    });
  };

  const client = {
    id: 'client-1',
    name: 'Juan Pérez',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const vehicle = {
    id: 'vehicle-1',
    plate: 'ABC123',
    brand: 'Toyota',
    model: 'Corolla',
    year: 2020,
    color: 'Red',
    notes: null,
    clientId: 'client-1',
    isActive: true,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  describe('create', () => {
    it('creates a vehicle linked to an active client', async () => {
      const dto = {
        plate: 'abc-123',
        brand: 'Toyota',
        model: 'Corolla',
        year: 2020,
        color: 'Red',
        clientId: 'client-1',
      };
      (clientsService.exists as unknown as jest.Mock).mockResolvedValue(true);
      (prisma.vehicle.create as unknown as jest.Mock).mockResolvedValue(
        vehicle
      );

      const result = await service.create(dto);

      expect(clientsService.exists).toHaveBeenCalledWith('client-1');
      expect(prisma.vehicle.create).toHaveBeenCalledWith({
        data: { ...dto, plate: 'ABC123' },
      });
      expect(result).toEqual(vehicle);
    });

    it('throws NotFoundException when the client does not exist', async () => {
      const dto = {
        plate: 'ABC123',
        brand: 'Toyota',
        model: 'Corolla',
        clientId: 'missing-client',
      };
      (clientsService.exists as unknown as jest.Mock).mockResolvedValue(false);

      await expect(service.create(dto)).rejects.toThrow(NotFoundException);
      expect(prisma.vehicle.create).not.toHaveBeenCalled();
    });

    it('throws ConflictException when the normalized plate already exists', async () => {
      const dto = {
        plate: 'abc 123',
        brand: 'Toyota',
        model: 'Corolla',
        clientId: 'client-1',
      };
      (clientsService.exists as unknown as jest.Mock).mockResolvedValue(true);
      (prisma.vehicle.create as unknown as jest.Mock).mockRejectedValue(
        createPrismaError('P2002')
      );

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
    });

    it('rethrows unexpected errors', async () => {
      const dto = {
        plate: 'ABC123',
        brand: 'Toyota',
        model: 'Corolla',
        clientId: 'client-1',
      };
      (clientsService.exists as unknown as jest.Mock).mockResolvedValue(true);
      (prisma.vehicle.create as unknown as jest.Mock).mockRejectedValue(
        new Error('database failure')
      );

      await expect(service.create(dto)).rejects.toThrow('database failure');
    });
  });

  describe('findAll', () => {
    it('returns paginated active vehicles ordered by plate', async () => {
      const vehicles = [
        { ...vehicle, id: 'vehicle-1', plate: 'AAA111' },
        { ...vehicle, id: 'vehicle-2', plate: 'BBB222' },
      ];
      (prisma.vehicle.findMany as unknown as jest.Mock).mockResolvedValue(
        vehicles
      );
      (prisma.vehicle.count as unknown as jest.Mock).mockResolvedValue(2);

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(prisma.vehicle.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { plate: 'asc' },
        skip: 0,
        take: 10,
      });
      expect(prisma.vehicle.count).toHaveBeenCalledWith({
        where: { isActive: true },
      });
      expect(result).toEqual({
        data: vehicles,
        meta: { page: 1, limit: 10, total: 2 },
      });
    });

    it('filters active vehicles by clientId', async () => {
      const vehicles = [{ ...vehicle, id: 'vehicle-1' }];
      (prisma.vehicle.findMany as unknown as jest.Mock).mockResolvedValue(
        vehicles
      );
      (prisma.vehicle.count as unknown as jest.Mock).mockResolvedValue(1);

      const result = await service.findAll({
        clientId: 'client-1',
        page: 1,
        limit: 10,
      });

      expect(prisma.vehicle.findMany).toHaveBeenCalledWith({
        where: { isActive: true, clientId: 'client-1' },
        orderBy: { plate: 'asc' },
        skip: 0,
        take: 10,
      });
      expect(result).toEqual({
        data: vehicles,
        meta: { page: 1, limit: 10, total: 1 },
      });
    });
  });

  describe('findOne', () => {
    it('returns an active vehicle by id', async () => {
      (prisma.vehicle.findUnique as unknown as jest.Mock).mockResolvedValue(
        vehicle
      );

      const result = await service.findOne('vehicle-1');

      expect(prisma.vehicle.findUnique).toHaveBeenCalledWith({
        where: { id: 'vehicle-1', isActive: true },
      });
      expect(result).toEqual(vehicle);
    });

    it('throws NotFoundException when the vehicle is not active', async () => {
      (prisma.vehicle.findUnique as unknown as jest.Mock).mockResolvedValue(
        null
      );

      await expect(service.findOne('missing-id')).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('update', () => {
    it('updates an active vehicle', async () => {
      const dto = { brand: 'Honda' };
      const updated = { ...vehicle, ...dto };
      (prisma.vehicle.findUnique as unknown as jest.Mock).mockResolvedValue(
        vehicle
      );
      (prisma.vehicle.update as unknown as jest.Mock).mockResolvedValue(
        updated
      );

      const result = await service.update('vehicle-1', dto);

      expect(prisma.vehicle.findUnique).toHaveBeenCalledWith({
        where: { id: 'vehicle-1', isActive: true },
      });
      expect(prisma.vehicle.update).toHaveBeenCalledWith({
        where: { id: 'vehicle-1' },
        data: dto,
      });
      expect(result).toEqual(updated);
    });

    it('normalizes the plate when updating', async () => {
      const dto = { plate: 'abc 123' };
      const updated = { ...vehicle, plate: 'ABC123' };
      (prisma.vehicle.findUnique as unknown as jest.Mock).mockResolvedValue(
        vehicle
      );
      (prisma.vehicle.update as unknown as jest.Mock).mockResolvedValue(
        updated
      );

      const result = await service.update('vehicle-1', dto);

      expect(prisma.vehicle.update).toHaveBeenCalledWith({
        where: { id: 'vehicle-1' },
        data: { plate: 'ABC123' },
      });
      expect(result).toEqual(updated);
    });

    it('validates the client when updating clientId', async () => {
      const dto = { clientId: 'client-2' };
      (prisma.vehicle.findUnique as unknown as jest.Mock).mockResolvedValue(
        vehicle
      );
      (clientsService.exists as unknown as jest.Mock).mockResolvedValue(false);

      await expect(service.update('vehicle-1', dto)).rejects.toThrow(
        NotFoundException
      );
      expect(prisma.vehicle.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the vehicle does not exist', async () => {
      (prisma.vehicle.findUnique as unknown as jest.Mock).mockResolvedValue(
        null
      );

      await expect(
        service.update('missing-id', { brand: 'X' })
      ).rejects.toThrow(NotFoundException);
      expect(prisma.vehicle.update).not.toHaveBeenCalled();
    });

    it('throws ConflictException when the new plate already exists', async () => {
      const dto = { plate: 'XYZ999' };
      (prisma.vehicle.findUnique as unknown as jest.Mock).mockResolvedValue(
        vehicle
      );
      (prisma.vehicle.update as unknown as jest.Mock).mockRejectedValue(
        createPrismaError('P2002')
      );

      await expect(service.update('vehicle-1', dto)).rejects.toThrow(
        ConflictException
      );
    });
  });

  describe('remove', () => {
    it('soft-deletes an active vehicle', async () => {
      const removed = { ...vehicle, isActive: false, deletedAt: new Date() };
      (prisma.vehicle.findUnique as unknown as jest.Mock).mockResolvedValue(
        vehicle
      );
      (prisma.vehicle.update as unknown as jest.Mock).mockResolvedValue(
        removed
      );

      const result = await service.remove('vehicle-1');

      expect(prisma.vehicle.findUnique).toHaveBeenCalledWith({
        where: { id: 'vehicle-1', isActive: true },
      });
      expect(prisma.vehicle.update).toHaveBeenCalledWith({
        where: { id: 'vehicle-1' },
        data: { isActive: false, deletedAt: expect.any(Date) },
      });
      expect(result).toEqual(removed);
    });

    it('throws NotFoundException when the vehicle does not exist', async () => {
      (prisma.vehicle.findUnique as unknown as jest.Mock).mockResolvedValue(
        null
      );

      await expect(service.remove('missing-id')).rejects.toThrow(
        NotFoundException
      );
      expect(prisma.vehicle.update).not.toHaveBeenCalled();
    });
  });
});
