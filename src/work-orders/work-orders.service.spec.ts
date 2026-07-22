import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, WorkOrderStatus } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { CreateWorkOrderDto } from './dto/create-work-order.dto';
import type { ListWorkOrdersQueryDto } from './dto/list-work-orders-query.dto';
import type { UpdateWorkOrderDto } from './dto/update-work-order.dto';
import { WorkOrdersService } from './work-orders.service';

describe('WorkOrdersService', () => {
  let service: WorkOrdersService;
  let prisma: PrismaService;
  let clientsService: { exists: jest.Mock };
  let vehiclesService: { findOne: jest.Mock };

  const workOrderRecord = {
    id: 'wo-1',
    orderNumber: 'OC-2026-000001',
    clientId: 'client-1',
    vehicleId: 'vehicle-1',
    description: 'Oil change and brake check',
    status: 'pending',
    totalAmount: new Prisma.Decimal(150.0),
    isActive: true,
    deletedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  const workOrderServiceRecord = {
    id: 'wos-1',
    workOrderId: 'wo-1',
    serviceId: 'svc-1',
    quantity: 1,
    unitPriceSnapshot: new Prisma.Decimal(50.0),
    subtotal: new Prisma.Decimal(50.0),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  const workOrderProductRecord = {
    id: 'wop-1',
    workOrderId: 'wo-1',
    productId: 'prod-1',
    quantity: 2,
    unitPriceSnapshot: new Prisma.Decimal(40.25),
    subtotal: new Prisma.Decimal(80.5),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  const productRecord = {
    id: 'prod-1',
    code: 'OIL-5W30',
    name: 'Engine oil 5W-30',
    description: 'Synthetic engine oil',
    price: new Prisma.Decimal(40.25),
    isActive: true,
    deletedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  const vehicleRecord = {
    id: 'vehicle-1',
    plate: 'ABC123',
    brand: 'Toyota',
    model: 'Corolla',
    year: 2020,
    color: 'Blue',
    notes: '',
    clientId: 'client-1',
    isActive: true,
    deletedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  const serviceRecord = {
    id: 'svc-1',
    code: 'OIL-001',
    name: 'Oil change',
    description: 'Standard oil change',
    price: new Prisma.Decimal(50.0),
    estimatedDuration: 30,
    isActive: true,
    deletedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  const sequenceRecord = {
    id: 'seq-1',
    year: 2026,
    lastNumber: 0,
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
    clientsService = { exists: jest.fn() };
    vehiclesService = { findOne: jest.fn() };
    prisma = {
      workOrder: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      workOrderService: {
        createMany: jest.fn(),
        deleteMany: jest.fn(),
        findMany: jest.fn(),
      },
      workOrderProduct: {
        createMany: jest.fn(),
        deleteMany: jest.fn(),
        findMany: jest.fn(),
      },
      workOrderNumberSequence: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
      service: {
        findUnique: jest.fn(),
      },
      product: {
        findUnique: jest.fn(),
      },
      $transaction: jest.fn(),
    } as unknown as PrismaService;
    (prisma.workOrderService.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.workOrderProduct.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.$transaction as jest.Mock).mockImplementation(
      (callback: (tx: unknown) => unknown) => callback(prisma)
    );
    service = new WorkOrdersService(
      prisma,
      // biome-ignore lint/suspicious/noExplicitAny: test mock types
      clientsService as any,
      // biome-ignore lint/suspicious/noExplicitAny: test mock types
      vehiclesService as any
    );
  });

  describe('create', () => {
    it('creates a work order with order number generation, price snapshots, and total computation', async () => {
      const dto: CreateWorkOrderDto = {
        clientId: 'client-1',
        vehicleId: 'vehicle-1',
        description: 'Oil change and brake check',
        services: [
          { serviceId: 'svc-1', quantity: 2 },
          { serviceId: 'svc-2', quantity: 1, unitPrice: 75.5 },
        ],
      };

      const createdWorkOrder = {
        ...workOrderRecord,
        services: [
          {
            ...workOrderServiceRecord,
            serviceId: 'svc-1',
            quantity: 2,
            unitPriceSnapshot: new Prisma.Decimal(50.0),
            subtotal: new Prisma.Decimal(100.0),
            service: serviceRecord,
          },
          {
            ...workOrderServiceRecord,
            id: 'wos-2',
            serviceId: 'svc-2',
            quantity: 1,
            unitPriceSnapshot: new Prisma.Decimal(75.5),
            subtotal: new Prisma.Decimal(75.5),
            service: {
              ...serviceRecord,
              id: 'svc-2',
              price: new Prisma.Decimal(100.0),
            },
          },
        ],
        totalAmount: new Prisma.Decimal(175.5),
      };

      (clientsService.exists as jest.Mock).mockResolvedValue(true);
      (vehiclesService.findOne as jest.Mock).mockResolvedValue(vehicleRecord);
      (prisma.service.findUnique as jest.Mock)
        .mockResolvedValueOnce(serviceRecord)
        .mockResolvedValueOnce({
          ...serviceRecord,
          id: 'svc-2',
          price: new Prisma.Decimal(100.0),
        });

      (
        prisma.workOrderNumberSequence.findUnique as jest.Mock
      ).mockResolvedValue(sequenceRecord);
      (prisma.workOrderNumberSequence.upsert as jest.Mock).mockResolvedValue({
        ...sequenceRecord,
        lastNumber: 1,
      });
      (prisma.workOrder.create as jest.Mock).mockResolvedValue(
        createdWorkOrder
      );

      const result = await service.create(dto);

      expect(clientsService.exists).toHaveBeenCalledWith('client-1');
      expect(vehiclesService.findOne).toHaveBeenCalledWith('vehicle-1');
      expect(prisma.service.findUnique).toHaveBeenCalledTimes(2);
      expect(prisma.workOrderNumberSequence.upsert).toHaveBeenCalled();
      expect(prisma.workOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orderNumber: 'OC-2026-000001',
            clientId: 'client-1',
            vehicleId: 'vehicle-1',
            description: 'Oil change and brake check',
            totalAmount: new Prisma.Decimal(175.5),
            services: {
              create: [
                {
                  serviceId: 'svc-1',
                  quantity: 2,
                  unitPriceSnapshot: expect.any(Prisma.Decimal),
                  subtotal: expect.any(Prisma.Decimal),
                },
                {
                  serviceId: 'svc-2',
                  quantity: 1,
                  unitPriceSnapshot: expect.any(Prisma.Decimal),
                  subtotal: expect.any(Prisma.Decimal),
                },
              ],
            },
          }),
        })
      );
      expect(result).toMatchObject({
        id: 'wo-1',
        orderNumber: 'OC-2026-000001',
        totalAmount: '175.50',
      });
    });

    it('throws NotFoundException with errorCode CLIENT_NOT_FOUND when client does not exist', async () => {
      const dto: CreateWorkOrderDto = {
        clientId: 'client-1',
        vehicleId: 'vehicle-1',
        services: [{ serviceId: 'svc-1', quantity: 1 }],
      };
      (clientsService.exists as jest.Mock).mockResolvedValue(false);

      await expect(service.create(dto)).rejects.toThrow(NotFoundException);
      await expect(service.create(dto)).rejects.toMatchObject({
        response: expect.objectContaining({
          errorCode: 'CLIENT_NOT_FOUND',
        }),
      });
    });

    it('throws NotFoundException with errorCode VEHICLE_NOT_FOUND when vehicle does not exist', async () => {
      const dto: CreateWorkOrderDto = {
        clientId: 'client-1',
        vehicleId: 'vehicle-1',
        services: [{ serviceId: 'svc-1', quantity: 1 }],
      };
      (clientsService.exists as jest.Mock).mockResolvedValue(true);
      (vehiclesService.findOne as jest.Mock).mockRejectedValue(
        new NotFoundException()
      );

      await expect(service.create(dto)).rejects.toThrow(NotFoundException);
      await expect(service.create(dto)).rejects.toMatchObject({
        response: expect.objectContaining({
          errorCode: 'VEHICLE_NOT_FOUND',
        }),
      });
    });

    it('throws ConflictException when vehicle does not belong to client', async () => {
      const dto: CreateWorkOrderDto = {
        clientId: 'client-1',
        vehicleId: 'vehicle-1',
        services: [{ serviceId: 'svc-1', quantity: 1 }],
      };
      (clientsService.exists as jest.Mock).mockResolvedValue(true);
      (vehiclesService.findOne as jest.Mock).mockResolvedValue({
        ...vehicleRecord,
        clientId: 'other-client',
      });

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
      await expect(service.create(dto)).rejects.toMatchObject({
        response: { errorCode: 'VEHICLE_CLIENT_MISMATCH' },
      });
    });

    it('throws NotFoundException with errorCode SERVICE_NOT_FOUND when service does not exist', async () => {
      const dto: CreateWorkOrderDto = {
        clientId: 'client-1',
        vehicleId: 'vehicle-1',
        services: [{ serviceId: 'svc-1', quantity: 1 }],
      };
      (clientsService.exists as jest.Mock).mockResolvedValue(true);
      (vehiclesService.findOne as jest.Mock).mockResolvedValue(vehicleRecord);
      (prisma.service.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.create(dto)).rejects.toThrow(NotFoundException);
      await expect(service.create(dto)).rejects.toMatchObject({
        response: expect.objectContaining({
          errorCode: 'SERVICE_NOT_FOUND',
        }),
      });
    });

    it('applies an explicit status when provided on create', async () => {
      const dto: CreateWorkOrderDto = {
        clientId: 'client-1',
        vehicleId: 'vehicle-1',
        status: WorkOrderStatus.in_progress,
        services: [{ serviceId: 'svc-1', quantity: 1 }],
      };

      (clientsService.exists as jest.Mock).mockResolvedValue(true);
      (vehiclesService.findOne as jest.Mock).mockResolvedValue(vehicleRecord);
      (prisma.service.findUnique as jest.Mock).mockResolvedValue(serviceRecord);

      (
        prisma.workOrderNumberSequence.findUnique as jest.Mock
      ).mockResolvedValue(sequenceRecord);
      (prisma.workOrderNumberSequence.upsert as jest.Mock).mockResolvedValue({
        ...sequenceRecord,
        lastNumber: 1,
      });
      (prisma.workOrder.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.workOrder.create as jest.Mock).mockResolvedValue({
        ...workOrderRecord,
        status: 'in_progress',
        services: [
          {
            ...workOrderServiceRecord,
            unitPriceSnapshot: new Prisma.Decimal(50.0),
            subtotal: new Prisma.Decimal(50.0),
            service: serviceRecord,
          },
        ],
      });

      const result = await service.create(dto);

      expect(prisma.workOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'in_progress' }),
        })
      );
      expect(result.status).toBe('in_progress');
    });

    it('uses service price as unitPriceSnapshot when unitPrice not provided', async () => {
      const dto: CreateWorkOrderDto = {
        clientId: 'client-1',
        vehicleId: 'vehicle-1',
        services: [{ serviceId: 'svc-1', quantity: 2 }],
      };

      (clientsService.exists as jest.Mock).mockResolvedValue(true);
      (vehiclesService.findOne as jest.Mock).mockResolvedValue(vehicleRecord);
      (prisma.service.findUnique as jest.Mock).mockResolvedValue(serviceRecord);

      (
        prisma.workOrderNumberSequence.findUnique as jest.Mock
      ).mockResolvedValue(sequenceRecord);
      (prisma.workOrderNumberSequence.upsert as jest.Mock).mockResolvedValue({
        ...sequenceRecord,
        lastNumber: 1,
      });
      (prisma.workOrder.create as jest.Mock).mockResolvedValue({
        ...workOrderRecord,
        services: [
          {
            ...workOrderServiceRecord,
            quantity: 2,
            unitPriceSnapshot: new Prisma.Decimal(50.0),
            subtotal: new Prisma.Decimal(100.0),
            service: serviceRecord,
          },
        ],
        totalAmount: new Prisma.Decimal(100.0),
      });

      const result = await service.create(dto);

      expect(prisma.workOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            services: {
              create: [
                {
                  serviceId: 'svc-1',
                  quantity: 2,
                  unitPriceSnapshot: expect.any(Prisma.Decimal),
                  subtotal: expect.any(Prisma.Decimal),
                },
              ],
            },
          }),
        })
      );
      expect(result.totalAmount).toBe('100.00');
    });

    it('retries order number generation on collision', async () => {
      const dto: CreateWorkOrderDto = {
        clientId: 'client-1',
        vehicleId: 'vehicle-1',
        services: [{ serviceId: 'svc-1', quantity: 1 }],
      };

      (clientsService.exists as jest.Mock).mockResolvedValue(true);
      (vehiclesService.findOne as jest.Mock).mockResolvedValue(vehicleRecord);
      (prisma.service.findUnique as jest.Mock).mockResolvedValue(serviceRecord);

      let attempt = 0;
      (
        prisma.workOrderNumberSequence.findUnique as jest.Mock
      ).mockImplementation(() => {
        attempt++;
        return Promise.resolve({ ...sequenceRecord, lastNumber: attempt - 1 });
      });
      (prisma.workOrderNumberSequence.upsert as jest.Mock).mockImplementation(
        () => {
          return Promise.resolve({ ...sequenceRecord, lastNumber: attempt });
        }
      );

      // First collision, second success
      (prisma.workOrder.findUnique as jest.Mock)
        .mockResolvedValueOnce({ id: 'existing' }) // collision
        .mockResolvedValueOnce(null); // available

      (prisma.workOrder.create as jest.Mock).mockResolvedValue({
        ...workOrderRecord,
        orderNumber: 'OC-2026-000002',
        totalAmount: new Prisma.Decimal(50.0),
        services: [
          {
            ...workOrderServiceRecord,
            unitPriceSnapshot: new Prisma.Decimal(50.0),
            subtotal: new Prisma.Decimal(50.0),
            service: serviceRecord,
          },
        ],
      });

      const result = await service.create(dto);

      expect(prisma.workOrder.create).toHaveBeenCalledTimes(1);
      expect(prisma.workOrderNumberSequence.upsert).toHaveBeenCalledTimes(2);
      expect(prisma.workOrder.findUnique).toHaveBeenCalledTimes(2);
      expect(result.orderNumber).toBe('OC-2026-000002');
    });

    it('generates sequential order numbers OC-YYYY-NNNNNN', async () => {
      const dto: CreateWorkOrderDto = {
        clientId: 'client-1',
        vehicleId: 'vehicle-1',
        services: [{ serviceId: 'svc-1', quantity: 1 }],
      };

      (clientsService.exists as jest.Mock).mockResolvedValue(true);
      (vehiclesService.findOne as jest.Mock).mockResolvedValue(vehicleRecord);
      (prisma.service.findUnique as jest.Mock).mockResolvedValue(serviceRecord);

      (
        prisma.workOrderNumberSequence.findUnique as jest.Mock
      ).mockResolvedValue({
        ...sequenceRecord,
        lastNumber: 5,
      });
      (prisma.workOrderNumberSequence.upsert as jest.Mock).mockResolvedValue({
        ...sequenceRecord,
        lastNumber: 6,
      });
      (prisma.workOrder.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.workOrder.create as jest.Mock).mockResolvedValue({
        ...workOrderRecord,
        orderNumber: 'OC-2026-000006',
        totalAmount: new Prisma.Decimal(50.0),
        services: [
          {
            ...workOrderServiceRecord,
            unitPriceSnapshot: new Prisma.Decimal(50.0),
            subtotal: new Prisma.Decimal(50.0),
            service: serviceRecord,
          },
        ],
      });

      const result = await service.create(dto);

      expect(result.orderNumber).toBe('OC-2026-000006');
    });
  });

  describe('findAll', () => {
    it('returns paginated active work orders', async () => {
      const records = [
        {
          ...workOrderRecord,
          orderNumber: 'OC-2026-000001',
          totalAmount: new Prisma.Decimal(100.0),
          services: [],
        },
        {
          ...workOrderRecord,
          id: 'wo-2',
          orderNumber: 'OC-2026-000002',
          totalAmount: new Prisma.Decimal(200.0),
          services: [],
        },
      ];
      (prisma.workOrder.findMany as jest.Mock).mockResolvedValue(records);
      (prisma.workOrder.count as jest.Mock).mockResolvedValue(2);

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(prisma.workOrder.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 10,
        include: {
          services: { include: { service: true } },
          products: { include: { product: true } },
        },
      });
      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toMatchObject({
        orderNumber: 'OC-2026-000001',
        totalAmount: '100.00',
      });
      expect(result.data[1]).toMatchObject({
        orderNumber: 'OC-2026-000002',
        totalAmount: '200.00',
      });
      expect(result.meta).toEqual({ page: 1, limit: 10, total: 2 });
    });

    it('filters by orderNumber search', async () => {
      (prisma.workOrder.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.workOrder.count as jest.Mock).mockResolvedValue(0);

      await service.findAll({ query: 'OC-2026-000001', page: 1, limit: 10 });

      expect(prisma.workOrder.findMany).toHaveBeenCalledWith({
        where: {
          isActive: true,
          orderNumber: { contains: 'OC-2026-000001', mode: 'insensitive' },
        },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 10,
        include: {
          services: { include: { service: true } },
          products: { include: { product: true } },
        },
      });
    });
  });

  describe('findOne', () => {
    it('returns work order with services', async () => {
      const record = {
        ...workOrderRecord,
        services: [{ ...workOrderServiceRecord, service: serviceRecord }],
      };
      (prisma.workOrder.findUnique as jest.Mock).mockResolvedValue(record);

      const result = await service.findOne('wo-1');

      expect(prisma.workOrder.findUnique).toHaveBeenCalledWith({
        where: { id: 'wo-1', isActive: true },
        include: {
          services: { include: { service: true } },
          products: { include: { product: true } },
        },
      });
      expect(result).toMatchObject({
        id: 'wo-1',
        orderNumber: 'OC-2026-000001',
      });
    });

    it('throws NotFoundException with errorCode WORK_ORDER_NOT_FOUND when work order is inactive or missing', async () => {
      (prisma.workOrder.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.findOne('wo-1')).rejects.toThrow(NotFoundException);
      await expect(service.findOne('wo-1')).rejects.toMatchObject({
        response: expect.objectContaining({
          errorCode: 'WORK_ORDER_NOT_FOUND',
        }),
      });
    });
  });

  describe('update', () => {
    it('replaces all line items when services provided, recomputes total', async () => {
      const dto: UpdateWorkOrderDto = {
        description: 'Updated description',
        services: [
          { serviceId: 'svc-1', quantity: 3 },
          { serviceId: 'svc-2', quantity: 2, unitPrice: 60.0 },
        ],
      };

      (prisma.workOrder.findUnique as jest.Mock).mockResolvedValue(
        workOrderRecord
      );
      (prisma.service.findUnique as jest.Mock)
        .mockResolvedValueOnce(serviceRecord)
        .mockResolvedValueOnce({
          ...serviceRecord,
          id: 'svc-2',
          price: new Prisma.Decimal(80.0),
        });

      (prisma.workOrderService.deleteMany as jest.Mock).mockResolvedValue({
        count: 1,
      });
      (prisma.workOrderService.createMany as jest.Mock).mockResolvedValue({
        count: 2,
      });
      (prisma.workOrder.update as jest.Mock).mockResolvedValue({
        ...workOrderRecord,
        description: 'Updated description',
        totalAmount: new Prisma.Decimal(270.0),
        services: [
          {
            ...workOrderServiceRecord,
            quantity: 3,
            unitPriceSnapshot: new Prisma.Decimal(50.0),
            subtotal: new Prisma.Decimal(150.0),
            service: serviceRecord,
          },
          {
            ...workOrderServiceRecord,
            id: 'wos-2',
            serviceId: 'svc-2',
            quantity: 2,
            unitPriceSnapshot: new Prisma.Decimal(60.0),
            subtotal: new Prisma.Decimal(120.0),
            service: { ...serviceRecord, id: 'svc-2' },
          },
        ],
      });

      const result = await service.update('wo-1', dto);

      expect(prisma.workOrderService.deleteMany).toHaveBeenCalledWith({
        where: { workOrderId: 'wo-1' },
      });
      expect(prisma.workOrderService.createMany).toHaveBeenCalledWith({
        data: [
          {
            workOrderId: 'wo-1',
            serviceId: 'svc-1',
            quantity: 3,
            unitPriceSnapshot: expect.any(Prisma.Decimal),
            subtotal: expect.any(Prisma.Decimal),
          },
          {
            workOrderId: 'wo-1',
            serviceId: 'svc-2',
            quantity: 2,
            unitPriceSnapshot: expect.any(Prisma.Decimal),
            subtotal: expect.any(Prisma.Decimal),
          },
        ],
      });
      expect(prisma.workOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'wo-1' },
          data: {
            description: 'Updated description',
            totalAmount: new Prisma.Decimal(270.0),
          },
        })
      );
      expect(result.totalAmount).toBe('270.00');
    });

    it('updates only description when services not provided', async () => {
      const dto: UpdateWorkOrderDto = { description: 'Updated description' };

      (prisma.workOrder.findUnique as jest.Mock).mockResolvedValue(
        workOrderRecord
      );
      (prisma.workOrder.update as jest.Mock).mockResolvedValue({
        ...workOrderRecord,
        description: 'Updated description',
      });

      const result = await service.update('wo-1', dto);

      expect(prisma.workOrderService.deleteMany).not.toHaveBeenCalled();
      expect(prisma.workOrderService.createMany).not.toHaveBeenCalled();
      expect(prisma.workOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'wo-1' },
          data: { description: 'Updated description' },
        })
      );
      expect(result.description).toBe('Updated description');
    });

    it('throws NotFoundException when work order not found', async () => {
      (prisma.workOrder.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.update('wo-1', { description: 'test' })
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException with errorCode SERVICE_NOT_FOUND when service does not exist', async () => {
      const dto: UpdateWorkOrderDto = {
        services: [{ serviceId: 'svc-1', quantity: 1 }],
      };

      (prisma.workOrder.findUnique as jest.Mock).mockResolvedValue(
        workOrderRecord
      );
      (prisma.service.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.update('wo-1', dto)).rejects.toThrow(
        NotFoundException
      );
      await expect(service.update('wo-1', dto)).rejects.toMatchObject({
        response: expect.objectContaining({
          errorCode: 'SERVICE_NOT_FOUND',
        }),
      });
    });

    it('updates clientId and vehicleId when both are provided and valid', async () => {
      const dto: UpdateWorkOrderDto = {
        clientId: 'client-2',
        vehicleId: 'vehicle-2',
      };

      (prisma.workOrder.findUnique as jest.Mock).mockResolvedValue(
        workOrderRecord
      );
      (clientsService.exists as jest.Mock).mockResolvedValue(true);
      (vehiclesService.findOne as jest.Mock).mockResolvedValue({
        ...vehicleRecord,
        id: 'vehicle-2',
        clientId: 'client-2',
      });
      (prisma.workOrder.update as jest.Mock).mockResolvedValue({
        ...workOrderRecord,
        clientId: 'client-2',
        vehicleId: 'vehicle-2',
      });

      const result = await service.update('wo-1', dto);

      expect(clientsService.exists).toHaveBeenCalledWith('client-2');
      expect(vehiclesService.findOne).toHaveBeenCalledWith('vehicle-2');
      expect(prisma.workOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'wo-1' },
          data: expect.objectContaining({
            clientId: 'client-2',
            vehicleId: 'vehicle-2',
          }),
        })
      );
      expect(result).toMatchObject({
        clientId: 'client-2',
        vehicleId: 'vehicle-2',
      });
    });

    it('validates a new vehicle against the current client when only vehicleId is provided', async () => {
      const dto: UpdateWorkOrderDto = { vehicleId: 'vehicle-2' };

      (prisma.workOrder.findUnique as jest.Mock).mockResolvedValue(
        workOrderRecord
      );
      (vehiclesService.findOne as jest.Mock).mockResolvedValue({
        ...vehicleRecord,
        id: 'vehicle-2',
        clientId: 'client-1',
      });
      (prisma.workOrder.update as jest.Mock).mockResolvedValue({
        ...workOrderRecord,
        vehicleId: 'vehicle-2',
      });

      const result = await service.update('wo-1', dto);

      expect(clientsService.exists).not.toHaveBeenCalled();
      expect(vehiclesService.findOne).toHaveBeenCalledWith('vehicle-2');
      expect(prisma.workOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ vehicleId: 'vehicle-2' }),
        })
      );
      expect(result.vehicleId).toBe('vehicle-2');
    });

    it('validates the current vehicle against a new client when only clientId is provided', async () => {
      const dto: UpdateWorkOrderDto = { clientId: 'client-2' };

      (prisma.workOrder.findUnique as jest.Mock).mockResolvedValue(
        workOrderRecord
      );
      (clientsService.exists as jest.Mock).mockResolvedValue(true);
      (vehiclesService.findOne as jest.Mock).mockResolvedValue({
        ...vehicleRecord,
        clientId: 'client-2',
      });
      (prisma.workOrder.update as jest.Mock).mockResolvedValue({
        ...workOrderRecord,
        clientId: 'client-2',
      });

      const result = await service.update('wo-1', dto);

      expect(clientsService.exists).toHaveBeenCalledWith('client-2');
      expect(vehiclesService.findOne).toHaveBeenCalledWith('vehicle-1');
      expect(prisma.workOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ clientId: 'client-2' }),
        })
      );
      expect(result.clientId).toBe('client-2');
    });

    it('throws ConflictException with errorCode VEHICLE_CLIENT_MISMATCH when the new vehicle belongs to another client', async () => {
      const dto: UpdateWorkOrderDto = {
        clientId: 'client-1',
        vehicleId: 'vehicle-2',
      };

      (prisma.workOrder.findUnique as jest.Mock).mockResolvedValue(
        workOrderRecord
      );
      (clientsService.exists as jest.Mock).mockResolvedValue(true);
      (vehiclesService.findOne as jest.Mock).mockResolvedValue({
        ...vehicleRecord,
        id: 'vehicle-2',
        clientId: 'other-client',
      });

      await expect(service.update('wo-1', dto)).rejects.toThrow(
        ConflictException
      );
      await expect(service.update('wo-1', dto)).rejects.toMatchObject({
        response: expect.objectContaining({
          errorCode: 'VEHICLE_CLIENT_MISMATCH',
        }),
      });
      expect(prisma.workOrder.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException with errorCode CLIENT_NOT_FOUND when the new client is inactive', async () => {
      const dto: UpdateWorkOrderDto = { clientId: 'client-inactive' };

      (prisma.workOrder.findUnique as jest.Mock).mockResolvedValue(
        workOrderRecord
      );
      (clientsService.exists as jest.Mock).mockResolvedValue(false);

      await expect(service.update('wo-1', dto)).rejects.toThrow(
        NotFoundException
      );
      await expect(service.update('wo-1', dto)).rejects.toMatchObject({
        response: expect.objectContaining({
          errorCode: 'CLIENT_NOT_FOUND',
        }),
      });
      expect(prisma.workOrder.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException with errorCode VEHICLE_NOT_FOUND when the new vehicle does not exist', async () => {
      const dto: UpdateWorkOrderDto = { vehicleId: 'vehicle-missing' };

      (prisma.workOrder.findUnique as jest.Mock).mockResolvedValue(
        workOrderRecord
      );
      (vehiclesService.findOne as jest.Mock).mockRejectedValue(
        new NotFoundException()
      );

      await expect(service.update('wo-1', dto)).rejects.toThrow(
        NotFoundException
      );
      await expect(service.update('wo-1', dto)).rejects.toMatchObject({
        response: expect.objectContaining({
          errorCode: 'VEHICLE_NOT_FOUND',
        }),
      });
      expect(prisma.workOrder.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('soft-deletes work order (isActive=false, deletedAt=now)', async () => {
      (prisma.workOrder.findUnique as jest.Mock).mockResolvedValue(
        workOrderRecord
      );
      (prisma.workOrder.update as jest.Mock).mockResolvedValue({
        ...workOrderRecord,
        isActive: false,
        deletedAt: new Date(),
      });

      const result = await service.remove('wo-1');

      expect(prisma.workOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'wo-1' },
          data: { isActive: false, deletedAt: expect.any(Date) },
        })
      );
      expect(result.isActive).toBe(false);
      expect(result.deletedAt).toBeInstanceOf(Date);
    });

    it('throws NotFoundException when work order not found', async () => {
      (prisma.workOrder.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.remove('wo-1')).rejects.toThrow(NotFoundException);
    });
  });
});
