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
    price: '25.50',
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
      serviceProduct: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      product: {
        findUnique: jest.fn(),
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
        price: '25.50',
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
      expect(result).toMatchObject({ id: 'svc-1', price: '25.50' });
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

  describe('recipe (service products)', () => {
    const productRecord = {
      id: 'prod-1',
      code: 'FLT-001',
      name: 'Oil filter',
      consumptionType: 'direct',
      isActive: true,
      deletedAt: null,
    };

    const recipeLine = {
      id: 'sp-1',
      serviceId: 'svc-1',
      productId: 'prod-1',
      quantity: 1,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      product: productRecord,
    };

    it('lists recipe lines for an active service', async () => {
      (prisma.service.findUnique as unknown as jest.Mock).mockResolvedValue(
        serviceRecord
      );
      (
        prisma.serviceProduct.findMany as unknown as jest.Mock
      ).mockResolvedValue([recipeLine]);

      const result = await service.listRecipe('svc-1');

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        productId: 'prod-1',
        quantity: 1,
        product: { code: 'FLT-001', consumptionType: 'direct' },
      });
    });

    it('throws NotFoundException listing the recipe of a missing service', async () => {
      (prisma.service.findUnique as unknown as jest.Mock).mockResolvedValue(
        null
      );

      await expect(service.listRecipe('missing')).rejects.toThrow(
        NotFoundException
      );
      expect(prisma.serviceProduct.findMany).not.toHaveBeenCalled();
    });

    it('adds a recipe line for an existing service and product', async () => {
      (prisma.service.findUnique as unknown as jest.Mock).mockResolvedValue(
        serviceRecord
      );
      (prisma.product.findUnique as unknown as jest.Mock).mockResolvedValue(
        productRecord
      );
      (prisma.serviceProduct.create as unknown as jest.Mock).mockResolvedValue(
        recipeLine
      );

      const result = await service.addRecipeLine('svc-1', {
        productId: 'prod-1',
        quantity: 1,
      });

      expect(prisma.serviceProduct.create).toHaveBeenCalledWith({
        data: { serviceId: 'svc-1', productId: 'prod-1', quantity: 1 },
        include: { product: true },
      });
      expect(result).toMatchObject({ id: 'sp-1', quantity: 1 });
    });

    it('rejects a recipe line when the product does not exist', async () => {
      (prisma.service.findUnique as unknown as jest.Mock).mockResolvedValue(
        serviceRecord
      );
      (prisma.product.findUnique as unknown as jest.Mock).mockResolvedValue(
        null
      );

      await expect(
        service.addRecipeLine('svc-1', { productId: 'missing', quantity: 1 })
      ).rejects.toMatchObject({ response: { errorCode: 'PRODUCT_NOT_FOUND' } });
      expect(prisma.serviceProduct.create).not.toHaveBeenCalled();
    });

    it('rejects duplicate recipe lines with a conflict error', async () => {
      (prisma.service.findUnique as unknown as jest.Mock).mockResolvedValue(
        serviceRecord
      );
      (prisma.product.findUnique as unknown as jest.Mock).mockResolvedValue(
        productRecord
      );
      (prisma.serviceProduct.create as unknown as jest.Mock).mockRejectedValue(
        createPrismaError('P2002')
      );

      await expect(
        service.addRecipeLine('svc-1', { productId: 'prod-1', quantity: 1 })
      ).rejects.toMatchObject({
        response: { errorCode: 'SERVICE_PRODUCT_ALREADY_EXISTS' },
      });
    });

    it('updates the quantity of an existing recipe line', async () => {
      (prisma.service.findUnique as unknown as jest.Mock).mockResolvedValue(
        serviceRecord
      );
      (
        prisma.serviceProduct.findUnique as unknown as jest.Mock
      ).mockResolvedValue(recipeLine);
      (prisma.serviceProduct.update as unknown as jest.Mock).mockResolvedValue({
        ...recipeLine,
        quantity: 3,
      });

      const result = await service.updateRecipeLine('svc-1', 'prod-1', {
        quantity: 3,
      });

      expect(prisma.serviceProduct.update).toHaveBeenCalledWith({
        where: {
          serviceId_productId: { serviceId: 'svc-1', productId: 'prod-1' },
        },
        data: { quantity: 3 },
        include: { product: true },
      });
      expect(result).toMatchObject({ quantity: 3 });
    });

    it('throws NotFoundException when updating a missing recipe line', async () => {
      (prisma.service.findUnique as unknown as jest.Mock).mockResolvedValue(
        serviceRecord
      );
      (
        prisma.serviceProduct.findUnique as unknown as jest.Mock
      ).mockResolvedValue(null);

      await expect(
        service.updateRecipeLine('svc-1', 'prod-1', { quantity: 3 })
      ).rejects.toMatchObject({
        response: { errorCode: 'SERVICE_PRODUCT_NOT_FOUND' },
      });
      expect(prisma.serviceProduct.update).not.toHaveBeenCalled();
    });

    it('removes an existing recipe line', async () => {
      (prisma.service.findUnique as unknown as jest.Mock).mockResolvedValue(
        serviceRecord
      );
      (
        prisma.serviceProduct.findUnique as unknown as jest.Mock
      ).mockResolvedValue(recipeLine);
      (prisma.serviceProduct.delete as unknown as jest.Mock).mockResolvedValue(
        recipeLine
      );

      await service.removeRecipeLine('svc-1', 'prod-1');

      expect(prisma.serviceProduct.delete).toHaveBeenCalledWith({
        where: {
          serviceId_productId: { serviceId: 'svc-1', productId: 'prod-1' },
        },
      });
    });

    it('throws NotFoundException when removing a missing recipe line', async () => {
      (prisma.service.findUnique as unknown as jest.Mock).mockResolvedValue(
        serviceRecord
      );
      (
        prisma.serviceProduct.findUnique as unknown as jest.Mock
      ).mockResolvedValue(null);

      await expect(
        service.removeRecipeLine('svc-1', 'prod-1')
      ).rejects.toMatchObject({
        response: { errorCode: 'SERVICE_PRODUCT_NOT_FOUND' },
      });
      expect(prisma.serviceProduct.delete).not.toHaveBeenCalled();
    });
  });
});
