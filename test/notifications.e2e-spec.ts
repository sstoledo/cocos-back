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

const users = [
  { id: 'user-admin', role: { name: RoleName.Admin } },
  { id: 'user-purchasing', role: { name: RoleName.Purchasing } },
  { id: 'user-warehouse', role: { name: RoleName.Warehouse } },
  { id: 'user-reception', role: { name: RoleName.Reception } },
  { id: 'user-mechanic', role: { name: RoleName.Mechanic } },
  { id: 'user-readonly', role: { name: RoleName.ReadOnly } },
];

const SUPPLIER_ID = 'supsupplier00000000000001';
const PRODUCT_ID = 'clproduct0000000000000001';
const CLIENT_ID = 'clclient00000000000000001';
const VEHICLE_ID = 'clvehicle0000000000000001';

type Row = Record<string, unknown>;

describe('Notifications (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let notifications: Array<Row>;
  let workOrders: Array<Row>;
  let purchaseOrders: Array<Row>;
  let poLines: Array<Row>;

  beforeEach(async () => {
    jest.clearAllMocks();

    notifications = [];
    workOrders = [];
    purchaseOrders = [];
    poLines = [];

    const supplier = { id: SUPPLIER_ID, name: 'Distribuidora Sur' };
    const product = { id: PRODUCT_ID, code: 'FLT-001', name: 'Oil filter' };
    const client = { id: CLIENT_ID, name: 'María García' };
    const vehicle = {
      id: VEHICLE_ID,
      clientId: CLIENT_ID,
      plate: 'ABC123',
      brand: 'Toyota',
      model: 'Corolla',
    };

    const matchesNotification = (notification: Row, where: Row) => {
      if (where.id !== undefined && notification.id !== where.id) return false;
      if (where.userId !== undefined && notification.userId !== where.userId) {
        return false;
      }
      if (where.readAt === null && notification.readAt !== null) return false;
      return true;
    };

    const withPoInclude = (po: Row) => ({
      ...po,
      supplier,
      lines: poLines
        .filter((line) => line.purchaseOrderId === po.id)
        .map((line) => ({ ...line, product })),
    });

    const withWoInclude = (wo: Row) => ({
      ...wo,
      client,
      vehicle,
      services: [],
      products: [],
      employee: null,
      branch: null,
    });

    prisma = {
      onModuleDestroy: jest.fn(),
      onModuleInit: jest.fn(),
      user: {
        findUnique: jest.fn(({ where }) => {
          return users.find((user) => user.id === where.id) ?? null;
        }),
        findMany: jest.fn(({ where }) => {
          const roles = where?.role?.name?.in as Array<RoleName> | undefined;
          return users
            .filter((user) => !roles || roles.includes(user.role.name))
            .map((user) => ({ id: user.id }));
        }),
      },
      notification: {
        createMany: jest.fn(({ data }) => {
          for (const entry of data) {
            notifications.push({
              id: `ntf-${notifications.length + 1}`,
              ...entry,
              readAt: null,
              createdAt: new Date(),
            });
          }
          return { count: data.length };
        }),
        findMany: jest.fn(({ where, skip, take }) => {
          const matches = notifications
            .filter((notification) =>
              matchesNotification(notification, where ?? {})
            )
            .sort(
              (a, b) =>
                new Date(b.createdAt as Date).getTime() -
                new Date(a.createdAt as Date).getTime()
            );
          return matches.slice(skip, skip + take);
        }),
        count: jest.fn(({ where }) => {
          return notifications.filter((notification) =>
            matchesNotification(notification, where ?? {})
          ).length;
        }),
        findUnique: jest.fn(({ where }) => {
          return (
            notifications.find(
              (notification) => notification.id === where.id
            ) ?? null
          );
        }),
        updateMany: jest.fn(({ where, data }) => {
          let count = 0;
          for (const notification of notifications) {
            if (matchesNotification(notification, where)) {
              Object.assign(notification, data);
              count += 1;
            }
          }
          return { count };
        }),
      },
      workOrder: {
        findUnique: jest.fn(({ where }) => {
          const found = workOrders.find(
            (wo) =>
              wo.id === where.id &&
              (where.isActive === undefined || wo.isActive === where.isActive)
          );
          return found ? withWoInclude(found) : null;
        }),
        updateMany: jest.fn(({ where, data }) => {
          const found = workOrders.find(
            (wo) =>
              wo.id === where.id &&
              (where.status === undefined || wo.status === where.status)
          );
          if (!found) return { count: 0 };
          if (data.status !== undefined) found.status = data.status;
          found.updatedAt = new Date();
          return { count: 1 };
        }),
      },
      purchaseOrder: {
        findUnique: jest.fn(({ where }) => {
          const found = purchaseOrders.find(
            (po) =>
              po.id === where.id &&
              (where.isActive === undefined || po.isActive === where.isActive)
          );
          return found ? withPoInclude(found) : null;
        }),
        updateMany: jest.fn(({ where, data }) => {
          const allowed = (where.status as { in: Array<string> }).in;
          const found = purchaseOrders.find(
            (po) => po.id === where.id && allowed.includes(po.status as string)
          );
          if (!found) return { count: 0 };
          if (data.status !== undefined) found.status = data.status;
          if (data.receiptCount?.increment !== undefined) {
            found.receiptCount =
              (found.receiptCount as number) + data.receiptCount.increment;
          }
          found.updatedAt = new Date();
          return { count: 1 };
        }),
      },
      purchaseOrderLine: {
        updateMany: jest.fn(({ where, data }) => {
          const line = poLines.find(
            (candidate) =>
              candidate.id === where.id &&
              (candidate.quantityReceived as number) <=
                where.quantityReceived.lte
          );
          if (!line) return { count: 0 };
          line.quantityReceived =
            (line.quantityReceived as number) + data.quantityReceived.increment;
          return { count: 1 };
        }),
      },
      lot: {
        create: jest.fn(({ data }) => ({
          id: 'lot-1',
          ...data,
          receivedAt: new Date(),
        })),
      },
      lotItem: {
        create: jest.fn(({ data }) => ({ id: 'li-1', ...data })),
      },
      stockMovement: {
        create: jest.fn(({ data }) => ({
          id: 'sm-1',
          ...data,
          createdAt: new Date(),
        })),
      },
      $transaction: jest.fn((callback) => callback(prisma)),
    } as unknown as PrismaService;

    (auth.api.getSession as unknown as jest.Mock).mockImplementation(
      ({ headers }: { headers?: Record<string, string> }) => {
        const cookie = headers?.cookie ?? '';
        const matched = users.find((user) =>
          cookie.includes(`session=${user.id.replace('user-', '')}`)
        );
        return matched ? { user: { id: matched.id } } : null;
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

  const agent = (session: string) =>
    request.agent(app.getHttpServer()).set('Cookie', `session=${session}`);
  const admin = () => agent('admin');
  const purchasing = () => agent('purchasing');
  const warehouse = () => agent('warehouse');
  const reception = () => agent('reception');
  const mechanic = () => agent('mechanic');
  const readonlyUser = () => agent('readonly');
  const anonymous = () => request.agent(app.getHttpServer());

  const seedNotification = (
    userId: string,
    id: string,
    createdAt: string,
    readAt: Date | null = null
  ) => {
    notifications.push({
      id,
      userId,
      type: 'work_order_ready',
      title: `Notification ${id}`,
      body: 'Body',
      link: '/work-orders/wo-1',
      readAt,
      createdAt: new Date(createdAt),
    });
  };

  const seedAdminPair = () => {
    seedNotification('user-admin', 'ntf-old', '2026-01-10T00:00:00.000Z');
    seedNotification(
      'user-admin',
      'ntf-new',
      '2026-02-10T00:00:00.000Z',
      new Date('2026-02-11T00:00:00.000Z')
    );
    seedNotification('user-reception', 'ntf-rec', '2026-01-15T00:00:00.000Z');
  };

  const seedWorkOrder = (id: string, status: string) => {
    workOrders.push({
      id,
      orderNumber: `OC-2026-00000${workOrders.length + 1}`,
      clientId: CLIENT_ID,
      vehicleId: VEHICLE_ID,
      description: null,
      status,
      totalAmount: new Prisma.Decimal(50),
      employeeId: null,
      branchId: null,
      isActive: true,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  };

  const seedOrderedPo = () => {
    purchaseOrders.push({
      id: 'po-1',
      purchaseOrderNumber: 'COM-2026-000001',
      supplierId: SUPPLIER_ID,
      status: 'ordered',
      notes: null,
      estimatedTotal: new Prisma.Decimal(50),
      receiptCount: 0,
      isActive: true,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    poLines.push({
      id: 'pol-1',
      purchaseOrderId: 'po-1',
      productId: PRODUCT_ID,
      quantityOrdered: 10,
      quantityReceived: 0,
      estimatedCostPrice: new Prisma.Decimal('5.00'),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  };

  const receivePo = (receivedQty: number) =>
    warehouse()
      .post('/api/purchase-orders/po-1/receive')
      .send({
        lines: [
          {
            lineId: 'pol-1',
            receivedQty,
            expirationDate: '2027-06-30',
            actualCostPrice: '5.50',
          },
        ],
      });

  describe('GET /api/notifications', () => {
    it('returns 401 for anonymous', async () => {
      expect((await anonymous().get('/api/notifications')).status).toBe(401);
    });

    it('returns only own notifications for every role, newest first', async () => {
      seedAdminPair();

      const adminList = await admin().get('/api/notifications');
      expect(adminList.status).toBe(200);
      expect(adminList.body.data.map((n: Row) => n.id)).toEqual([
        'ntf-new',
        'ntf-old',
      ]);
      expect(adminList.body.meta).toEqual({ page: 1, limit: 20, total: 2 });
      expect(adminList.body.data[0]).toMatchObject({
        id: 'ntf-new',
        type: 'work_order_ready',
        readAt: '2026-02-11T00:00:00.000Z',
      });
      expect(adminList.body.data[1].readAt).toBeNull();

      const receptionList = await reception().get('/api/notifications');
      expect(receptionList.status).toBe(200);
      expect(receptionList.body.data.map((n: Row) => n.id)).toEqual([
        'ntf-rec',
      ]);

      for (const role of [purchasing, warehouse, mechanic, readonlyUser]) {
        const response = await role().get('/api/notifications');
        expect(response.status).toBe(200);
        expect(response.body.data).toEqual([]);
        expect(response.body.meta.total).toBe(0);
      }
    });

    it('filters unread=true to own unread notifications', async () => {
      seedAdminPair();

      const response = await admin().get('/api/notifications?unread=true');

      expect(response.status).toBe(200);
      expect(response.body.meta.total).toBe(1);
      expect(response.body.data.map((n: Row) => n.id)).toEqual(['ntf-old']);
    });

    it('paginates with { data, meta } envelope', async () => {
      seedAdminPair();

      const pageOne = await admin().get('/api/notifications?page=1&limit=1');
      expect(pageOne.status).toBe(200);
      expect(pageOne.body.meta).toEqual({ page: 1, limit: 1, total: 2 });
      expect(pageOne.body.data.map((n: Row) => n.id)).toEqual(['ntf-new']);

      const pageTwo = await admin().get('/api/notifications?page=2&limit=1');
      expect(pageTwo.body.meta).toEqual({ page: 2, limit: 1, total: 2 });
      expect(pageTwo.body.data.map((n: Row) => n.id)).toEqual(['ntf-old']);
    });
  });

  describe('PATCH /api/notifications/:id/read', () => {
    it('marks an own unread notification as read', async () => {
      seedAdminPair();

      const response = await admin().patch('/api/notifications/ntf-old/read');

      expect(response.status).toBe(200);
      expect(response.body.id).toBe('ntf-old');
      expect(response.body.readAt).not.toBeNull();
      const row = notifications.find((n) => n.id === 'ntf-old');
      expect(row?.readAt).toBeInstanceOf(Date);
    });

    it('returns 404 for another user notification without leaking existence', async () => {
      seedAdminPair();

      const response = await reception().patch(
        '/api/notifications/ntf-old/read'
      );

      expect(response.status).toBe(404);
      expect(response.body.errorCode).toBe('NOTIFICATION_NOT_FOUND');
      const row = notifications.find((n) => n.id === 'ntf-old');
      expect(row?.readAt).toBeNull();
    });

    it('returns 404 when the notification is already read', async () => {
      seedAdminPair();

      const response = await admin().patch('/api/notifications/ntf-new/read');

      expect(response.status).toBe(404);
      expect(response.body.errorCode).toBe('NOTIFICATION_NOT_FOUND');
    });

    it('returns 401 for anonymous', async () => {
      seedAdminPair();

      expect(
        (await anonymous().patch('/api/notifications/ntf-old/read')).status
      ).toBe(401);
    });
  });

  describe('PATCH /api/notifications/read-all', () => {
    it('marks all own unread, returns the count and touches no other user', async () => {
      seedNotification('user-admin', 'ntf-a1', '2026-01-10T00:00:00.000Z');
      seedNotification('user-admin', 'ntf-a2', '2026-01-11T00:00:00.000Z');
      seedNotification(
        'user-admin',
        'ntf-a3',
        '2026-01-12T00:00:00.000Z',
        new Date('2026-01-12T01:00:00.000Z')
      );
      seedNotification('user-reception', 'ntf-r1', '2026-01-10T00:00:00.000Z');

      const response = await admin().patch('/api/notifications/read-all');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ count: 2 });
      expect(
        notifications
          .filter((n) => n.userId === 'user-admin')
          .every((n) => n.readAt !== null)
      ).toBe(true);
      const receptionRow = notifications.find((n) => n.id === 'ntf-r1');
      expect(receptionRow?.readAt).toBeNull();

      expect(
        (await anonymous().patch('/api/notifications/read-all')).status
      ).toBe(401);
    });
  });

  describe('generation — work order ready', () => {
    it('transition to done notifies Admin and Reception only', async () => {
      seedWorkOrder('wo-1', 'in_progress');

      const done = await admin()
        .patch('/api/work-orders/wo-1/status')
        .send({ status: 'done' });

      expect(done.status).toBe(200);
      expect(done.body.status).toBe('done');

      expect(notifications).toHaveLength(2);
      expect(notifications.map((n) => n.userId).sort()).toEqual([
        'user-admin',
        'user-reception',
      ]);
      expect(notifications[0]).toMatchObject({
        type: 'work_order_ready',
        title: 'Orden de trabajo OC-2026-000001 lista',
        link: '/work-orders/wo-1',
        readAt: null,
      });

      const adminList = await admin().get('/api/notifications');
      expect(adminList.body.meta.total).toBe(1);
      expect(adminList.body.data[0].type).toBe('work_order_ready');
      expect((await warehouse().get('/api/notifications')).body.data).toEqual(
        []
      );
    });

    it('transitions to in_progress or cancelled create no notifications', async () => {
      seedWorkOrder('wo-1', 'pending');
      seedWorkOrder('wo-2', 'pending');

      const inProgress = await admin()
        .patch('/api/work-orders/wo-1/status')
        .send({ status: 'in_progress' });
      expect(inProgress.status).toBe(200);

      const cancelled = await admin()
        .patch('/api/work-orders/wo-2/status')
        .send({ status: 'cancelled' });
      expect(cancelled.status).toBe(200);

      expect(notifications).toHaveLength(0);
    });
  });

  describe('generation — purchase order received', () => {
    it('partial receive notifies Admin, Purchasing and Warehouse with parcialmente', async () => {
      seedOrderedPo();

      const response = await receivePo(4);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('partially_received');

      expect(notifications).toHaveLength(3);
      expect(notifications.map((n) => n.userId).sort()).toEqual([
        'user-admin',
        'user-purchasing',
        'user-warehouse',
      ]);
      for (const notification of notifications) {
        expect(notification).toMatchObject({
          type: 'purchase_order_received',
          title: 'Orden de compra COM-2026-000001 recibida parcialmente',
          link: '/purchase-orders/po-1',
        });
      }

      expect((await reception().get('/api/notifications')).body.data).toEqual(
        []
      );
    });

    it('full receive notifies with recibida title, without parcialmente', async () => {
      seedOrderedPo();

      expect((await receivePo(4)).status).toBe(200);
      const full = await receivePo(6);

      expect(full.status).toBe(200);
      expect(full.body.status).toBe('received');

      expect(notifications).toHaveLength(6);
      const fullTitles = notifications.slice(3).map((n) => n.title as string);
      for (const title of fullTitles) {
        expect(title).toBe('Orden de compra COM-2026-000001 recibida');
        expect(title).not.toContain('parcialmente');
      }
    });
  });
});
