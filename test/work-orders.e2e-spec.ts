import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { Prisma, RoleName } from '@prisma/client';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { auth } from './../src/auth/auth';
import { PrismaService } from './../src/prisma/prisma.service';

jest.mock('better-auth', () => ({
  betterAuth: jest.fn(() => ({
    api: { getSession: jest.fn() },
  })),
}));

jest.mock('better-auth/adapters/prisma', () => ({
  prismaAdapter: jest.fn(() => ({ provider: 'postgresql' })),
}));

jest.mock('better-auth/node', () => ({
  toNodeHandler: jest.fn(() => jest.fn()),
  fromNodeHeaders: jest.fn((headers) => headers),
}));

const adminUser = { id: 'user-admin', role: { name: RoleName.Admin } };
const receptionUser = {
  id: 'user-reception',
  role: { name: RoleName.Reception },
};
const mechanicUser = { id: 'user-mechanic', role: { name: RoleName.Mechanic } };

const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const CLIENT_2_ID = '22222222-2222-4222-8222-222222222222';
const CLIENT_INACTIVE_ID = '33333333-3333-4333-8333-333333333333';
const VEHICLE_ID = '44444444-4444-4444-8444-444444444444';
const VEHICLE_2_ID = '55555555-5555-4555-8555-555555555555';
const SERVICE_ID = '66666666-6666-4666-8666-666666666666';
const SERVICE_2_ID = '77777777-7777-4777-8777-777777777777';
const SERVICE_INACTIVE_ID = '88888888-8888-4888-8888-888888888888';
const MISSING_ID = '99999999-9999-4999-8999-999999999999';
const PRODUCT_ID = 'aaaaaaaa-1111-4111-8111-111111111111';
const PRODUCT_2_ID = 'bbbbbbbb-2222-4222-8222-222222222222';
const PRODUCT_INACTIVE_ID = 'cccccccc-3333-4333-8333-333333333333';

