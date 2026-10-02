import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import {
  PurchaseOrderStatus,
  RoleName,
  SaleStatus,
  WorkOrderStatus,
} from '@prisma/client';
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

/**
 * Only `Date` is faked so the two sales windows and `generatedAt` are
 * deterministic while supertest keeps its real timers.
 */
const REAL_TIMERS = [
  'setTimeout',
  'setInterval',
  'clearTimeout',
  'clearInterval',
  'setImmediate',
  'clearImmediate',
  'nextTick',
  'queueMicrotask',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'requestIdleCallback',
  'cancelIdleCallback',
  'hrtime',
  'performance',
] as const;

// Server-local clock, pinned mid-month so "earlier this month" is a row that
// is genuinely distinct from "today". Built with the local Date constructor so
// every bound below holds in whatever TZ the suite runs in.
const NOW = new Date(2026, 8, 30, 14, 0, 0);
const START_OF_TODAY = new Date(2026, 8, 30);
const START_OF_MONTH = new Date(2026, 8, 1);
const EARLIER_THIS_MONTH = new Date(2026, 8, 2, 9, 0, 0);
const PREVIOUS_MONTH = new Date(2026, 7, 15, 9, 0, 0);

const users = [
  { id: 'user-admin', role: { name: RoleName.Admin } },
  { id: 'user-purchasing', role: { name: RoleName.Purchasing } },
  { id: 'user-warehouse', role: { name: RoleName.Warehouse } },
  { id: 'user-reception', role: { name: RoleName.Reception } },
  { id: 'user-mechanic', role: { name: RoleName.Mechanic } },
  { id: 'user-readonly', role: { name: RoleName.ReadOnly } },
];

type Row = Record<string, unknown>;

const matchesSale = (sale: Row, where: Row) => {
  if (where.status !== undefined && sale.status !== where.status) return false;
  if (where.isActive !== undefined && sale.isActive !== where.isActive) {
    return false;
  }
  const gte = (where.createdAt as Row | undefined)?.gte as Date | undefined;
  if (gte && new Date(sale.createdAt as Date) < gte) return false;
  return true;
};

const matchesNotification = (notification: Row, where: Row) => {
  if (where.userId !== undefined && notification.userId !== where.userId) {
    return false;
  }
  if (where.readAt === null && notification.readAt !== null) return false;
  return true;
};

/**
 * Minimal in-memory `groupBy` over one enum column: the service always groups
 * active rows by `status`, so that is the only shape the stub answers.
 */
const groupByStatus = (rows: Array<Row>, where: Row) => {
  const buckets = new Map<string, number>();
  for (const row of rows) {
    if (where.isActive !== undefined && row.isActive !== where.isActive) {
      continue;
    }
    const status = row.status as string;
    buckets.set(status, (buckets.get(status) ?? 0) + 1);
  }
  return [...buckets.entries()].map(([status, all]) => ({
    status,
    _count: { _all: all },
  }));
};

