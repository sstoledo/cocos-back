import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { Role, User } from '@prisma/client';
import { Prisma, RoleName } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { CreateConsumptionEventDto } from './dto/create-consumption-event.dto';
import { WorkOrdersService } from './work-orders.service';

describe('WorkOrdersService — consumptions', () => {
  let service: WorkOrdersService;
  let prisma: PrismaService;

  const adminUser = {
    id: 'user-admin',
    role: { name: RoleName.Admin },
  } as User & { role: Role };

  const mechanicUser = {
    id: 'user-mechanic',
    role: { name: RoleName.Mechanic },
  } as User & { role: Role };

  const workOrderRecord = {
    id: 'wo-1',
    orderNumber: 'OC-2026-000001',
    clientId: 'client-1',
    vehicleId: 'vehicle-1',
    description: null,
    status: 'in_progress',
    totalAmount: new Prisma.Decimal(150.0),
    isActive: true,
    deletedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  const directProduct = {
    id: 'prod-direct',
    code: 'FLT-001',
    name: 'Oil filter',
    consumptionType: 'direct',
    isActive: true,
    deletedAt: null,
  };

  const partialProduct = {
    id: 'prod-partial',
    code: 'OIL-5W30',
    name: 'Engine oil 5W-30',
    consumptionType: 'partial',
    isActive: true,
    deletedAt: null,
  };

  const eventRecord = {
    id: 'evt-1',
    workOrderId: 'wo-1',
    productId: 'prod-direct',
    type: 'used',
    quantity: 2,
    registeredById: 'user-admin',
    createdAt: new Date('2026-01-02T00:00:00.000Z'),
    product: {
      id: 'prod-direct',
      code: 'FLT-001',
      name: 'Oil filter',
      consumptionType: 'direct',
    },
    registeredBy: { id: 'user-admin', name: 'Admin' },
  };

  const lotRecord = {
    id: 'lot-item-1',
    productId: 'prod-direct',
    remainingQuantity: 10,
    lot: { receivedAt: new Date('2026-01-01T00:00:00.000Z') },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      workOrder: {
        findUnique: jest.fn(),
      },
      product: {
        findUnique: jest.fn(),
      },
      employee: {
        findUnique: jest.fn(),
      },
      lotItem: {
        aggregate: jest.fn(),
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
      stockMovement: {
        create: jest.fn(),
      },
      workOrderConsumptionEvent: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(prisma)),
    } as unknown as PrismaService;

    const clientsService = { exists: jest.fn() };
    const vehiclesService = { findOne: jest.fn() };
    const notificationsService = { createForRole: jest.fn() };

    service = new WorkOrdersService(
      prisma,
      clientsService as never,
      vehiclesService as never,
      notificationsService as never
    );
  });

  const mockOpenWorkOrder = () => {
    (prisma.workOrder.findUnique as unknown as jest.Mock).mockResolvedValue(
      workOrderRecord
    );
  };

  const mockStock = (available: number) => {
    (prisma.lotItem.aggregate as unknown as jest.Mock).mockResolvedValue({
      _sum: { remainingQuantity: available },
    });
    (prisma.lotItem.findMany as unknown as jest.Mock).mockResolvedValue([
      { ...lotRecord, remainingQuantity: available },
    ]);
    (prisma.lotItem.updateMany as unknown as jest.Mock).mockResolvedValue({
      count: 1,
    });
  };

  describe('addConsumptionEvent', () => {
    it('registers a used event for a direct product and deducts stock', async () => {
      mockOpenWorkOrder();
      (prisma.product.findUnique as unknown as jest.Mock).mockResolvedValue(
        directProduct
      );
      mockStock(10);
      (
        prisma.workOrderConsumptionEvent.create as unknown as jest.Mock
      ).mockResolvedValue(eventRecord);

      const dto: CreateConsumptionEventDto = {
        productId: 'prod-direct',
        type: 'used',
        quantity: 2,
      };

      const result = await service.addConsumptionEvent('wo-1', dto, adminUser);

      expect(prisma.stockMovement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          productId: 'prod-direct',
          workOrderId: 'wo-1',
          type: 'service_usage',
          quantity: -2,
        }),
      });
      expect(prisma.workOrderConsumptionEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workOrderId: 'wo-1',
            productId: 'prod-direct',
            type: 'used',
            quantity: 2,
            registeredById: 'user-admin',
          }),
        })
      );
      expect(result).toMatchObject({
        id: 'evt-1',
        type: 'used',
        quantity: 2,
        product: { consumptionType: 'direct' },
      });
    });

    it('rejects opened/depleted events for direct products', async () => {
      mockOpenWorkOrder();
      (prisma.product.findUnique as unknown as jest.Mock).mockResolvedValue(
        directProduct
      );

      await expect(
        service.addConsumptionEvent(
          'wo-1',
          { productId: 'prod-direct', type: 'opened' },
          adminUser
        )
      ).rejects.toMatchObject({
        response: { errorCode: 'CONSUMPTION_TYPE_NOT_ALLOWED' },
      });
      expect(BadRequestException).toBeDefined();
      expect(prisma.stockMovement.create).not.toHaveBeenCalled();
    });

    it('requires a positive quantity for used events', async () => {
      mockOpenWorkOrder();
      (prisma.product.findUnique as unknown as jest.Mock).mockResolvedValue(
        directProduct
      );

      await expect(
        service.addConsumptionEvent(
          'wo-1',
          { productId: 'prod-direct', type: 'used' },
          adminUser
        )
      ).rejects.toMatchObject({
        response: { errorCode: 'CONSUMPTION_QUANTITY_REQUIRED' },
      });
      expect(prisma.stockMovement.create).not.toHaveBeenCalled();
    });

    it('rejects used events when stock is insufficient', async () => {
      mockOpenWorkOrder();
      (prisma.product.findUnique as unknown as jest.Mock).mockResolvedValue(
        directProduct
      );
      mockStock(1);

      await expect(
        service.addConsumptionEvent(
          'wo-1',
          { productId: 'prod-direct', type: 'used', quantity: 5 },
          adminUser
        )
      ).rejects.toMatchObject({
        response: { errorCode: 'INSUFFICIENT_STOCK' },
      });
      expect(ConflictException).toBeDefined();
      expect(prisma.stockMovement.create).not.toHaveBeenCalled();
    });

    it('registers an opened event for a partial product without stock movement', async () => {
      mockOpenWorkOrder();
      (prisma.product.findUnique as unknown as jest.Mock).mockResolvedValue(
        partialProduct
      );
      (
        prisma.workOrderConsumptionEvent.create as unknown as jest.Mock
      ).mockResolvedValue({
        ...eventRecord,
        productId: 'prod-partial',
        type: 'opened',
        quantity: null,
        product: {
          id: 'prod-partial',
          code: 'OIL-5W30',
          name: 'Engine oil 5W-30',
          consumptionType: 'partial',
        },
      });

      const result = await service.addConsumptionEvent(
        'wo-1',
        { productId: 'prod-partial', type: 'opened' },
        adminUser
      );

      expect(prisma.stockMovement.create).not.toHaveBeenCalled();
      expect(prisma.lotItem.updateMany).not.toHaveBeenCalled();
      expect(result).toMatchObject({ type: 'opened', quantity: null });
    });

    it('registers a depleted event with an open container and deducts one unit', async () => {
      mockOpenWorkOrder();
      (prisma.product.findUnique as unknown as jest.Mock).mockResolvedValue(
        partialProduct
      );
      (
        prisma.workOrderConsumptionEvent.count as unknown as jest.Mock
      ).mockImplementation(({ where }) => (where.type === 'opened' ? 2 : 1));
      mockStock(3);
      (
        prisma.workOrderConsumptionEvent.create as unknown as jest.Mock
      ).mockResolvedValue({
        ...eventRecord,
        productId: 'prod-partial',
        type: 'depleted',
        quantity: null,
        product: {
          id: 'prod-partial',
          code: 'OIL-5W30',
          name: 'Engine oil 5W-30',
          consumptionType: 'partial',
        },
      });

      const result = await service.addConsumptionEvent(
        'wo-1',
        { productId: 'prod-partial', type: 'depleted' },
        adminUser
      );

      expect(prisma.stockMovement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          productId: 'prod-partial',
          workOrderId: 'wo-1',
          type: 'service_usage',
          quantity: -1,
        }),
      });
      expect(result).toMatchObject({ type: 'depleted', quantity: null });
    });

    it('rejects depleted events without an open container', async () => {
      mockOpenWorkOrder();
      (prisma.product.findUnique as unknown as jest.Mock).mockResolvedValue(
        partialProduct
      );
      (
        prisma.workOrderConsumptionEvent.count as unknown as jest.Mock
      ).mockResolvedValue(0);

      await expect(
        service.addConsumptionEvent(
          'wo-1',
          { productId: 'prod-partial', type: 'depleted' },
          adminUser
        )
      ).rejects.toMatchObject({
        response: { errorCode: 'NO_OPEN_CONTAINER' },
      });
      expect(prisma.stockMovement.create).not.toHaveBeenCalled();
    });

    it('rejects depleted events when stock has no units left', async () => {
      mockOpenWorkOrder();
      (prisma.product.findUnique as unknown as jest.Mock).mockResolvedValue(
        partialProduct
      );
      (
        prisma.workOrderConsumptionEvent.count as unknown as jest.Mock
      ).mockImplementation(({ where }) => (where.type === 'opened' ? 1 : 0));
      mockStock(0);

      await expect(
        service.addConsumptionEvent(
          'wo-1',
          { productId: 'prod-partial', type: 'depleted' },
          adminUser
        )
      ).rejects.toMatchObject({
        response: { errorCode: 'INSUFFICIENT_STOCK' },
      });
    });

    it.each(['done', 'cancelled'])(
      'rejects events on a %s work order',
      async (status) => {
        (prisma.workOrder.findUnique as unknown as jest.Mock).mockResolvedValue(
          { ...workOrderRecord, status }
        );

        await expect(
          service.addConsumptionEvent(
            'wo-1',
            { productId: 'prod-direct', type: 'used', quantity: 1 },
            adminUser
          )
        ).rejects.toMatchObject({
          response: { errorCode: 'WORK_ORDER_CLOSED' },
        });
      }
    );

    it('throws 404 when the product does not exist or is inactive', async () => {
      mockOpenWorkOrder();
      (prisma.product.findUnique as unknown as jest.Mock).mockResolvedValue(
        null
      );

      await expect(
        service.addConsumptionEvent(
          'wo-1',
          { productId: 'prod-missing', type: 'used', quantity: 1 },
          adminUser
        )
      ).rejects.toMatchObject({
        response: { errorCode: 'PRODUCT_NOT_FOUND' },
      });
      expect(NotFoundException).toBeDefined();
    });

    it('scopes mechanic registrations to their assigned work orders', async () => {
      (prisma.employee.findUnique as unknown as jest.Mock).mockResolvedValue({
        id: 'emp-1',
      });
      (prisma.workOrder.findUnique as unknown as jest.Mock).mockResolvedValue(
        null
      );

      await expect(
        service.addConsumptionEvent(
          'wo-other',
          { productId: 'prod-direct', type: 'used', quantity: 1 },
          mechanicUser
        )
      ).rejects.toMatchObject({
        response: { errorCode: 'WORK_ORDER_NOT_FOUND' },
      });
      expect(prisma.workOrder.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ employeeId: 'emp-1' }),
        })
      );
    });

    it('rejects mechanics without a linked employee record', async () => {
      (prisma.employee.findUnique as unknown as jest.Mock).mockResolvedValue(
        null
      );

      await expect(
        service.addConsumptionEvent(
          'wo-1',
          { productId: 'prod-direct', type: 'used', quantity: 1 },
          mechanicUser
        )
      ).rejects.toMatchObject({
        response: { errorCode: 'WORK_ORDER_NOT_FOUND' },
      });
      expect(prisma.workOrder.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('listConsumptionEvents', () => {
    it('returns the event log ordered by creation for a visible work order', async () => {
      (prisma.workOrder.findUnique as unknown as jest.Mock).mockResolvedValue({
        ...workOrderRecord,
        client: { id: 'client-1', name: 'María' },
        vehicle: {
          id: 'vehicle-1',
          plate: 'ABC123',
          brand: 'Toyota',
          model: 'Corolla',
        },
        employee: null,
        branch: null,
        services: [],
        payments: [],
      });
      (
        prisma.workOrderConsumptionEvent.findMany as unknown as jest.Mock
      ).mockResolvedValue([eventRecord]);

      const result = await service.listConsumptionEvents('wo-1', adminUser);

      expect(prisma.workOrderConsumptionEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { workOrderId: 'wo-1' } })
      );
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ id: 'evt-1', type: 'used' });
    });

    it('scopes mechanic reads to their assigned work orders', async () => {
      (prisma.employee.findUnique as unknown as jest.Mock).mockResolvedValue({
        id: 'emp-1',
      });
      (prisma.workOrder.findUnique as unknown as jest.Mock).mockResolvedValue(
        null
      );

      await expect(
        service.listConsumptionEvents('wo-other', mechanicUser)
      ).rejects.toMatchObject({
        response: { errorCode: 'WORK_ORDER_NOT_FOUND' },
      });
      expect(prisma.workOrderConsumptionEvent.findMany).not.toHaveBeenCalled();
    });
  });
});