describe('Work Orders (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const clients: Array<Record<string, unknown>> = [
      { id: CLIENT_ID, isActive: true, deletedAt: null },
      { id: CLIENT_2_ID, isActive: true, deletedAt: null },
      { id: CLIENT_INACTIVE_ID, isActive: false, deletedAt: new Date() },
    ];
    const vehicles: Array<Record<string, unknown>> = [
      { id: VEHICLE_ID, clientId: CLIENT_ID, isActive: true, deletedAt: null },
      {
        id: VEHICLE_2_ID,
        clientId: CLIENT_2_ID,
        isActive: true,
        deletedAt: null,
      },
    ];
    const services: Array<Record<string, unknown>> = [
      {
        id: SERVICE_ID,
        code: 'OIL-001',
        name: 'Oil change',
        description: 'Standard oil change',
        price: new Prisma.Decimal(50),
        estimatedDuration: 30,
        isActive: true,
        deletedAt: null,
      },
      {
        id: SERVICE_2_ID,
        code: 'BRK-001',
        name: 'Brake check',
        description: null,
        price: new Prisma.Decimal(100),
        estimatedDuration: null,
        isActive: true,
        deletedAt: null,
      },
      {
        id: SERVICE_INACTIVE_ID,
        code: 'OLD-001',
        name: 'Retired service',
        description: null,
        price: new Prisma.Decimal(10),
        estimatedDuration: null,
        isActive: false,
        deletedAt: new Date(),
      },
    ];
    const products: Array<Record<string, unknown>> = [
      {
        id: PRODUCT_ID,
        code: 'FLT-001',
        name: 'Oil filter',
        description: 'Engine oil filter',
        price: new Prisma.Decimal(100),
        isActive: true,
        deletedAt: null,
      },
      {
        id: PRODUCT_2_ID,
        code: 'PAD-001',
        name: 'Brake pads',
        description: null,
        price: new Prisma.Decimal(25),
        isActive: true,
        deletedAt: null,
      },
      {
        id: PRODUCT_INACTIVE_ID,
        code: 'OLD-P01',
        name: 'Retired part',
        description: null,
        price: new Prisma.Decimal(10),
        isActive: false,
        deletedAt: new Date(),
      },
    ];
    const workOrders: Array<Record<string, unknown>> = [];
    const workOrderServices: Array<Record<string, unknown>> = [];
    const workOrderProducts: Array<Record<string, unknown>> = [];
    const sequences: Array<Record<string, unknown>> = [];

    const linesFor = (workOrderId: string) =>
      workOrderServices
        .filter((line) => line.workOrderId === workOrderId)
        .map((line) => ({
          ...line,
          service: services.find((service) => service.id === line.serviceId),
        }));

    const productLinesFor = (workOrderId: string) =>
      workOrderProducts
        .filter((line) => line.workOrderId === workOrderId)
        .map((line) => ({
          ...line,
          product: products.find((product) => product.id === line.productId),
        }));

    prisma = {
      onModuleDestroy: jest.fn(),
      onModuleInit: jest.fn(),
      client: {
        findUnique: jest.fn(({ where }) => {
          const found = clients.find(
            (client) =>
              client.id === where.id &&
              (where.isActive === undefined ||
                client.isActive === where.isActive)
          );
          return found ?? null;
        }),
      },
      vehicle: {
        findUnique: jest.fn(({ where }) => {
          const found = vehicles.find(
            (vehicle) =>
              vehicle.id === where.id &&
              (where.isActive === undefined ||
                vehicle.isActive === where.isActive)
          );
          return found ?? null;
        }),
      },
      service: {
        findUnique: jest.fn(({ where }) => {
          const found = services.find(
            (service) =>
              service.id === where.id &&
              (where.isActive === undefined ||
                service.isActive === where.isActive)
          );
          return found ?? null;
        }),
      },
      product: {
        findUnique: jest.fn(({ where }) => {
          const found = products.find(
            (product) =>
              product.id === where.id &&
              (where.isActive === undefined ||
                product.isActive === where.isActive)
          );
          return found ?? null;
        }),
      },
      workOrder: {
        create: jest.fn(({ data }) => {
          if (workOrders.some((wo) => wo.orderNumber === data.orderNumber)) {
            throw new Prisma.PrismaClientKnownRequestError(
              'unique constraint',
              { clientVersion: '6.0.0', code: 'P2002' }
            );
          }
          const id = `wo-${workOrders.length + 1}`;
          const workOrder = {
            id,
            orderNumber: data.orderNumber,
            clientId: data.clientId,
            vehicleId: data.vehicleId,
            description: data.description ?? null,
            status: data.status ?? 'pending',
            totalAmount: new Prisma.Decimal(data.totalAmount),
            isActive: true,
            deletedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          workOrders.push(workOrder);
          for (const [index, line] of data.services.create.entries()) {
            workOrderServices.push({
              id: `wos-${workOrderServices.length + 1}`,
              workOrderId: id,
              serviceId: line.serviceId,
              quantity: line.quantity,
              unitPriceSnapshot: line.unitPriceSnapshot,
              subtotal: line.subtotal,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
          }
          for (const [index, line] of data.products.create.entries()) {
            workOrderProducts.push({
              id: `wop-${workOrderProducts.length + 1}`,
              workOrderId: id,
              productId: line.productId,
              quantity: line.quantity,
              unitPriceSnapshot: line.unitPriceSnapshot,
              subtotal: line.subtotal,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
          }
          return {
            ...workOrder,
            services: linesFor(id),
            products: productLinesFor(id),
          };
        }),
        findMany: jest.fn(({ where, skip, take }) => {
          let result = workOrders.filter((wo) => wo.isActive);
          if (where?.orderNumber?.contains) {
            const query = where.orderNumber.contains.toLowerCase();
            result = result.filter((wo) =>
              (wo.orderNumber as string).toLowerCase().includes(query)
            );
          }
          return result.slice(skip, skip + take).map((wo) => ({
            ...wo,
            services: linesFor(wo.id as string),
            products: productLinesFor(wo.id as string),
          }));
        }),
        findUnique: jest.fn(({ where }) => {
          if (where.orderNumber) {
            return (
              workOrders.find((wo) => wo.orderNumber === where.orderNumber) ??
              null
            );
          }
          const found = workOrders.find(
            (wo) =>
              wo.id === where.id &&
              (where.isActive === undefined || wo.isActive === where.isActive)
          );
          if (!found) return null;
          return {
            ...found,
            services: linesFor(found.id as string),
            products: productLinesFor(found.id as string),
          };
        }),
        update: jest.fn(({ where, data }) => {
          const index = workOrders.findIndex((wo) => wo.id === where.id);
          const updated = {
            ...workOrders[index],
            ...data,
            updatedAt: new Date(),
          };
          workOrders[index] = updated;
          return {
            ...updated,
            services: linesFor(updated.id as string),
            products: productLinesFor(updated.id as string),
          };
        }),
        count: jest.fn(({ where }) => {
          let result = workOrders.filter((wo) => wo.isActive);
          if (where?.orderNumber?.contains) {
            const query = where.orderNumber.contains.toLowerCase();
            result = result.filter((wo) =>
              (wo.orderNumber as string).toLowerCase().includes(query)
            );
          }
          return result.length;
        }),
      },
      workOrderService: {
        deleteMany: jest.fn(({ where }) => {
          const before = workOrderServices.length;
          for (let i = workOrderServices.length - 1; i >= 0; i--) {
            if (workOrderServices[i].workOrderId === where.workOrderId) {
              workOrderServices.splice(i, 1);
            }
          }
          return { count: before - workOrderServices.length };
        }),
        createMany: jest.fn(({ data }) => {
          for (const line of data) {
            workOrderServices.push({
              id: `wos-${workOrderServices.length + 1}`,
              ...line,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
          }
          return { count: data.length };
        }),
        findMany: jest.fn(({ where }) =>
          workOrderServices.filter(
            (line) => line.workOrderId === where.workOrderId
          )
        ),
      },
      workOrderProduct: {
        deleteMany: jest.fn(({ where }) => {
          const before = workOrderProducts.length;
          for (let i = workOrderProducts.length - 1; i >= 0; i--) {
            if (workOrderProducts[i].workOrderId === where.workOrderId) {
              workOrderProducts.splice(i, 1);
            }
          }
          return { count: before - workOrderProducts.length };
        }),
        createMany: jest.fn(({ data }) => {
          for (const line of data) {
            workOrderProducts.push({
              id: `wop-${workOrderProducts.length + 1}`,
              ...line,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
          }
          return { count: data.length };
        }),
        findMany: jest.fn(({ where }) =>
          workOrderProducts.filter(
            (line) => line.workOrderId === where.workOrderId
          )
        ),
      },
      $transaction: jest.fn((callback) => callback(prisma)),
      workOrderNumberSequence: {
        upsert: jest.fn(({ where, create, update }) => {
          const existing = sequences.find((seq) => seq.year === where.year);
          if (existing) {
            existing.lastNumber =
              (existing.lastNumber as number) + update.lastNumber.increment;
            return existing;
          }
          const sequence = { id: `seq-${sequences.length + 1}`, ...create };
          sequences.push(sequence);
          return sequence;
        }),
      },
      user: {
        findUnique: jest.fn(({ where }) => {
          if (where.id === adminUser.id) return adminUser;
          if (where.id === receptionUser.id) return receptionUser;
          if (where.id === mechanicUser.id) return mechanicUser;
          return null;
        }),
      },
    } as unknown as PrismaService;

    (auth.api.getSession as unknown as jest.Mock).mockImplementation(
      ({ headers }: { headers?: Record<string, string> }) => {
        const cookie = headers?.cookie ?? '';
        if (cookie.includes('session=admin'))
          return { user: { id: adminUser.id } };
        if (cookie.includes('session=reception'))
          return { user: { id: receptionUser.id } };
        if (cookie.includes('session=mechanic'))
          return { user: { id: mechanicUser.id } };
        return null;
      }
    );

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        forbidNonWhitelisted: true,
        transform: true,
        whitelist: true,
      })
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const admin = () =>
    request.agent(app.getHttpServer()).set('Cookie', 'session=admin');
  const reception = () =>
    request.agent(app.getHttpServer()).set('Cookie', 'session=reception');
  const mechanic = () =>
    request.agent(app.getHttpServer()).set('Cookie', 'session=mechanic');
  const anonymous = () => request.agent(app.getHttpServer());

  const createWorkOrder = (agent: ReturnType<typeof admin>) =>
    agent.post('/api/work-orders').send({
      clientId: CLIENT_ID,
      vehicleId: VEHICLE_ID,
      description: 'Oil change and brake check',
      services: [
        { serviceId: SERVICE_ID, quantity: 2 },
        { serviceId: SERVICE_2_ID, quantity: 1, unitPrice: 75.5 },
      ],
    });

  describe('POST /api/work-orders', () => {
    it('creates a work order with sequential order number and price snapshots', async () => {
      const year = new Date().getFullYear();

      const response = await createWorkOrder(admin());

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        orderNumber: `OC-${year}-000001`,
        clientId: CLIENT_ID,
        vehicleId: VEHICLE_ID,
        status: 'pending',
        totalAmount: '175.50',
        isActive: true,
      });
      expect(response.body.services).toHaveLength(2);
      expect(response.body.services[0]).toMatchObject({
        serviceId: SERVICE_ID,
        quantity: 2,
        unitPriceSnapshot: '50.00',
        subtotal: '100.00',
      });
      expect(response.body.services[1]).toMatchObject({
        serviceId: SERVICE_2_ID,
        quantity: 1,
        unitPriceSnapshot: '75.50',
        subtotal: '75.50',
      });

      const second = await admin()
        .post('/api/work-orders')
        .send({
          clientId: CLIENT_ID,
          vehicleId: VEHICLE_ID,
          services: [{ serviceId: SERVICE_ID, quantity: 1 }],
        });

      expect(second.status).toBe(201);
      expect(second.body.orderNumber).toBe(`OC-${year}-000002`);
      expect(second.body.totalAmount).toBe('50.00');
    });

    it('creates a work order as reception', async () => {
      const response = await reception()
        .post('/api/work-orders')
        .send({
          clientId: CLIENT_ID,
          vehicleId: VEHICLE_ID,
          services: [{ serviceId: SERVICE_ID, quantity: 1 }],
        });

      expect(response.status).toBe(201);
    });

    it('returns 400 when services is an empty array', async () => {
      const response = await admin().post('/api/work-orders').send({
        clientId: CLIENT_ID,
        vehicleId: VEHICLE_ID,
        services: [],
      });

      expect(response.status).toBe(400);
      expect(prisma.workOrder.create).not.toHaveBeenCalled();
    });

    it('creates a work order with an explicit status', async () => {
      const response = await admin()
        .post('/api/work-orders')
        .send({
          clientId: CLIENT_ID,
          vehicleId: VEHICLE_ID,
          status: 'in_progress',
          services: [{ serviceId: SERVICE_ID, quantity: 1 }],
        });

      expect(response.status).toBe(201);
      expect(response.body.status).toBe('in_progress');
    });

    it('returns 400 for an invalid status on create', async () => {
      const response = await admin()
        .post('/api/work-orders')
        .send({
          clientId: CLIENT_ID,
          vehicleId: VEHICLE_ID,
          status: 'not_a_status',
          services: [{ serviceId: SERVICE_ID, quantity: 1 }],
        });

      expect(response.status).toBe(400);
      expect(prisma.workOrder.create).not.toHaveBeenCalled();
    });

    it('returns 400 for invalid DTOs', async () => {
      const missingServices = await admin().post('/api/work-orders').send({
        clientId: CLIENT_ID,
        vehicleId: VEHICLE_ID,
      });
      expect(missingServices.status).toBe(400);

      const invalidQuantity = await admin()
        .post('/api/work-orders')
        .send({
          clientId: CLIENT_ID,
          vehicleId: VEHICLE_ID,
          services: [{ serviceId: SERVICE_ID, quantity: 0 }],
        });
      expect(invalidQuantity.status).toBe(400);

      const invalidUnitPrice = await admin()
        .post('/api/work-orders')
        .send({
          clientId: CLIENT_ID,
          vehicleId: VEHICLE_ID,
          services: [{ serviceId: SERVICE_ID, quantity: 1, unitPrice: 10.999 }],
        });
      expect(invalidUnitPrice.status).toBe(400);

      expect(prisma.workOrder.create).not.toHaveBeenCalled();
    });

    it('returns 404 when the client does not exist or is inactive', async () => {
      const missing = await admin()
        .post('/api/work-orders')
        .send({
          clientId: MISSING_ID,
          vehicleId: VEHICLE_ID,
          services: [{ serviceId: SERVICE_ID, quantity: 1 }],
        });
      expect(missing.status).toBe(404);
      expect(missing.body.errorCode).toBe('CLIENT_NOT_FOUND');

      const inactive = await admin()
        .post('/api/work-orders')
        .send({
          clientId: CLIENT_INACTIVE_ID,
          vehicleId: VEHICLE_ID,
          services: [{ serviceId: SERVICE_ID, quantity: 1 }],
        });
      expect(inactive.status).toBe(404);
      expect(inactive.body.errorCode).toBe('CLIENT_NOT_FOUND');
    });

    it('returns 404 when the vehicle does not exist', async () => {
      const response = await admin()
        .post('/api/work-orders')
        .send({
          clientId: CLIENT_ID,
          vehicleId: MISSING_ID,
          services: [{ serviceId: SERVICE_ID, quantity: 1 }],
        });

      expect(response.status).toBe(404);
      expect(response.body.errorCode).toBe('VEHICLE_NOT_FOUND');
    });

    it('returns 409 when the vehicle belongs to another client', async () => {
      const response = await admin()
        .post('/api/work-orders')
        .send({
          clientId: CLIENT_ID,
          vehicleId: VEHICLE_2_ID,
          services: [{ serviceId: SERVICE_ID, quantity: 1 }],
        });

      expect(response.status).toBe(409);
      expect(response.body.errorCode).toBe('VEHICLE_CLIENT_MISMATCH');
    });

    it('returns 404 when a service does not exist or is inactive', async () => {
      const missing = await admin()
        .post('/api/work-orders')
        .send({
          clientId: CLIENT_ID,
          vehicleId: VEHICLE_ID,
          services: [{ serviceId: MISSING_ID, quantity: 1 }],
        });
      expect(missing.status).toBe(404);
      expect(missing.body.errorCode).toBe('SERVICE_NOT_FOUND');

      const inactive = await admin()
        .post('/api/work-orders')
        .send({
          clientId: CLIENT_ID,
          vehicleId: VEHICLE_ID,
          services: [{ serviceId: SERVICE_INACTIVE_ID, quantity: 1 }],
        });
      expect(inactive.status).toBe(404);
      expect(inactive.body.errorCode).toBe('SERVICE_NOT_FOUND');
    });

    it('creates a work order with products only and snapshots the product price', async () => {
      const response = await admin()
        .post('/api/work-orders')
        .send({
          clientId: CLIENT_ID,
          vehicleId: VEHICLE_ID,
          products: [{ productId: PRODUCT_ID, quantity: 2 }],
        });

      expect(response.status).toBe(201);
      expect(response.body.totalAmount).toBe('200.00');
      expect(response.body.services).toEqual([]);
      expect(response.body.products).toHaveLength(1);
      expect(response.body.products[0]).toMatchObject({
        productId: PRODUCT_ID,
        quantity: 2,
        unitPriceSnapshot: '100.00',
        subtotal: '200.00',
      });
      expect(response.body.products[0].product).toMatchObject({
        code: 'FLT-001',
        name: 'Oil filter',
        price: '100.00',
      });
    });

    it('creates a work order with services and products, totaling both line types', async () => {
      const response = await admin()
        .post('/api/work-orders')
        .send({
          clientId: CLIENT_ID,
          vehicleId: VEHICLE_ID,
          services: [{ serviceId: SERVICE_ID, quantity: 3 }],
          products: [{ productId: PRODUCT_ID, quantity: 1, unitPrice: 80.5 }],
        });

      expect(response.status).toBe(201);
      expect(response.body.totalAmount).toBe('230.50');
      expect(response.body.services).toHaveLength(1);
      expect(response.body.services[0]).toMatchObject({
        serviceId: SERVICE_ID,
        quantity: 3,
        unitPriceSnapshot: '50.00',
        subtotal: '150.00',
      });
      expect(response.body.products).toHaveLength(1);
      expect(response.body.products[0]).toMatchObject({
        productId: PRODUCT_ID,
        quantity: 1,
        unitPriceSnapshot: '80.50',
        subtotal: '80.50',
      });
    });

    it('returns 404 when a product does not exist or is inactive', async () => {
      const missing = await admin()
        .post('/api/work-orders')
        .send({
          clientId: CLIENT_ID,
          vehicleId: VEHICLE_ID,
          products: [{ productId: MISSING_ID, quantity: 1 }],
        });
      expect(missing.status).toBe(404);
      expect(missing.body.errorCode).toBe('PRODUCT_NOT_FOUND');

      const inactive = await admin()
        .post('/api/work-orders')
        .send({
          clientId: CLIENT_ID,
          vehicleId: VEHICLE_ID,
          products: [{ productId: PRODUCT_INACTIVE_ID, quantity: 1 }],
        });
      expect(inactive.status).toBe(404);
      expect(inactive.body.errorCode).toBe('PRODUCT_NOT_FOUND');
    });

    it('returns 400 when services and products are both empty or omitted', async () => {
      const emptyArrays = await admin().post('/api/work-orders').send({
        clientId: CLIENT_ID,
        vehicleId: VEHICLE_ID,
        services: [],
        products: [],
      });
      expect(emptyArrays.status).toBe(400);

      const omitted = await admin().post('/api/work-orders').send({
        clientId: CLIENT_ID,
        vehicleId: VEHICLE_ID,
      });
      expect(omitted.status).toBe(400);
      expect(omitted.body.errorCode).toBe('WORK_ORDER_EMPTY_LINES');

      expect(prisma.workOrder.create).not.toHaveBeenCalled();
    });

    it('returns 401 when not authenticated', async () => {
      const response = await anonymous()
        .post('/api/work-orders')
        .send({
          clientId: CLIENT_ID,
          vehicleId: VEHICLE_ID,
          services: [{ serviceId: SERVICE_ID, quantity: 1 }],
        });

      expect(response.status).toBe(401);
      expect(prisma.workOrder.create).not.toHaveBeenCalled();
    });

    it('returns 403 for roles other than admin or reception', async () => {
      const response = await mechanic()
        .post('/api/work-orders')
        .send({
          clientId: CLIENT_ID,
          vehicleId: VEHICLE_ID,
          services: [{ serviceId: SERVICE_ID, quantity: 1 }],
        });

      expect(response.status).toBe(403);
      expect(prisma.workOrder.create).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/work-orders', () => {
    it('returns paginated active work orders with line items', async () => {
      await createWorkOrder(admin());
      await admin()
        .post('/api/work-orders')
        .send({
          clientId: CLIENT_2_ID,
          vehicleId: VEHICLE_2_ID,
          services: [{ serviceId: SERVICE_2_ID, quantity: 1 }],
        });

      const response = await mechanic().get('/api/work-orders?page=1&limit=1');

      expect(response.status).toBe(200);
      expect(response.body.meta).toEqual({ page: 1, limit: 1, total: 2 });
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].services.length).toBeGreaterThan(0);

      const pageTwo = await mechanic().get('/api/work-orders?page=2&limit=1');
      expect(pageTwo.status).toBe(200);
      expect(pageTwo.body.data).toHaveLength(1);
    });

    it('searches by order number', async () => {
      await createWorkOrder(admin());
      await admin()
        .post('/api/work-orders')
        .send({
          clientId: CLIENT_ID,
          vehicleId: VEHICLE_ID,
          services: [{ serviceId: SERVICE_ID, quantity: 1 }],
        });

      const year = new Date().getFullYear();
      const response = await mechanic().get(
        `/api/work-orders?query=OC-${year}-000001`
      );

      expect(response.status).toBe(200);
      expect(response.body.meta.total).toBe(1);
      expect(response.body.data[0].orderNumber).toBe(`OC-${year}-000001`);
    });

    it('excludes soft-deleted work orders', async () => {
      await createWorkOrder(admin());
      await admin().delete('/api/work-orders/wo-1');

      const response = await mechanic().get('/api/work-orders');

      expect(response.status).toBe(200);
      expect(response.body.meta.total).toBe(0);
      expect(response.body.data).toHaveLength(0);
    });

    it('returns 401 when not authenticated', async () => {
      const response = await anonymous().get('/api/work-orders');

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/work-orders/:id', () => {
    it('returns a work order with line items and total', async () => {
      await createWorkOrder(admin());

      const response = await mechanic().get('/api/work-orders/wo-1');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: 'wo-1',
        clientId: CLIENT_ID,
        vehicleId: VEHICLE_ID,
        totalAmount: '175.50',
      });
      expect(response.body.services).toHaveLength(2);
      expect(response.body.services[0].service).toMatchObject({
        code: 'OIL-001',
        name: 'Oil change',
      });
    });

    it('includes product lines with string decimals', async () => {
      await admin()
        .post('/api/work-orders')
        .send({
          clientId: CLIENT_ID,
          vehicleId: VEHICLE_ID,
          services: [{ serviceId: SERVICE_ID, quantity: 3 }],
          products: [{ productId: PRODUCT_ID, quantity: 1, unitPrice: 80.5 }],
        });

      const response = await mechanic().get('/api/work-orders/wo-1');

      expect(response.status).toBe(200);
      expect(response.body.totalAmount).toBe('230.50');
      expect(response.body.services).toHaveLength(1);
      expect(response.body.products).toHaveLength(1);
      expect(response.body.products[0]).toMatchObject({
        productId: PRODUCT_ID,
        quantity: 1,
        unitPriceSnapshot: '80.50',
        subtotal: '80.50',
      });
      expect(response.body.products[0].product).toMatchObject({
        code: 'FLT-001',
        name: 'Oil filter',
        price: '100.00',
      });
    });

    it('returns 404 for a deleted or missing work order', async () => {
      await createWorkOrder(admin());
      await admin().delete('/api/work-orders/wo-1');

      const deleted = await mechanic().get('/api/work-orders/wo-1');
      expect(deleted.status).toBe(404);
      expect(deleted.body.errorCode).toBe('WORK_ORDER_NOT_FOUND');

      const missing = await mechanic().get('/api/work-orders/wo-999');
      expect(missing.status).toBe(404);
      expect(missing.body.errorCode).toBe('WORK_ORDER_NOT_FOUND');
    });
  });

  describe('PATCH /api/work-orders/:id', () => {
    it('updates line items and recomputes the total', async () => {
      await createWorkOrder(admin());

      const response = await admin()
        .patch('/api/work-orders/wo-1')
        .send({
          services: [{ serviceId: SERVICE_ID, quantity: 2 }],
        });

      expect(response.status).toBe(200);
      expect(response.body.totalAmount).toBe('100.00');
      expect(response.body.services).toHaveLength(1);
      expect(response.body.services[0]).toMatchObject({
        serviceId: SERVICE_ID,
        quantity: 2,
        subtotal: '100.00',
      });
    });

    it('replaces only product lines, leaving services untouched and recomputing the total', async () => {
      await admin()
        .post('/api/work-orders')
        .send({
          clientId: CLIENT_ID,
          vehicleId: VEHICLE_ID,
          services: [{ serviceId: SERVICE_ID, quantity: 1 }],
          products: [{ productId: PRODUCT_ID, quantity: 1 }],
        });

      const response = await admin()
        .patch('/api/work-orders/wo-1')
        .send({
          products: [{ productId: PRODUCT_2_ID, quantity: 2 }],
        });

      expect(response.status).toBe(200);
      expect(response.body.totalAmount).toBe('100.00');
      expect(response.body.services).toHaveLength(1);
      expect(response.body.services[0]).toMatchObject({
        serviceId: SERVICE_ID,
        quantity: 1,
        subtotal: '50.00',
      });
      expect(response.body.products).toHaveLength(1);
      expect(response.body.products[0]).toMatchObject({
        productId: PRODUCT_2_ID,
        quantity: 2,
        unitPriceSnapshot: '25.00',
        subtotal: '50.00',
      });
    });

    it('replaces only service lines, leaving products untouched and recomputing the total', async () => {
      await admin()
        .post('/api/work-orders')
        .send({
          clientId: CLIENT_ID,
          vehicleId: VEHICLE_ID,
          services: [{ serviceId: SERVICE_ID, quantity: 1 }],
          products: [{ productId: PRODUCT_ID, quantity: 1 }],
        });

      const response = await admin()
        .patch('/api/work-orders/wo-1')
        .send({
          services: [{ serviceId: SERVICE_2_ID, quantity: 2 }],
        });

      expect(response.status).toBe(200);
      expect(response.body.totalAmount).toBe('300.00');
      expect(response.body.services).toHaveLength(1);
      expect(response.body.services[0]).toMatchObject({
        serviceId: SERVICE_2_ID,
        quantity: 2,
        subtotal: '200.00',
      });
      expect(response.body.products).toHaveLength(1);
      expect(response.body.products[0]).toMatchObject({
        productId: PRODUCT_ID,
        quantity: 1,
        unitPriceSnapshot: '100.00',
        subtotal: '100.00',
      });
    });

    it('updates the status', async () => {
      await createWorkOrder(admin());

      const response = await admin()
        .patch('/api/work-orders/wo-1')
        .send({ status: 'in_progress' });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('in_progress');
    });

    it('returns 400 when services is an empty array', async () => {
      await createWorkOrder(admin());

      const response = await admin()
        .patch('/api/work-orders/wo-1')
        .send({ services: [] });

      expect(response.status).toBe(400);
      expect(prisma.workOrderService.deleteMany).not.toHaveBeenCalled();
    });

    it('updates clientId and vehicleId when both are valid', async () => {
      await createWorkOrder(admin());

      const response = await admin()
        .patch('/api/work-orders/wo-1')
        .send({ clientId: CLIENT_2_ID, vehicleId: VEHICLE_2_ID });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        clientId: CLIENT_2_ID,
        vehicleId: VEHICLE_2_ID,
      });
    });

    it('returns 409 when the new vehicle belongs to another client', async () => {
      await createWorkOrder(admin());

      const response = await admin()
        .patch('/api/work-orders/wo-1')
        .send({ vehicleId: VEHICLE_2_ID });

      expect(response.status).toBe(409);
      expect(response.body.errorCode).toBe('VEHICLE_CLIENT_MISMATCH');
    });

    it('returns 404 when the new client does not exist or is inactive', async () => {
      await createWorkOrder(admin());

      const response = await admin()
        .patch('/api/work-orders/wo-1')
        .send({ clientId: CLIENT_INACTIVE_ID });

      expect(response.status).toBe(404);
      expect(response.body.errorCode).toBe('CLIENT_NOT_FOUND');
    });

    it('returns 404 when the work order does not exist', async () => {
      const response = await admin()
        .patch('/api/work-orders/wo-999')
        .send({ description: 'Nope' });

      expect(response.status).toBe(404);
      expect(response.body.errorCode).toBe('WORK_ORDER_NOT_FOUND');
    });

    it('returns 401 when not authenticated and 403 for a mechanic', async () => {
      const unauthenticated = await anonymous()
        .patch('/api/work-orders/wo-1')
        .send({ description: 'Nope' });
      expect(unauthenticated.status).toBe(401);

      const forbidden = await mechanic()
        .patch('/api/work-orders/wo-1')
        .send({ description: 'Nope' });
      expect(forbidden.status).toBe(403);
    });
  });

  describe('DELETE /api/work-orders/:id', () => {
    it('soft-deletes a work order and subsequent GET returns 404', async () => {
      await createWorkOrder(admin());

      const response = await admin().delete('/api/work-orders/wo-1');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ id: 'wo-1', isActive: false });
      expect(response.body.deletedAt).toBeDefined();

      const getResponse = await mechanic().get('/api/work-orders/wo-1');
      expect(getResponse.status).toBe(404);
    });

    it('soft-deletes a work order with product lines and subsequent GET returns 404', async () => {
      await admin()
        .post('/api/work-orders')
        .send({
          clientId: CLIENT_ID,
          vehicleId: VEHICLE_ID,
          products: [{ productId: PRODUCT_ID, quantity: 1 }],
        });

      const response = await admin().delete('/api/work-orders/wo-1');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ id: 'wo-1', isActive: false });

      const getResponse = await mechanic().get('/api/work-orders/wo-1');
      expect(getResponse.status).toBe(404);
      expect(getResponse.body.errorCode).toBe('WORK_ORDER_NOT_FOUND');
    });

    it('returns 404 when deleting an already deleted work order', async () => {
      await createWorkOrder(admin());
      await admin().delete('/api/work-orders/wo-1');

      const response = await admin().delete('/api/work-orders/wo-1');

      expect(response.status).toBe(404);
      expect(response.body.errorCode).toBe('WORK_ORDER_NOT_FOUND');
    });

    it('returns 401 when not authenticated and 403 for a mechanic', async () => {
      const unauthenticated = await anonymous().delete('/api/work-orders/wo-1');
      expect(unauthenticated.status).toBe(401);

      const forbidden = await mechanic().delete('/api/work-orders/wo-1');
      expect(forbidden.status).toBe(403);
    });
  });
});