describe('Dashboard (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sales: Array<Row>;
  let workOrders: Array<Row>;
  let purchaseOrders: Array<Row>;
  let notifications: Array<Row>;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers({ doNotFake: [...REAL_TIMERS] });
    jest.setSystemTime(NOW);

    sales = [];
    workOrders = [];
    purchaseOrders = [];
    notifications = [];

    prisma = {
      onModuleDestroy: jest.fn(),
      onModuleInit: jest.fn(),
      user: {
        findUnique: jest.fn(({ where }) => {
          return users.find((user) => user.id === where.id) ?? null;
        }),
      },
      sale: {
        count: jest.fn(({ where }) => {
          return sales.filter((sale) => matchesSale(sale, where ?? {})).length;
        }),
      },
      workOrder: {
        groupBy: jest.fn(({ where }) => groupByStatus(workOrders, where ?? {})),
      },
      purchaseOrder: {
        groupBy: jest.fn(({ where }) =>
          groupByStatus(purchaseOrders, where ?? {})
        ),
      },
      notification: {
        count: jest.fn(({ where }) => {
          return notifications.filter((notification) =>
            matchesNotification(notification, where ?? {})
          ).length;
        }),
      },
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
    jest.useRealTimers();
    await app.close();
  });

  const agent = (session: string) =>
    request.agent(app.getHttpServer()).set('Cookie', `session=${session}`);
  const admin = () => agent('admin');
  const reception = () => agent('reception');
  const mechanic = () => agent('mechanic');
  const anonymous = () => request.agent(app.getHttpServer());
  const summary = (as: () => ReturnType<typeof request.agent>) =>
    as().get('/api/dashboard/summary');

  // Every authenticated role, keyed by the cookie its session mock resolves.
  const ROLE_SESSIONS: Array<[RoleName, string]> = [
    [RoleName.Admin, 'admin'],
    [RoleName.Reception, 'reception'],
    [RoleName.Mechanic, 'mechanic'],
    [RoleName.Warehouse, 'warehouse'],
    [RoleName.Purchasing, 'purchasing'],
    [RoleName.ReadOnly, 'readonly'],
  ];

  const seedSale = (createdAt: Date, overrides: Row = {}) => {
    const number = sales.length + 1;
    sales.push({
      id: `sale-${number}`,
      saleNumber: `VTA-2026-00000${number}`,
      status: SaleStatus.completed,
      isActive: true,
      createdAt,
      ...overrides,
    });
  };

  const seedWorkOrder = (status: WorkOrderStatus, isActive = true) => {
    workOrders.push({
      id: `wo-${workOrders.length + 1}`,
      status,
      isActive,
    });
  };

  const seedPurchaseOrder = (status: PurchaseOrderStatus, isActive = true) => {
    purchaseOrders.push({
      id: `po-${purchaseOrders.length + 1}`,
      status,
      isActive,
    });
  };

  const seedNotification = (userId: string, readAt: Date | null = null) => {
    notifications.push({
      id: `ntf-${notifications.length + 1}`,
      userId,
      type: 'work_order_ready',
      title: `Notification ${notifications.length + 1}`,
      body: 'Body',
      link: '/work-orders/wo-1',
      readAt,
      createdAt: NOW,
    });
  };

  describe('authentication', () => {
    it('returns 401 for anonymous', async () => {
      const response = await anonymous().get('/api/dashboard/summary');

      expect(response.status).toBe(401);
    });

    it('ignores query params — v1 windows are fixed', async () => {
      // The controller declares no @Query() DTO, so ValidationPipe has no
      // metatype to validate and extra params are silently ignored: there is
      // no date picker in v1 and F11 must not expect the server to filter.
      seedSale(START_OF_TODAY);

      const bare = await admin().get('/api/dashboard/summary');
      const filtered = await admin().get(
        '/api/dashboard/summary?from=2026-01-01&to=2026-01-31'
      );

      expect(filtered.status).toBe(200);
      expect(filtered.body).toEqual(bare.body);
    });
  });

  describe('every role', () => {
    it.each(ROLE_SESSIONS)(
      'returns 200 and the KPI shape for %s',
      async (_role, session) => {
        const response = await summary(() => agent(session));

        expect(response.status).toBe(200);
        expect(Object.keys(response.body).sort()).toEqual([
          'generatedAt',
          'notificationsUnread',
          'purchaseOrders',
          'salesMonthCount',
          'salesTodayCount',
          'workOrders',
        ]);
        expect(Object.keys(response.body.workOrders).sort()).toEqual([
          'cancelled',
          'done',
          'inProgress',
          'pending',
        ]);
        expect(Object.keys(response.body.purchaseOrders).sort()).toEqual([
          'cancelled',
          'draft',
          'ordered',
          'partiallyReceived',
          'received',
        ]);
        for (const value of [
          response.body.salesTodayCount,
          response.body.salesMonthCount,
          response.body.notificationsUnread,
          ...Object.values(response.body.workOrders),
          ...Object.values(response.body.purchaseOrders),
        ]) {
          expect(Number.isInteger(value)).toBe(true);
        }
      }
    );

    it('reports the same global counters to every role', async () => {
      seedSale(START_OF_TODAY);
      seedWorkOrder(WorkOrderStatus.pending);
      seedNotification('user-admin');
      seedNotification('user-mechanic');

      const bodies: Array<Row> = [];
      for (const [, session] of ROLE_SESSIONS) {
        const response = await summary(() => agent(session));
        expect(response.status).toBe(200);
        bodies.push(response.body);
      }

      // Own-scoped metric differs per caller; every global KPI is shared.
      expect(bodies.map((body) => body.notificationsUnread)).toEqual([
        1, 0, 1, 0, 0, 0,
      ]);
      for (const body of bodies) {
        expect(body.salesTodayCount).toBe(1);
        expect(body.salesMonthCount).toBe(1);
        expect(body.workOrders).toEqual({
          pending: 1,
          inProgress: 0,
          done: 0,
          cancelled: 0,
        });
      }
    });
  });

  describe('sales windows', () => {
    it('counts completed active sales created at the start of today', async () => {
      seedSale(START_OF_TODAY);
      seedSale(START_OF_TODAY, { status: SaleStatus.cancelled });
      seedSale(START_OF_TODAY, { isActive: false });

      const response = await summary(admin);

      expect(response.status).toBe(200);
      expect(response.body.salesTodayCount).toBe(1);
      expect(response.body.salesMonthCount).toBe(1);
    });

    it('counts a sale from earlier this month in the month window only', async () => {
      seedSale(EARLIER_THIS_MONTH);

      const response = await summary(admin);

      expect(response.body.salesTodayCount).toBe(0);
      expect(response.body.salesMonthCount).toBe(1);
    });

    it('excludes a sale from the previous calendar month from both windows', async () => {
      seedSale(PREVIOUS_MONTH);

      const response = await summary(admin);

      // The month window is "this calendar month", not "last 30 days".
      expect(response.body.salesTodayCount).toBe(0);
      expect(response.body.salesMonthCount).toBe(0);
    });

    it('excludes a sale created one millisecond before the today bound', async () => {
      seedSale(new Date(START_OF_TODAY.getTime() - 1));

      const response = await summary(admin);

      expect(response.body.salesTodayCount).toBe(0);
      expect(response.body.salesMonthCount).toBe(1);
    });

    it('queries server-local start of today and start of month bounds', async () => {
      await summary(admin);

      const bounds = (prisma.sale.count as jest.Mock).mock.calls.map(
        ([args]) => args.where.createdAt.gte
      );
      expect(bounds).toEqual([START_OF_TODAY, START_OF_MONTH]);
    });
  });

  describe('status buckets', () => {
    it('buckets every work order status exactly once', async () => {
      for (const status of Object.values(WorkOrderStatus)) {
        seedWorkOrder(status);
      }
      seedWorkOrder(WorkOrderStatus.pending, false);

      const response = await summary(admin);

      expect(response.body.workOrders).toEqual({
        pending: 1,
        inProgress: 1,
        done: 1,
        cancelled: 1,
      });
    });

    it('reports 0 for a work order status with no rows', async () => {
      seedWorkOrder(WorkOrderStatus.done);

      const response = await summary(admin);

      expect(response.body.workOrders).toEqual({
        pending: 0,
        inProgress: 0,
        done: 1,
        cancelled: 0,
      });
    });

    it('buckets every purchase order status exactly once', async () => {
      for (const status of Object.values(PurchaseOrderStatus)) {
        seedPurchaseOrder(status);
      }
      seedPurchaseOrder(PurchaseOrderStatus.draft, false);

      const response = await summary(admin);

      expect(response.body.purchaseOrders).toEqual({
        draft: 1,
        ordered: 1,
        partiallyReceived: 1,
        received: 1,
        cancelled: 1,
      });
    });

    it('reports 0 for a purchase order status with no rows', async () => {
      seedPurchaseOrder(PurchaseOrderStatus.received);

      const response = await summary(admin);

      expect(response.body.purchaseOrders).toEqual({
        draft: 0,
        ordered: 0,
        partiallyReceived: 0,
        received: 1,
        cancelled: 0,
      });
    });

    it('groups active rows by status for both aggregates', async () => {
      await summary(admin);

      const expected = {
        by: ['status'],
        where: { isActive: true },
        _count: { _all: true },
      };
      expect(prisma.workOrder.groupBy).toHaveBeenCalledWith(expected);
      expect(prisma.purchaseOrder.groupBy).toHaveBeenCalledWith(expected);
    });
  });

  describe('notificationsUnread', () => {
    it("counts only the caller's own unread notifications", async () => {
      seedNotification('user-admin');
      seedNotification('user-admin');
      seedNotification('user-admin', new Date(2026, 8, 29));
      seedNotification('user-reception');
      seedNotification('user-reception');

      const adminResponse = await summary(admin);
      const receptionResponse = await summary(reception);
      const mechanicResponse = await summary(mechanic);

      expect(adminResponse.body.notificationsUnread).toBe(2);
      expect(receptionResponse.body.notificationsUnread).toBe(2);
      expect(mechanicResponse.body.notificationsUnread).toBe(0);
    });

    it('scopes the count to the authenticated caller id', async () => {
      seedNotification('user-mechanic');
      seedNotification('user-admin');

      const response = await summary(mechanic);

      expect(response.body.notificationsUnread).toBe(1);
      expect(prisma.notification.count).toHaveBeenCalledWith({
        where: { userId: 'user-mechanic', readAt: null },
      });
    });
  });

  describe('generatedAt', () => {
    it('stamps the pinned server clock', async () => {
      const response = await summary(admin);

      expect(response.body.generatedAt).toBe(NOW.toISOString());
    });

    it('stamps one clock for the response and the sales windows', async () => {
      const response = await summary(admin);

      const generatedAt = new Date(response.body.generatedAt);
      expect(generatedAt.getTime()).toBe(NOW.getTime());
      const bounds = (prisma.sale.count as jest.Mock).mock.calls.map(
        ([args]) => args.where.createdAt.gte as Date
      );
      for (const bound of bounds) {
        expect(bound.getTime()).toBeLessThanOrEqual(generatedAt.getTime());
      }
    });
  });
});
