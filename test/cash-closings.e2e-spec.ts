import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { PaymentMethod, Prisma, RoleName, SaleStatus } from '@prisma/client';
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
 * Only `Date` is faked so period bounds (periodStart/periodEnd, `now`) are
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

// Server-local clock, pinned mid-afternoon so a same-day "morning" sale is
// genuinely inside the open period. Local Date constructor: the bounds hold
// in whatever TZ the suite runs in.
const NOW = new Date(2026, 8, 30, 14, 0, 0);
const MORNING = new Date(2026, 8, 30, 9, 0, 0);
const MIDDAY = new Date(2026, 8, 30, 12, 0, 0);
const AFTERNOON = new Date(2026, 8, 30, 15, 0, 0);
const EVENING = new Date(2026, 8, 30, 18, 0, 0);

const users = [
  { id: 'user-admin', name: 'Ana Admin', role: { name: RoleName.Admin } },
  {
    id: 'user-purchasing',
    name: 'Pablo Purchasing',
    role: { name: RoleName.Purchasing },
  },
  {
    id: 'user-warehouse',
    name: 'Wanda Warehouse',
    role: { name: RoleName.Warehouse },
  },
  {
    id: 'user-reception',
    name: 'Rosa Reception',
    role: { name: RoleName.Reception },
  },
  {
    id: 'user-mechanic',
    name: 'Mario Mechanic',
    role: { name: RoleName.Mechanic },
  },
  {
    id: 'user-readonly',
    name: 'Rita ReadOnly',
    role: { name: RoleName.ReadOnly },
  },
];

type Row = Record<string, unknown>;

const matchesSale = (sale: Row, where: Row) => {
  if (where.status !== undefined && sale.status !== where.status) return false;
  if (where.isActive !== undefined && sale.isActive !== where.isActive) {
    return false;
  }
  const createdAt = where.createdAt as Row | undefined;
  const gte = createdAt?.gte as Date | undefined;
  const lt = createdAt?.lt as Date | undefined;
  if (gte && new Date(sale.createdAt as Date) < gte) return false;
  if (lt && new Date(sale.createdAt as Date) >= lt) return false;
  return true;
};

