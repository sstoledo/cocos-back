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
// Mechanic without a linked Employee record: sees no work orders.
const unlinkedMechanicUser = {
  id: 'user-mechanic-solo',
  role: { name: RoleName.Mechanic },
};

const CLIENT_ID = 'clclient00000000000000001';
const CLIENT_2_ID = 'clclient00000000000000002';
const CLIENT_INACTIVE_ID = 'clclientinactive00000001';
const VEHICLE_ID = 'clvehicle0000000000000001';
const VEHICLE_2_ID = 'clvehicle0000000000000002';
const SERVICE_ID = 'clservice0000000000000001';
const SERVICE_2_ID = 'clservice0000000000000002';
const SERVICE_INACTIVE_ID = 'clserviceinactive00000001';
const MISSING_ID = 'clmissing0000000000000001';
const EMPLOYEE_ID = 'clemployee000000000000001';
const EMPLOYEE_INACTIVE_ID = 'clemployeeinactive0000001';
// T1b: active employee not linked to any user (another mechanic's orders).
const EMPLOYEE_OTHER_ID = 'clemployeeother0000000001';
const BRANCH_ID = 'clbranch00000000000000001';
const BRANCH_INACTIVE_ID = 'clbranchinactive000000001';

describe('Work Orders (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const clients: Array<Record<string, unknown>> = [
      {
        id: CLIENT_ID,
        name: 'María García',
        isActive: true,
        deletedAt: null,
      },
      {
        id: CLIENT_2_ID,
        name: 'Carlos López',
        isActive: true,
        deletedAt: null,
      },
      {
        id: CLIENT_INACTIVE_ID,
        name: 'Cliente Inactivo',
        isActive: false,
        deletedAt: new Date(),
      },
    ];
    const vehicles: Array<Record<string, unknown>> = [
      {
        id: VEHICLE_ID,
        clientId: CLIENT_ID,
        plate: 'ABC123',
        brand: 'Toyota',
        model: 'Corolla',
        isActive: true,
        deletedAt: null,
      },
      {
        id: VEHICLE_2_ID,
        clientId: CLIENT_2_ID,
        plate: 'XYZ789',
        brand: 'Ford',
        model: 'Focus',
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
    const workOrders: Array<Record<string, unknown>> = [];
    const workOrderServices: Array<Record<string, unknown>> = [];
    const workOrderPayments: Array<Record<string, unknown>> = [];
    const sequences: Array<Record<string, unknown>> = [];
    const employees: Array<Record<string, unknown>> = [
      {
        id: EMPLOYEE_ID,
        name: 'Juan Pérez',
        userId: mechanicUser.id,
        isActive: true,
        deletedAt: null,
      },
      {
        id: EMPLOYEE_INACTIVE_ID,
        name: 'Empleado Inactivo',
        isActive: false,
        deletedAt: new Date(),
      },
      {
        id: EMPLOYEE_OTHER_ID,
        name: 'Otro Mecánico',
        isActive: true,
        deletedAt: null,
      },
    ];
    const branches: Array<Record<string, unknown>> = [
      {
        id: BRANCH_ID,
        name: 'Sucursal Central',
        isActive: true,
        deletedAt: null,
      },
      {
        id: BRANCH_INACTIVE_ID,
        name: 'Sucursal Cerrada',
        isActive: false,
        deletedAt: new Date(),
      },
    ];
    const linesFor = (workOrderId: string) =>
      workOrderServices
        .filter((line) => line.workOrderId === workOrderId)
        .map((line) => ({
          ...line,
          service: services.find((service) => service.id === line.serviceId),
        }));

    const paymentsFor = (workOrderId: string) =>
      workOrderPayments
        .filter((payment) => payment.workOrderId === workOrderId)
        .sort(
          (a, b) =>
            new Date(a.paidAt as Date).getTime() -
            new Date(b.paidAt as Date).getTime()
        );

    const relationsFor = (workOrder: Record<string, unknown>) => ({
      payments: paymentsFor(workOrder.id as string),
      employee:
        employees.find((employee) => employee.id === workOrder.employeeId) ??
        null,
      branch:
        branches.find((branch) => branch.id === workOrder.branchId) ?? null,
      client: clients.find((client) => client.id === workOrder.clientId),
      vehicle: vehicles.find((vehicle) => vehicle.id === workOrder.vehicleId),
    });

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
      branch: {
        findUnique: jest.fn(({ where }) => {
          const found = branches.find(
            (branch) =>
              branch.id === where.id &&
              (where.isActive === undefined ||
                branch.isActive === where.isActive)
          );
          return found ?? null;
        }),
      },
      employee: {
        findUnique: jest.fn(({ where }) => {
          const found = employees.find(
            (employee) =>
              (where.id === undefined || employee.id === where.id) &&
              (where.userId === undefined ||
                employee.userId === where.userId) &&
              (where.isActive === undefined ||
                employee.isActive === where.isActive)
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
            employeeId: data.employeeId ?? null,
            branchId: data.branchId ?? null,
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
          return {
            ...workOrder,
            services: linesFor(id),
            ...relationsFor(workOrder),
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
          if (where?.employeeId !== undefined) {
            result = result.filter((wo) => wo.employeeId === where.employeeId);
          }
          return result.slice(skip, skip + take).map((wo) => ({
            ...wo,
            services: linesFor(wo.id as string),
            ...relationsFor(wo),
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
              (where.isActive === undefined ||
                wo.isActive === where.isActive) &&
              (where.employeeId === undefined ||
                wo.employeeId === where.employeeId)
          );
          if (!found) return null;
          return {
            ...found,
            services: linesFor(found.id as string),
            ...relationsFor(found),
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
            ...relationsFor(updated),
          };
        }),
        updateMany: jest.fn(({ where, data }) => {
          const index = workOrders.findIndex(
            (wo) =>
              wo.id === where.id &&
              (where.status === undefined || wo.status === where.status)
          );
          if (index === -1) return { count: 0 };
          workOrders[index] = {
            ...workOrders[index],
            ...data,
            updatedAt: new Date(),
          };
          return { count: 1 };
        }),
        count: jest.fn(({ where }) => {
          let result = workOrders.filter((wo) => wo.isActive);
          if (where?.orderNumber?.contains) {
            const query = where.orderNumber.contains.toLowerCase();
            result = result.filter((wo) =>
              (wo.orderNumber as string).toLowerCase().includes(query)
            );
          }
          if (where?.employeeId !== undefined) {
            result = result.filter((wo) => wo.employeeId === where.employeeId);
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
      workOrderPayment: {
        create: jest.fn(({ data }) => {
          const payment = {
            id: `pay-${workOrderPayments.length + 1}`,
            workOrderId: data.workOrderId,
            amount: new Prisma.Decimal(data.amount),
            paymentMethod: data.paymentMethod,
            note: data.note ?? null,
            paidAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          workOrderPayments.push(payment);
          return payment;
        }),
        findMany: jest.fn(({ where }) => paymentsFor(where.workOrderId)),
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
          if (where.id === unlinkedMechanicUser.id) return unlinkedMechanicUser;
          return null;
        }),
        // B11.4: createForRole resolves recipients by role inside the
        // transition transaction.
        findMany: jest.fn(({ where }) => {
          const roles = where?.role?.name?.in as Array<RoleName> | undefined;
          return [adminUser, receptionUser, mechanicUser, unlinkedMechanicUser]
            .filter((user) => !roles || roles.includes(user.role.name))
            .map((user) => ({ id: user.id }));
        }),
      },
      notification: {
        createMany: jest.fn(({ data }) => ({ count: data.length })),
      },
    } as unknown as PrismaService;

    (auth.api.getSession as unknown as jest.Mock).mockImplementation(
      ({ headers }: { headers?: Record<string, string> }) => {
        const cookie = headers?.cookie ?? '';
        if (cookie.includes('session=admin'))
          return { user: { id: adminUser.id } };
        if (cookie.includes('session=reception'))
          return { user: { id: receptionUser.id } };
        if (cookie.includes('session=mechanic-solo'))
          return { user: { id: unlinkedMechanicUser.id } };
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
  const unlinkedMechanic = () =>
    request.agent(app.getHttpServer()).set('Cookie', 'session=mechanic-solo');
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

  // T1b: a Mechanic may only transition orders assigned to their linked
  // Employee — use this helper for any test where mechanic() drives status.
  const createAssignedToMechanic = () =>
    admin()
      .post('/api/work-orders')
      .send({
        clientId: CLIENT_ID,
        vehicleId: VEHICLE_ID,
        employeeId: EMPLOYEE_ID,
        description: 'Oil change and brake check',
        services: [{ serviceId: SERVICE_ID, quantity: 1 }],
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

    it('returns 400 when services are omitted', async () => {
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

      const response = await admin().get('/api/work-orders?page=1&limit=1');

      expect(response.status).toBe(200);
      expect(response.body.meta).toEqual({ page: 1, limit: 1, total: 2 });
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].services.length).toBeGreaterThan(0);

      const pageTwo = await admin().get('/api/work-orders?page=2&limit=1');
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
      const response = await admin().get(
        `/api/work-orders?query=OC-${year}-000001`
      );

      expect(response.status).toBe(200);
      expect(response.body.meta.total).toBe(1);
      expect(response.body.data[0].orderNumber).toBe(`OC-${year}-000001`);
    });

    it('excludes soft-deleted work orders', async () => {
      await createWorkOrder(admin());
      await admin().delete('/api/work-orders/wo-1');

      const response = await admin().get('/api/work-orders');

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

      const response = await admin().get('/api/work-orders/wo-1');

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

    it('returns 404 for a deleted or missing work order', async () => {
      await createWorkOrder(admin());
      await admin().delete('/api/work-orders/wo-1');

      const deleted = await admin().get('/api/work-orders/wo-1');
      expect(deleted.status).toBe(404);
      expect(deleted.body.errorCode).toBe('WORK_ORDER_NOT_FOUND');

      const missing = await mechanic().get('/api/work-orders/wo-999');
      expect(missing.status).toBe(404);
      expect(missing.body.errorCode).toBe('WORK_ORDER_NOT_FOUND');
    });
  });

  describe('mechanic visibility (T1)', () => {
    it('lists only the work orders assigned to the linked employee', async () => {
      await createAssignedToMechanic();
      await createWorkOrder(admin());

      const response = await mechanic().get('/api/work-orders');

      expect(response.status).toBe(200);
      expect(response.body.meta).toEqual({ page: 1, limit: 10, total: 1 });
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].employee).toEqual({
        id: EMPLOYEE_ID,
        name: 'Juan Pérez',
      });

      const adminList = await admin().get('/api/work-orders');
      expect(adminList.body.meta.total).toBe(2);
    });

    it('opens an assigned order but gets 404 WORK_ORDER_NOT_FOUND for one assigned to no one', async () => {
      await createAssignedToMechanic();
      await createWorkOrder(admin());

      const assigned = await mechanic().get('/api/work-orders/wo-1');
      expect(assigned.status).toBe(200);
      expect(assigned.body.id).toBe('wo-1');

      const unassigned = await mechanic().get('/api/work-orders/wo-2');
      expect(unassigned.status).toBe(404);
      expect(unassigned.body.errorCode).toBe('WORK_ORDER_NOT_FOUND');

      const adminDetail = await admin().get('/api/work-orders/wo-2');
      expect(adminDetail.status).toBe(200);
    });

    it('returns an empty list and 404 on detail for a mechanic without a linked employee', async () => {
      await createAssignedToMechanic();

      const list = await unlinkedMechanic().get('/api/work-orders');
      expect(list.status).toBe(200);
      expect(list.body).toEqual({
        data: [],
        meta: { page: 1, limit: 10, total: 0 },
      });

      const detail = await unlinkedMechanic().get('/api/work-orders/wo-1');
      expect(detail.status).toBe(404);
      expect(detail.body.errorCode).toBe('WORK_ORDER_NOT_FOUND');
    });
  });

  describe('mechanic status transitions (T1b)', () => {
    it('transitions its own assigned order', async () => {
      await createAssignedToMechanic();

      const response = await mechanic()
        .patch('/api/work-orders/wo-1/status')
        .send({ status: 'in_progress' });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('in_progress');
    });

    it('returns 404 WORK_ORDER_NOT_FOUND when transitioning an order assigned to no one or another employee', async () => {
      await createWorkOrder(admin());

      const unassigned = await mechanic()
        .patch('/api/work-orders/wo-1/status')
        .send({ status: 'in_progress' });
      expect(unassigned.status).toBe(404);
      expect(unassigned.body.errorCode).toBe('WORK_ORDER_NOT_FOUND');

      const reassigned = await admin()
        .patch('/api/work-orders/wo-1')
        .send({ employeeId: EMPLOYEE_OTHER_ID });
      expect(reassigned.status).toBe(200);

      const otherEmployee = await mechanic()
        .patch('/api/work-orders/wo-1/status')
        .send({ status: 'in_progress' });
      expect(otherEmployee.status).toBe(404);
      expect(otherEmployee.body.errorCode).toBe('WORK_ORDER_NOT_FOUND');

      // Admin remains unaffected: the same order transitions fine.
      const adminTransition = await admin()
        .patch('/api/work-orders/wo-1/status')
        .send({ status: 'in_progress' });
      expect(adminTransition.status).toBe(200);
      expect(adminTransition.body.status).toBe('in_progress');
    });

    it('returns 404 WORK_ORDER_NOT_FOUND for a mechanic without a linked employee', async () => {
      await createAssignedToMechanic();
      (prisma.workOrder.findUnique as jest.Mock).mockClear();

      const response = await unlinkedMechanic()
        .patch('/api/work-orders/wo-1/status')
        .send({ status: 'in_progress' });

      expect(response.status).toBe(404);
      expect(response.body.errorCode).toBe('WORK_ORDER_NOT_FOUND');
      expect(prisma.workOrder.findUnique).not.toHaveBeenCalled();
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

    it('replaces service lines and recomputes the total from services only', async () => {
      await admin()
        .post('/api/work-orders')
        .send({
          clientId: CLIENT_ID,
          vehicleId: VEHICLE_ID,
          services: [{ serviceId: SERVICE_ID, quantity: 1 }],
        });

      const response = await admin()
        .patch('/api/work-orders/wo-1')
        .send({
          services: [{ serviceId: SERVICE_2_ID, quantity: 2 }],
        });

      expect(response.status).toBe(200);
      expect(response.body.totalAmount).toBe('200.00');
      expect(response.body.services).toHaveLength(1);
      expect(response.body.services[0]).toMatchObject({
        serviceId: SERVICE_2_ID,
        quantity: 2,
        subtotal: '200.00',
      });
    });

    it('returns 400 when the body contains status and leaves the status unchanged', async () => {
      await createWorkOrder(admin());

      const response = await admin()
        .patch('/api/work-orders/wo-1')
        .send({ status: 'in_progress' });

      expect(response.status).toBe(400);

      const current = await admin().get('/api/work-orders/wo-1');
      expect(current.body.status).toBe('pending');
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

  describe('PATCH /api/work-orders/:id/status', () => {
    it('transitions pending → in_progress as a mechanic (S1)', async () => {
      await createAssignedToMechanic();

      const response = await mechanic()
        .patch('/api/work-orders/wo-1/status')
        .send({ status: 'in_progress' });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('in_progress');
    });

    it('returns 400 for an invalid status value', async () => {
      await createWorkOrder(admin());

      const response = await admin()
        .patch('/api/work-orders/wo-1/status')
        .send({ status: 'not_a_status' });

      expect(response.status).toBe(400);
    });

    it('returns 409 INVALID_STATUS_TRANSITION for an illegal transition', async () => {
      await createWorkOrder(admin());

      const response = await admin()
        .patch('/api/work-orders/wo-1/status')
        .send({ status: 'done' });

      expect(response.status).toBe(409);
      expect(response.body.errorCode).toBe('INVALID_STATUS_TRANSITION');
    });

    it('returns 404 for a missing order and 401 when unauthenticated', async () => {
      const missing = await admin()
        .patch('/api/work-orders/wo-999/status')
        .send({ status: 'in_progress' });
      expect(missing.status).toBe(404);
      expect(missing.body.errorCode).toBe('WORK_ORDER_NOT_FOUND');

      const unauthenticated = await anonymous()
        .patch('/api/work-orders/wo-1/status')
        .send({ status: 'in_progress' });
      expect(unauthenticated.status).toBe(401);
    });

    it('returns 404 when transitioning a soft-deleted order (S6)', async () => {
      await createAssignedToMechanic();
      await admin().delete('/api/work-orders/wo-1');

      const response = await mechanic()
        .patch('/api/work-orders/wo-1/status')
        .send({ status: 'in_progress' });

      expect(response.status).toBe(404);
      expect(response.body.errorCode).toBe('WORK_ORDER_NOT_FOUND');
    });

    it('rejects any transition from cancelled with 409 (S5)', async () => {
      await createAssignedToMechanic();
      await mechanic()
        .patch('/api/work-orders/wo-1/status')
        .send({ status: 'cancelled' });

      const response = await mechanic()
        .patch('/api/work-orders/wo-1/status')
        .send({ status: 'in_progress' });

      expect(response.status).toBe(409);
      expect(response.body.errorCode).toBe('INVALID_STATUS_TRANSITION');
    });

    it('rejects any transition from done, including same-status, with 409 (S5)', async () => {
      await createAssignedToMechanic();
      await mechanic()
        .patch('/api/work-orders/wo-1/status')
        .send({ status: 'in_progress' });
      await mechanic()
        .patch('/api/work-orders/wo-1/status')
        .send({ status: 'done' });

      for (const status of ['in_progress', 'cancelled', 'done']) {
        const response = await mechanic()
          .patch('/api/work-orders/wo-1/status')
          .send({ status });
        expect(response.status).toBe(409);
        expect(response.body.errorCode).toBe('INVALID_STATUS_TRANSITION');
      }
    });

    it('completes an order through the full status chain', async () => {
      await createAssignedToMechanic();
      await mechanic()
        .patch('/api/work-orders/wo-1/status')
        .send({ status: 'in_progress' });

      const response = await mechanic()
        .patch('/api/work-orders/wo-1/status')
        .send({ status: 'done' });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('done');
    });
  });

  describe('assignment (B7.4)', () => {
    const createAssigned = () =>
      admin()
        .post('/api/work-orders')
        .send({
          clientId: CLIENT_ID,
          vehicleId: VEHICLE_ID,
          employeeId: EMPLOYEE_ID,
          branchId: BRANCH_ID,
          services: [{ serviceId: SERVICE_ID, quantity: 1 }],
        });

    it('creates an order with employee and branch summaries (S1)', async () => {
      const response = await createAssigned();

      expect(response.status).toBe(201);
      expect(response.body.employee).toEqual({
        id: EMPLOYEE_ID,
        name: 'Juan Pérez',
      });
      expect(response.body.branch).toEqual({
        id: BRANCH_ID,
        name: 'Sucursal Central',
      });
    });

    it('creates an unassigned order with null summaries (S2)', async () => {
      const response = await admin()
        .post('/api/work-orders')
        .send({
          clientId: CLIENT_ID,
          vehicleId: VEHICLE_ID,
          services: [{ serviceId: SERVICE_ID, quantity: 1 }],
        });

      expect(response.status).toBe(201);
      expect(response.body.employee).toBeNull();
      expect(response.body.branch).toBeNull();
      expect(prisma.employee.findUnique).not.toHaveBeenCalled();
      expect(prisma.branch.findUnique).not.toHaveBeenCalled();
    });

    it('creates an unassigned order when assignment fields are explicit null (S2)', async () => {
      const response = await admin()
        .post('/api/work-orders')
        .send({
          clientId: CLIENT_ID,
          vehicleId: VEHICLE_ID,
          employeeId: null,
          branchId: null,
          services: [{ serviceId: SERVICE_ID, quantity: 1 }],
        });

      expect(response.status).toBe(201);
      expect(response.body.employee).toBeNull();
      expect(response.body.branch).toBeNull();
      expect(prisma.employee.findUnique).not.toHaveBeenCalled();
      expect(prisma.branch.findUnique).not.toHaveBeenCalled();
    });

    it('returns 404 EMPLOYEE_NOT_FOUND for a missing or inactive employee on create (S3)', async () => {
      const missing = await admin()
        .post('/api/work-orders')
        .send({
          clientId: CLIENT_ID,
          vehicleId: VEHICLE_ID,
          employeeId: MISSING_ID,
          services: [{ serviceId: SERVICE_ID, quantity: 1 }],
        });
      expect(missing.status).toBe(404);
      expect(missing.body.errorCode).toBe('EMPLOYEE_NOT_FOUND');

      const inactive = await admin()
        .post('/api/work-orders')
        .send({
          clientId: CLIENT_ID,
          vehicleId: VEHICLE_ID,
          employeeId: EMPLOYEE_INACTIVE_ID,
          services: [{ serviceId: SERVICE_ID, quantity: 1 }],
        });
      expect(inactive.status).toBe(404);
      expect(inactive.body.errorCode).toBe('EMPLOYEE_NOT_FOUND');

      expect(prisma.workOrder.create).not.toHaveBeenCalled();
    });

    it('returns 404 BRANCH_NOT_FOUND for a missing or inactive branch on create (S4)', async () => {
      const missing = await admin()
        .post('/api/work-orders')
        .send({
          clientId: CLIENT_ID,
          vehicleId: VEHICLE_ID,
          branchId: MISSING_ID,
          services: [{ serviceId: SERVICE_ID, quantity: 1 }],
        });
      expect(missing.status).toBe(404);
      expect(missing.body.errorCode).toBe('BRANCH_NOT_FOUND');

      const inactive = await admin()
        .post('/api/work-orders')
        .send({
          clientId: CLIENT_ID,
          vehicleId: VEHICLE_ID,
          branchId: BRANCH_INACTIVE_ID,
          services: [{ serviceId: SERVICE_ID, quantity: 1 }],
        });
      expect(inactive.status).toBe(404);
      expect(inactive.body.errorCode).toBe('BRANCH_NOT_FOUND');

      expect(prisma.workOrder.create).not.toHaveBeenCalled();
    });

    it('assigns, unassigns with explicit null, and leaves assignment unchanged on empty PATCH (S5)', async () => {
      await admin()
        .post('/api/work-orders')
        .send({
          clientId: CLIENT_ID,
          vehicleId: VEHICLE_ID,
          services: [{ serviceId: SERVICE_ID, quantity: 1 }],
        });

      const assigned = await admin()
        .patch('/api/work-orders/wo-1')
        .send({ employeeId: EMPLOYEE_ID, branchId: BRANCH_ID });
      expect(assigned.status).toBe(200);
      expect(assigned.body.employee).toEqual({
        id: EMPLOYEE_ID,
        name: 'Juan Pérez',
      });
      expect(assigned.body.branch).toEqual({
        id: BRANCH_ID,
        name: 'Sucursal Central',
      });

      const unassigned = await admin()
        .patch('/api/work-orders/wo-1')
        .send({ employeeId: null });
      expect(unassigned.status).toBe(200);
      expect(unassigned.body.employee).toBeNull();
      expect(unassigned.body.branch).toEqual({
        id: BRANCH_ID,
        name: 'Sucursal Central',
      });

      const untouched = await admin().patch('/api/work-orders/wo-1').send({});
      expect(untouched.status).toBe(200);
      expect(untouched.body.employee).toBeNull();
      expect(untouched.body.branch).toEqual({
        id: BRANCH_ID,
        name: 'Sucursal Central',
      });

      const listed = await admin().get('/api/work-orders');
      expect(listed.status).toBe(200);
      expect(listed.body.data[0].branch).toEqual({
        id: BRANCH_ID,
        name: 'Sucursal Central',
      });
    });

    it('keeps the assignment intact across the full status chain (S7)', async () => {
      const created = await admin()
        .post('/api/work-orders')
        .send({
          clientId: CLIENT_ID,
          vehicleId: VEHICLE_ID,
          employeeId: EMPLOYEE_ID,
          branchId: BRANCH_ID,
          services: [{ serviceId: SERVICE_ID, quantity: 2 }],
        });
      expect(created.status).toBe(201);

      const expectedAssignment = {
        employee: { id: EMPLOYEE_ID, name: 'Juan Pérez' },
        branch: { id: BRANCH_ID, name: 'Sucursal Central' },
      };

      const inProgress = await mechanic()
        .patch('/api/work-orders/wo-1/status')
        .send({ status: 'in_progress' });
      expect(inProgress.status).toBe(200);
      expect(inProgress.body.employee).toEqual(expectedAssignment.employee);
      expect(inProgress.body.branch).toEqual(expectedAssignment.branch);

      const done = await mechanic()
        .patch('/api/work-orders/wo-1/status')
        .send({ status: 'done' });
      expect(done.status).toBe(200);
      expect(done.body.status).toBe('done');
      expect(done.body.employee).toEqual(expectedAssignment.employee);
      expect(done.body.branch).toEqual(expectedAssignment.branch);
    });
  });

  describe('client/vehicle summaries', () => {
    const expectedClient = { id: CLIENT_ID, name: 'María García' };
    const expectedVehicle = {
      id: VEHICLE_ID,
      plate: 'ABC123',
      brand: 'Toyota',
      model: 'Corolla',
    };

    it('returns client and vehicle summaries on create, list, detail, update, and delete', async () => {
      const created = await createWorkOrder(admin());
      expect(created.status).toBe(201);
      expect(created.body.client).toEqual(expectedClient);
      expect(created.body.vehicle).toEqual(expectedVehicle);

      const listed = await admin().get('/api/work-orders');
      expect(listed.status).toBe(200);
      expect(listed.body.data[0].client).toEqual(expectedClient);
      expect(listed.body.data[0].vehicle).toEqual(expectedVehicle);

      const detail = await admin().get('/api/work-orders/wo-1');
      expect(detail.status).toBe(200);
      expect(detail.body.client).toEqual(expectedClient);
      expect(detail.body.vehicle).toEqual(expectedVehicle);

      const updated = await admin()
        .patch('/api/work-orders/wo-1')
        .send({ description: 'Updated description' });
      expect(updated.status).toBe(200);
      expect(updated.body.client).toEqual(expectedClient);
      expect(updated.body.vehicle).toEqual(expectedVehicle);

      const removed = await admin().delete('/api/work-orders/wo-1');
      expect(removed.status).toBe(200);
      expect(removed.body.client).toEqual(expectedClient);
      expect(removed.body.vehicle).toEqual(expectedVehicle);
    });

    it('returns client and vehicle summaries across status transitions', async () => {
      const created = await createAssignedToMechanic();
      expect(created.status).toBe(201);

      const inProgress = await mechanic()
        .patch('/api/work-orders/wo-1/status')
        .send({ status: 'in_progress' });
      expect(inProgress.status).toBe(200);
      expect(inProgress.body.client).toEqual(expectedClient);
      expect(inProgress.body.vehicle).toEqual(expectedVehicle);
    });
  });

  describe('DELETE /api/work-orders/:id', () => {
    it('soft-deletes a work order and subsequent GET returns 404', async () => {
      await createWorkOrder(admin());

      const response = await admin().delete('/api/work-orders/wo-1');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ id: 'wo-1', isActive: false });
      expect(response.body.deletedAt).toBeDefined();

      const getResponse = await admin().get('/api/work-orders/wo-1');
      expect(getResponse.status).toBe(404);
    });

    it('soft-deletes a work order with service lines and subsequent GET returns 404', async () => {
      await admin()
        .post('/api/work-orders')
        .send({
          clientId: CLIENT_ID,
          vehicleId: VEHICLE_ID,
          services: [{ serviceId: SERVICE_ID, quantity: 1 }],
        });

      const response = await admin().delete('/api/work-orders/wo-1');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ id: 'wo-1', isActive: false });

      const getResponse = await admin().get('/api/work-orders/wo-1');
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

  describe('POST /api/work-orders/:id/payments', () => {
    it('registers a partial payment and reflects paidAmount/paymentStatus', async () => {
      await createWorkOrder(admin());

      const response = await admin()
        .post('/api/work-orders/wo-1/payments')
        .send({ amount: 100, paymentMethod: 'cash', note: 'Adelanto' });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        workOrderId: 'wo-1',
        amount: '100.00',
        paymentMethod: 'cash',
        note: 'Adelanto',
      });

      // The created order totals 175.50; 100 paid leaves it partial.
      const detail = await admin().get('/api/work-orders/wo-1');
      expect(detail.body.paidAmount).toBe('100.00');
      expect(detail.body.paymentStatus).toBe('partial');
    });

    it('marks the order as paid once payments cover the total', async () => {
      await createWorkOrder(admin());

      await reception()
        .post('/api/work-orders/wo-1/payments')
        .send({ amount: 100, paymentMethod: 'cash' });
      const second = await reception()
        .post('/api/work-orders/wo-1/payments')
        .send({ amount: 75.5, paymentMethod: 'transfer' });

      expect(second.status).toBe(201);

      const detail = await admin().get('/api/work-orders/wo-1');
      expect(detail.body.paidAmount).toBe('175.50');
      expect(detail.body.paymentStatus).toBe('paid');
    });

    it('returns 400 WORK_ORDER_OVERPAYMENT beyond the remaining balance', async () => {
      await createWorkOrder(admin());
      await admin()
        .post('/api/work-orders/wo-1/payments')
        .send({ amount: 100, paymentMethod: 'cash' });

      const response = await admin()
        .post('/api/work-orders/wo-1/payments')
        .send({ amount: 75.51, paymentMethod: 'cash' });

      expect(response.status).toBe(400);
      expect(response.body.errorCode).toBe('WORK_ORDER_OVERPAYMENT');
    });

    it('returns 400 for a non-positive amount', async () => {
      await createWorkOrder(admin());

      const response = await admin()
        .post('/api/work-orders/wo-1/payments')
        .send({ amount: 0, paymentMethod: 'cash' });

      expect(response.status).toBe(400);
    });

    it('returns 400 for an unknown payment method', async () => {
      await createWorkOrder(admin());

      const response = await admin()
        .post('/api/work-orders/wo-1/payments')
        .send({ amount: 10, paymentMethod: 'crypto' });

      expect(response.status).toBe(400);
    });

    it('returns 404 WORK_ORDER_NOT_FOUND for an unknown order', async () => {
      const response = await admin()
        .post(`/api/work-orders/${MISSING_ID}/payments`)
        .send({ amount: 10, paymentMethod: 'cash' });

      expect(response.status).toBe(404);
      expect(response.body.errorCode).toBe('WORK_ORDER_NOT_FOUND');
    });

    it('returns 409 WORK_ORDER_CANCELLED on a cancelled order', async () => {
      await createWorkOrder(admin());
      await admin().patch('/api/work-orders/wo-1/status').send({
        status: 'cancelled',
      });

      const response = await admin()
        .post('/api/work-orders/wo-1/payments')
        .send({ amount: 10, paymentMethod: 'cash' });

      expect(response.status).toBe(409);
      expect(response.body.errorCode).toBe('WORK_ORDER_CANCELLED');
    });

    it('returns 401 when not authenticated and 403 for a mechanic', async () => {
      await createWorkOrder(admin());

      const unauthenticated = await anonymous()
        .post('/api/work-orders/wo-1/payments')
        .send({ amount: 10, paymentMethod: 'cash' });
      expect(unauthenticated.status).toBe(401);

      const forbidden = await mechanic()
        .post('/api/work-orders/wo-1/payments')
        .send({ amount: 10, paymentMethod: 'cash' });
      expect(forbidden.status).toBe(403);
    });
  });

  describe('GET /api/work-orders/:id/payments', () => {
    it('lists payments ordered by paidAt asc', async () => {
      await createWorkOrder(admin());
      await admin()
        .post('/api/work-orders/wo-1/payments')
        .send({ amount: 50, paymentMethod: 'cash', note: 'Adelanto' });
      await admin()
        .post('/api/work-orders/wo-1/payments')
        .send({ amount: 25, paymentMethod: 'card' });

      const response = await reception().get('/api/work-orders/wo-1/payments');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
      expect(response.body[0]).toMatchObject({
        amount: '50.00',
        paymentMethod: 'cash',
        note: 'Adelanto',
      });
      expect(response.body[1]).toMatchObject({
        amount: '25.00',
        paymentMethod: 'card',
        note: null,
      });
    });

    it('returns 404 for an unknown order and 401 for anonymous', async () => {
      const missing = await admin().get(
        `/api/work-orders/${MISSING_ID}/payments`
      );
      expect(missing.status).toBe(404);

      const unauthenticated = await anonymous().get(
        '/api/work-orders/wo-1/payments'
      );
      expect(unauthenticated.status).toBe(401);
    });
  });
});