describe('CashClosings (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sales: Array<Row>;
  let closings: Array<Row>;
  // Models the loser of the @@unique([periodStart]) race: a concurrent close
  // committed the same periodStart after this request read the last closing.
  let simulateConcurrentClose: boolean;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers({ doNotFake: [...REAL_TIMERS] });
    jest.setSystemTime(NOW);

    sales = [];
    closings = [];
    simulateConcurrentClose = false;

    const withClosedBy = (closing: Row) => {
      const user = users.find((entry) => entry.id === closing.closedById);
      return {
        ...closing,
        closedBy: { id: user?.id, name: user?.name },
      };
    };

    prisma = {
      onModuleDestroy: jest.fn(),
      onModuleInit: jest.fn(),
      user: {
        findUnique: jest.fn(({ where }) => {
          return users.find((user) => user.id === where.id) ?? null;
        }),
      },
      sale: {
        findFirst: jest.fn(({ where }) => {
          const first = sales
            .filter((sale) => matchesSale(sale, where ?? {}))
            .sort(
              (a, b) =>
                new Date(a.createdAt as Date).getTime() -
                new Date(b.createdAt as Date).getTime()
            )[0];
          return first ? { createdAt: first.createdAt } : null;
        }),
        groupBy: jest.fn(({ where }) => {
          const buckets = new Map<string, Prisma.Decimal>();
          for (const sale of sales) {
            if (!matchesSale(sale, where ?? {})) continue;
            const method = sale.paymentMethod as string;
            const previous = buckets.get(method) ?? new Prisma.Decimal(0);
            buckets.set(
              method,
              previous.plus(sale.totalAmount as Prisma.Decimal)
            );
          }
          return [...buckets.entries()].map(([paymentMethod, sum]) => ({
            paymentMethod,
            _sum: { totalAmount: sum },
          }));
        }),
        count: jest.fn(({ where }) => {
          return sales.filter((sale) => matchesSale(sale, where ?? {})).length;
        }),
      },
      cashClosing: {
        findFirst: jest.fn(() => {
          if (closings.length === 0) return null;
          return [...closings].sort(
            (a, b) =>
              new Date(b.periodEnd as Date).getTime() -
              new Date(a.periodEnd as Date).getTime()
          )[0];
        }),
        findMany: jest.fn(({ skip = 0, take = 20 }) => {
          const sorted = [...closings].sort(
            (a, b) =>
              new Date(b.periodEnd as Date).getTime() -
              new Date(a.periodEnd as Date).getTime()
          );
          return sorted.slice(skip, skip + take).map(withClosedBy);
        }),
        findUnique: jest.fn(({ where }) => {
          const found = closings.find((closing) => closing.id === where.id);
          return found ? withClosedBy(found) : null;
        }),
        count: jest.fn(() => closings.length),
        create: jest.fn(({ data }) => {
          const duplicated = closings.some(
            (closing) =>
              new Date(closing.periodStart as Date).getTime() ===
              new Date(data.periodStart as Date).getTime()
          );
          if (duplicated || simulateConcurrentClose) {
            throw new Prisma.PrismaClientKnownRequestError(
              'Unique constraint failed on the fields: (`periodStart`)',
              { code: 'P2002', clientVersion: '6.0.0' }
            );
          }
          const row = {
            id: `closing-${closings.length + 1}`,
            createdAt: new Date(),
            ...data,
          };
          closings.push(row);
          return withClosedBy(row);
        }),
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
    jest.useRealTimers();
    await app.close();
  });

  const agent = (session: string) =>
    request.agent(app.getHttpServer()).set('Cookie', `session=${session}`);
  const admin = () => agent('admin');
  const reception = () => agent('reception');
  const anonymous = () => request.agent(app.getHttpServer());

  const seedSale = (
    paymentMethod: PaymentMethod,
    totalAmount: string,
    createdAt: Date,
    overrides: Row = {}
  ) => {
    sales.push({
      id: `sale-${sales.length + 1}`,
      status: SaleStatus.completed,
      isActive: true,
      paymentMethod,
      totalAmount: new Prisma.Decimal(totalAmount),
      createdAt,
      ...overrides,
    });
  };

  const seedClosing = (
    periodStart: Date,
    periodEnd: Date,
    overrides: Row = {}
  ) => {
    closings.push({
      id: `closing-${closings.length + 1}`,
      closedById: 'user-admin',
      periodStart,
      periodEnd,
      expectedCash: new Prisma.Decimal('0.00'),
      expectedCard: new Prisma.Decimal('0.00'),
      expectedTransfer: new Prisma.Decimal('0.00'),
      declaredCash: new Prisma.Decimal('0.00'),
      difference: new Prisma.Decimal('0.00'),
      salesCount: 0,
      notes: null,
      createdAt: periodEnd,
      ...overrides,
    });
  };

  type Agent = ReturnType<typeof request.agent>;
  const ENDPOINTS: Array<{
    name: string;
    hit: (as: Agent) => request.Test;
  }> = [
    {
      name: 'POST /cash-closings',
      hit: (as) => as.post('/api/cash-closings').send({ declaredCash: '0' }),
    },
    {
      name: 'GET /cash-closings/preview',
      hit: (as) => as.get('/api/cash-closings/preview'),
    },
    {
      name: 'GET /cash-closings',
      hit: (as) => as.get('/api/cash-closings'),
    },
    {
      name: 'GET /cash-closings/:id',
      hit: (as) => as.get('/api/cash-closings/closing-1'),
    },
  ];

  describe('roles matrix', () => {
    it.each(ENDPOINTS)(
      '$name → 200/201 for Admin and Reception',
      async ({ hit }) => {
        // A prior closing (ended before NOW) keeps each POST periodStart
        // distinct under the pinned clock.
        seedClosing(MORNING, MIDDAY);

        for (const as of [admin(), reception()]) {
          const response = await hit(as);
          expect([200, 201]).toContain(response.status);
        }
      }
    );

    it.each(ENDPOINTS)(
      '$name → 403 for ReadOnly, Mechanic, Purchasing and Warehouse',
      async ({ hit }) => {
        seedClosing(MORNING, MIDDAY);

        for (const session of [
          'readonly',
          'mechanic',
          'purchasing',
          'warehouse',
        ]) {
          const response = await hit(agent(session));
          expect(response.status).toBe(403);
        }
      }
    );

    it.each(ENDPOINTS)('$name → 401 for anonymous', async ({ hit }) => {
      const response = await hit(anonymous());
      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/cash-closings', () => {
    it('snapshots expected totals by method and the declared difference', async () => {
      seedSale(PaymentMethod.cash, '100.00', MORNING);
      seedSale(PaymentMethod.card, '50.00', MORNING);
      seedSale(PaymentMethod.transfer, '25.00', MORNING);

      const response = await admin()
        .post('/api/cash-closings')
        .send({ declaredCash: '95.00', notes: 'Cierre del mediodía' });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        id: 'closing-1',
        periodStart: MORNING.toISOString(),
        periodEnd: NOW.toISOString(),
        expectedCash: '100.00',
        expectedCard: '50.00',
        expectedTransfer: '25.00',
        declaredCash: '95.00',
        difference: '-5.00',
        salesCount: 3,
        notes: 'Cierre del mediodía',
        createdAt: NOW.toISOString(),
        closedBy: { id: 'user-admin', name: 'Ana Admin' },
      });

      expect(closings).toHaveLength(1);
      expect(closings[0]).toMatchObject({
        closedById: 'user-admin',
        salesCount: 3,
        notes: 'Cierre del mediodía',
      });
    });

    it('aggregates only completed active sales (SAL-NF4)', async () => {
      seedSale(PaymentMethod.cash, '100.00', MORNING);
      seedSale(PaymentMethod.cash, '999.00', MORNING, {
        status: SaleStatus.cancelled,
      });
      seedSale(PaymentMethod.cash, '888.00', MORNING, { isActive: false });

      const response = await admin()
        .post('/api/cash-closings')
        .send({ declaredCash: '100.00' });

      expect(response.status).toBe(201);
      expect(response.body.expectedCash).toBe('100.00');
      expect(response.body.difference).toBe('0.00');
      expect(response.body.salesCount).toBe(1);

      const groupByArgs = (prisma.sale.groupBy as jest.Mock).mock.calls[0][0];
      expect(groupByArgs.where).toMatchObject({
        status: 'completed',
        isActive: true,
      });
    });

    it('chains periods: the next close starts at the last periodEnd', async () => {
      seedSale(PaymentMethod.cash, '10.00', MORNING);

      const first = await admin()
        .post('/api/cash-closings')
        .send({ declaredCash: '10.00' });
      expect(first.status).toBe(201);
      expect(first.body.periodEnd).toBe(NOW.toISOString());

      // A sale after the first close belongs to the NEXT closing.
      jest.setSystemTime(EVENING);
      seedSale(PaymentMethod.cash, '7.50', AFTERNOON);

      const second = await admin()
        .post('/api/cash-closings')
        .send({ declaredCash: '7.50' });

      expect(second.status).toBe(201);
      expect(second.body.id).toBe('closing-2');
      expect(second.body.periodStart).toBe(NOW.toISOString());
      expect(second.body.periodEnd).toBe(EVENING.toISOString());
      expect(second.body.expectedCash).toBe('7.50');
      expect(second.body.salesCount).toBe(1);
    });

    it('returns 409 CLOSING_CONFLICT when a concurrent close wins the period', async () => {
      seedClosing(MORNING, AFTERNOON);
      simulateConcurrentClose = true;

      const response = await admin()
        .post('/api/cash-closings')
        .send({ declaredCash: '0' });

      expect(response.status).toBe(409);
      expect(response.body.errorCode).toBe('CLOSING_CONFLICT');
      expect(closings).toHaveLength(1);
    });

    it.each([
      ['a negative amount', '-1'],
      ['a non-numeric amount', 'abc'],
      ['more than two decimals', '10.999'],
    ])('returns 400 for %s', async (_label, declaredCash) => {
      const response = await admin()
        .post('/api/cash-closings')
        .send({ declaredCash });

      expect(response.status).toBe(400);
      expect(closings).toHaveLength(0);
    });
  });

  describe('GET /api/cash-closings/preview', () => {
    it('returns open-period totals without persisting anything', async () => {
      seedSale(PaymentMethod.cash, '40.00', MORNING);
      seedSale(PaymentMethod.transfer, '10.00', MORNING);
      seedSale(PaymentMethod.card, '70.00', MORNING, {
        status: SaleStatus.cancelled,
      });

      const response = await admin().get('/api/cash-closings/preview');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        periodStart: MORNING.toISOString(),
        expectedCash: '40.00',
        expectedCard: '0.00',
        expectedTransfer: '10.00',
        salesCount: 2,
      });
      expect(closings).toHaveLength(0);
    });

    it('returns a null periodStart and zero totals on the first-ever preview', async () => {
      const response = await admin().get('/api/cash-closings/preview');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        periodStart: null,
        expectedCash: '0.00',
        expectedCard: '0.00',
        expectedTransfer: '0.00',
        salesCount: 0,
      });
      expect(closings).toHaveLength(0);
    });
  });

  describe('GET /api/cash-closings', () => {
    it('lists closings newest first with pagination meta and closedBy', async () => {
      seedClosing(MORNING, new Date(2026, 8, 27, 20, 0, 0));
      seedClosing(MORNING, new Date(2026, 8, 29, 20, 0, 0), {
        closedById: 'user-reception',
      });
      seedClosing(MORNING, new Date(2026, 8, 28, 20, 0, 0));

      const response = await admin().get('/api/cash-closings');

      expect(response.status).toBe(200);
      expect(response.body.meta).toEqual({ page: 1, limit: 20, total: 3 });
      expect(response.body.data.map((row: Row) => row.id)).toEqual([
        'closing-2',
        'closing-3',
        'closing-1',
      ]);
      expect(response.body.data[0].closedBy).toEqual({
        id: 'user-reception',
        name: 'Rosa Reception',
      });
    });

    it('paginates with page and limit', async () => {
      seedClosing(MORNING, new Date(2026, 8, 27, 20, 0, 0));
      seedClosing(MORNING, new Date(2026, 8, 29, 20, 0, 0));
      seedClosing(MORNING, new Date(2026, 8, 28, 20, 0, 0));

      const response = await admin().get('/api/cash-closings?page=2&limit=2');

      expect(response.status).toBe(200);
      expect(response.body.meta).toEqual({ page: 2, limit: 2, total: 3 });
      expect(response.body.data.map((row: Row) => row.id)).toEqual([
        'closing-1',
      ]);
    });
  });

  describe('GET /api/cash-closings/:id', () => {
    it('returns the closing detail with decimals as strings', async () => {
      seedClosing(MORNING, AFTERNOON, {
        expectedCash: new Prisma.Decimal('100.00'),
        declaredCash: new Prisma.Decimal('95.00'),
        difference: new Prisma.Decimal('-5.00'),
        salesCount: 3,
      });

      const response = await admin().get('/api/cash-closings/closing-1');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: 'closing-1',
        periodStart: MORNING.toISOString(),
        periodEnd: AFTERNOON.toISOString(),
        expectedCash: '100.00',
        declaredCash: '95.00',
        difference: '-5.00',
        salesCount: 3,
        closedBy: { id: 'user-admin', name: 'Ana Admin' },
      });
    });

    it('returns 404 CASH_CLOSING_NOT_FOUND for an unknown id', async () => {
      const response = await admin().get('/api/cash-closings/closing-unknown');

      expect(response.status).toBe(404);
      expect(response.body.errorCode).toBe('CASH_CLOSING_NOT_FOUND');
    });
  });
});
