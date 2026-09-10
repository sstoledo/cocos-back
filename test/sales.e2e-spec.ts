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

const CLIENT_ID = 'clclient00000000000000001';
const CLIENT_2_ID = 'clclient00000000000000002';
const CLIENT_INACTIVE_ID = 'clclientinactive00000001';
const EMPLOYEE_ID = 'clemployee000000000000001';
const EMPLOYEE_INACTIVE_ID = 'clemployeeinactive0000001';
const BRANCH_ID = 'clbranch00000000000000001';
const BRANCH_INACTIVE_ID = 'clbranchinactive000000001';
const PRODUCT_ID = 'clproduct0000000000000001';
const PRODUCT_2_ID = 'clproduct0000000000000002';
const PRODUCT_INACTIVE_ID = 'clproductinactive00000001';
const SERVICE_ID = 'clservice0000000000000001';
const SERVICE_2_ID = 'clservice0000000000000002';
const SERVICE_INACTIVE_ID = 'clserviceinactive00000001';
const MISSING_ID = 'clmissing0000000000000001';

describe('Sales (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let lots: Array<Record<string, unknown>>;
  let lotItems: Array<Record<string, unknown>>;
  let stockMovements: Array<Record<string, unknown>>;
  let sales: Array<Record<string, unknown>>;
  let saleProducts: Array<Record<string, unknown>>;
  let saleServices: Array<Record<string, unknown>>;

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
    const employees: Array<Record<string, unknown>> = [
      { id: EMPLOYEE_ID, name: 'Juan Pérez', isActive: true, deletedAt: null },
      {
        id: EMPLOYEE_INACTIVE_ID,
        name: 'Empleado Inactivo',
        isActive: false,
        deletedAt: new Date(),
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
    const products: Array<Record<string, unknown>> = [
      {
        id: PRODUCT_ID,
        code: 'FLT-001',
        name: 'Oil filter',
        description: 'Engine oil filter',
        price: new Prisma.Decimal(10),
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
    const services: Array<Record<string, unknown>> = [
      {
        id: SERVICE_ID,
        code: 'OIL-001',
        name: 'Oil change',
        description: 'Standard oil change',
        price: new Prisma.Decimal(35.5),
        estimatedDuration: 30,
        isActive: true,
        deletedAt: null,
      },
      {
        id: SERVICE_2_ID,
        code: 'BRK-001',
        name: 'Brake check',
        description: null,
        price: new Prisma.Decimal(20),
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
    lots = [];
    lotItems = [];
    stockMovements = [];
    sales = [];
    saleProducts = [];
    saleServices = [];
    const sequences: Array<Record<string, unknown>> = [];

    const productLinesFor = (saleId: string) =>
      saleProducts
        .filter((line) => line.saleId === saleId)
        .map((line) => ({
          ...line,
          product: products.find((product) => product.id === line.productId),
        }));

    const serviceLinesFor = (saleId: string) =>
      saleServices
        .filter((line) => line.saleId === saleId)
        .map((line) => ({
          ...line,
          service: services.find((service) => service.id === line.serviceId),
        }));

    const relationsFor = (sale: Record<string, unknown>) => ({
      client: clients.find((client) => client.id === sale.clientId) ?? null,
      branch: branches.find((branch) => branch.id === sale.branchId) ?? null,
      employee:
        employees.find((employee) => employee.id === sale.employeeId) ?? null,
    });

    const matchesWhere = (
      row: Record<string, unknown>,
      where: {
        isActive?: boolean;
        clientId?: string;
        status?: string;
        saleNumber?: { contains?: string; mode?: string };
        createdAt?: { gte?: Date; lte?: Date };
      }
    ) => {
      if (where.isActive !== undefined && row.isActive !== where.isActive) {
        return false;
      }
      if (where.clientId !== undefined && row.clientId !== where.clientId) {
        return false;
      }
      if (where.status !== undefined && row.status !== where.status) {
        return false;
      }
      if (where.saleNumber?.contains !== undefined) {
        const query = (where.saleNumber.contains as string).toLowerCase();
        if (!(row.saleNumber as string).toLowerCase().includes(query)) {
          return false;
        }
      }
      if (where.createdAt !== undefined) {
        const at = new Date(row.createdAt as Date).getTime();
        if (
          where.createdAt.gte !== undefined &&
          at < new Date(where.createdAt.gte as Date).getTime()
        ) {
          return false;
        }
        if (
          where.createdAt.lte !== undefined &&
          at > new Date(where.createdAt.lte as Date).getTime()
        ) {
          return false;
        }
      }
      return true;
    };

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
              employee.id === where.id &&
              (where.isActive === undefined ||
                employee.isActive === where.isActive)
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
      lotItem: {
        aggregate: jest.fn(({ where }) => {
          const sum = lotItems
            .filter(
              (item) =>
                item.productId === where.productId &&
                (where.remainingQuantity?.gt === undefined ||
                  (item.remainingQuantity as number) >
                    where.remainingQuantity.gt)
            )
            .reduce(
              (total, item) => total + (item.remainingQuantity as number),
              0
            );
          return { _sum: { remainingQuantity: sum } };
        }),
        findMany: jest.fn(({ where, orderBy }) => {
          const matches = lotItems.filter(
            (item) =>
              item.productId === where.productId &&
              (where.remainingQuantity?.gt === undefined ||
                (item.remainingQuantity as number) > where.remainingQuantity.gt)
          );
          if (orderBy?.lot?.receivedAt === 'asc') {
            const receivedAt = (item: Record<string, unknown>) =>
              (
                lots.find((lot) => lot.id === item.lotId)?.receivedAt as Date
              ).getTime();
            matches.sort((a, b) => receivedAt(a) - receivedAt(b));
          }
          return matches;
        }),
        updateMany: jest.fn(({ where, data }) => {
          const item = lotItems.find(
            (candidate) =>
              candidate.id === where.id &&
              (candidate.remainingQuantity as number) >=
                where.remainingQuantity.gte
          );
          if (!item) return { count: 0 };
          item.remainingQuantity =
            (item.remainingQuantity as number) -
            data.remainingQuantity.decrement;
          return { count: 1 };
        }),
        update: jest.fn(({ where, data }) => {
          const item = lotItems.find(
            (candidate) => candidate.id === where.id
          ) as Record<string, unknown>;
          item.remainingQuantity =
            (item.remainingQuantity as number) +
            data.remainingQuantity.increment;
          return item;
        }),
      },
      stockMovement: {
        create: jest.fn(({ data }) => {
          const movement = {
            id: `sm-${stockMovements.length + 1}`,
            ...data,
            createdAt: new Date(),
          };
          stockMovements.push(movement);
          return movement;
        }),
        findMany: jest.fn(({ where }) => {
          return stockMovements.filter(
            (movement) =>
              (where.saleId === undefined ||
                movement.saleId === where.saleId) &&
              (where.type === undefined || movement.type === where.type)
          );
        }),
      },
      saleNumberSequence: {
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
      sale: {
        create: jest.fn(({ data }) => {
          if (sales.some((sale) => sale.saleNumber === data.saleNumber)) {
            throw new Prisma.PrismaClientKnownRequestError(
              'unique constraint',
              { clientVersion: '6.0.0', code: 'P2002' }
            );
          }
          const id = `sale-${sales.length + 1}`;
          const sale = {
            id,
            saleNumber: data.saleNumber,
            clientId: data.clientId ?? null,
            branchId: data.branchId ?? null,
            employeeId: data.employeeId ?? null,
            status: 'completed',
            paymentMethod: data.paymentMethod,
            totalAmount: data.totalAmount,
            isActive: true,
            deletedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          sales.push(sale);
          for (const line of data.products?.create ?? []) {
            saleProducts.push({
              id: `sp-${saleProducts.length + 1}`,
              saleId: id,
              productId: line.productId,
              quantity: line.quantity,
              unitPriceSnapshot: line.unitPriceSnapshot,
              subtotal: line.subtotal,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
          }
          for (const line of data.services?.create ?? []) {
            saleServices.push({
              id: `ss-${saleServices.length + 1}`,
              saleId: id,
              serviceId: line.serviceId,
              quantity: line.quantity,
              unitPriceSnapshot: line.unitPriceSnapshot,
              subtotal: line.subtotal,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
          }
          return {
            ...sale,
            products: productLinesFor(id),
            services: serviceLinesFor(id),
            ...relationsFor(sale),
          };
        }),
        findMany: jest.fn(({ where, skip, take }) => {
          const matches = sales.filter((sale) =>
            matchesWhere(sale, where ?? {})
          );
          const sorted = [...matches].sort(
            (a, b) =>
              new Date(b.createdAt as Date).getTime() -
              new Date(a.createdAt as Date).getTime()
          );
          return sorted.slice(skip, skip + take).map((sale) => ({
            ...sale,
            products: productLinesFor(sale.id as string),
            services: serviceLinesFor(sale.id as string),
            ...relationsFor(sale),
          }));
        }),
        count: jest.fn(({ where }) => {
          return sales.filter((sale) => matchesWhere(sale, where ?? {})).length;
        }),
        findUnique: jest.fn(({ where }) => {
          if (where.saleNumber) {
            return (
              sales.find((sale) => sale.saleNumber === where.saleNumber) ?? null
            );
          }
          const found = sales.find(
            (sale) =>
              sale.id === where.id &&
              (where.isActive === undefined || sale.isActive === where.isActive)
          );
          if (!found) return null;
          return {
            ...found,
            products: productLinesFor(found.id as string),
            services: serviceLinesFor(found.id as string),
            stockMovements: stockMovements.filter(
              (movement) => movement.saleId === found.id
            ),
            ...relationsFor(found),
          };
        }),
        updateMany: jest.fn(({ where, data }) => {
          const found = sales.find(
            (sale) => sale.id === where.id && sale.status === where.status
          );
          if (!found) return { count: 0 };
          found.status = data.status;
          found.updatedAt = new Date();
          return { count: 1 };
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
      $transaction: jest.fn((callback) => callback(prisma)),
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

  describe('POST /api/sales', () => {
    it('consumes stock FIFO across two lots and returns a sequential sale number (S1)', async () => {
      lots.push(
        { id: 'lot-1', receivedAt: new Date('2026-01-01T00:00:00.000Z') },
        { id: 'lot-2', receivedAt: new Date('2026-02-01T00:00:00.000Z') }
      );
      lotItems.push(
        {
          id: 'lot-a',
          lotId: 'lot-1',
          productId: PRODUCT_ID,
          remainingQuantity: 3,
        },
        {
          id: 'lot-b',
          lotId: 'lot-2',
          productId: PRODUCT_ID,
          remainingQuantity: 4,
        }
      );

      const year = new Date().getFullYear();
      const response = await reception()
        .post('/api/sales')
        .send({
          paymentMethod: 'cash',
          productLines: [{ productId: PRODUCT_ID, quantity: 5 }],
        });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        saleNumber: `VTA-${year}-000001`,
        status: 'completed',
        paymentMethod: 'cash',
        totalAmount: '50.00',
        clientId: null,
        client: null,
      });
      expect(response.body.products).toHaveLength(1);
      expect(response.body.products[0]).toMatchObject({
        productId: PRODUCT_ID,
        quantity: 5,
        unitPriceSnapshot: '10.00',
        subtotal: '50.00',
      });
      expect(response.body.products[0].product).toMatchObject({
        code: 'FLT-001',
        name: 'Oil filter',
        price: '10.00',
      });

      expect(lotItems[0].remainingQuantity).toBe(0);
      // 5 units: 3 from lot A + 2 from lot B (spec S1 "-2 B"), so B ends at 2.
      expect(lotItems[1].remainingQuantity).toBe(2);

      expect(stockMovements).toHaveLength(2);
      expect(stockMovements[0]).toMatchObject({
        lotItemId: 'lot-a',
        type: 'sale',
        quantity: -3,
        saleId: 'sale-1',
        reason: `Sale VTA-${year}-000001`,
      });
      expect(stockMovements[1]).toMatchObject({
        lotItemId: 'lot-b',
        quantity: -2,
        saleId: 'sale-1',
      });
      expect((stockMovements[0] as { productId: string }).productId).toBe(
        PRODUCT_ID
      );
    });

    it('creates a services-only sale with zero stock movements (S2)', async () => {
      const response = await reception()
        .post('/api/sales')
        .send({
          paymentMethod: 'card',
          serviceLines: [{ serviceId: SERVICE_ID, quantity: 2 }],
        });

      expect(response.status).toBe(201);
      expect(response.body.totalAmount).toBe('71.00');
      expect(response.body.services).toHaveLength(1);
      expect(response.body.services[0]).toMatchObject({
        serviceId: SERVICE_ID,
        quantity: 2,
        unitPriceSnapshot: '35.50',
        subtotal: '71.00',
      });
      expect(stockMovements).toHaveLength(0);
    });

    it('creates a mixed walk-in sale without optional references (S3)', async () => {
      lots.push({
        id: 'lot-1',
        receivedAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      lotItems.push({
        id: 'lot-a',
        lotId: 'lot-1',
        productId: PRODUCT_ID,
        remainingQuantity: 3,
      });

      const response = await reception()
        .post('/api/sales')
        .send({
          paymentMethod: 'cash',
          productLines: [{ productId: PRODUCT_ID, quantity: 1 }],
          serviceLines: [{ serviceId: SERVICE_2_ID, quantity: 1 }],
        });

      expect(response.status).toBe(201);
      expect(response.body.totalAmount).toBe('30.00');
      expect(response.body.clientId).toBeNull();
      expect(response.body.client).toBeNull();
      expect(response.body.branch).toBeNull();
      expect(response.body.employee).toBeNull();
      expect(stockMovements).toHaveLength(1);
      expect(stockMovements[0]).toMatchObject({
        productId: PRODUCT_ID,
        lotItemId: 'lot-a',
        quantity: -1,
      });
    });

    it('aborts atomically with 409 INSUFFICIENT_STOCK and zero side-effect rows (S4)', async () => {
      lots.push(
        { id: 'lot-1', receivedAt: new Date('2026-01-01T00:00:00.000Z') },
        { id: 'lot-2', receivedAt: new Date('2026-02-01T00:00:00.000Z') }
      );
      lotItems.push(
        {
          id: 'lot-a',
          lotId: 'lot-1',
          productId: PRODUCT_ID,
          remainingQuantity: 3,
        },
        {
          id: 'lot-b',
          lotId: 'lot-2',
          productId: PRODUCT_ID,
          remainingQuantity: 1,
        }
      );

      const response = await reception()
        .post('/api/sales')
        .send({
          paymentMethod: 'cash',
          productLines: [{ productId: PRODUCT_ID, quantity: 5 }],
        });

      expect(response.status).toBe(409);
      expect(response.body.errorCode).toBe('INSUFFICIENT_STOCK');
      expect(response.body.details).toEqual([
        { productId: PRODUCT_ID, requested: 5, available: 4 },
      ]);
      expect(lotItems[0].remainingQuantity).toBe(3);
      expect(lotItems[1].remainingQuantity).toBe(1);
      expect(sales).toHaveLength(0);
      expect(saleProducts).toHaveLength(0);
      expect(saleServices).toHaveLength(0);
      expect(stockMovements).toHaveLength(0);
    });

    it('returns 400 SALE_EMPTY_LINES when no lines are provided (S5)', async () => {
      const missing = await reception()
        .post('/api/sales')
        .send({ paymentMethod: 'cash' });
      expect(missing.status).toBe(400);
      expect(missing.body.errorCode).toBe('SALE_EMPTY_LINES');

      const emptyArrays = await reception()
        .post('/api/sales')
        .send({ paymentMethod: 'cash', productLines: [], serviceLines: [] });
      expect(emptyArrays.status).toBe(400);
      // Empty arrays are rejected by the DTO (ArrayMinSize) before the service.

      expect(sales).toHaveLength(0);
    });

    it('returns 404 for unknown or inactive references (S6)', async () => {
      const inactiveProduct = await reception()
        .post('/api/sales')
        .send({
          paymentMethod: 'cash',
          productLines: [{ productId: PRODUCT_INACTIVE_ID, quantity: 1 }],
        });
      expect(inactiveProduct.status).toBe(404);
      expect(inactiveProduct.body.errorCode).toBe('PRODUCT_NOT_FOUND');

      const missingClient = await reception()
        .post('/api/sales')
        .send({
          paymentMethod: 'cash',
          clientId: MISSING_ID,
          serviceLines: [{ serviceId: SERVICE_ID, quantity: 1 }],
        });
      expect(missingClient.status).toBe(404);
      expect(missingClient.body.errorCode).toBe('CLIENT_NOT_FOUND');

      expect(sales).toHaveLength(0);
    });

    it('returns 401 when not authenticated and 403 for a mechanic (S9)', async () => {
      const unauthenticated = await anonymous()
        .post('/api/sales')
        .send({
          paymentMethod: 'cash',
          serviceLines: [{ serviceId: SERVICE_ID, quantity: 1 }],
        });
      expect(unauthenticated.status).toBe(401);

      const forbidden = await mechanic()
        .post('/api/sales')
        .send({
          paymentMethod: 'cash',
          serviceLines: [{ serviceId: SERVICE_ID, quantity: 1 }],
        });
      expect(forbidden.status).toBe(403);

      expect(sales).toHaveLength(0);
    });
  });

  describe('GET /api/sales', () => {
    it('returns a frozen price snapshot after a catalog update (S7)', async () => {
      lots.push({
        id: 'lot-1',
        receivedAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      lotItems.push({
        id: 'lot-a',
        lotId: 'lot-1',
        productId: PRODUCT_ID,
        remainingQuantity: 10,
      });

      const created = await admin()
        .post('/api/sales')
        .send({
          paymentMethod: 'cash',
          productLines: [{ productId: PRODUCT_ID, quantity: 3 }],
        });
      expect(created.status).toBe(201);
      expect(created.body.totalAmount).toBe('30.00');

      const productCalls = (prisma.product.findUnique as jest.Mock).mock
        .results;
      const product = productCalls[productCalls.length - 1].value;
      product.price = new Prisma.Decimal(99.99);

      const detail = await admin().get('/api/sales/sale-1');
      expect(detail.status).toBe(200);
      expect(detail.body.products[0]).toMatchObject({
        productId: PRODUCT_ID,
        quantity: 3,
        unitPriceSnapshot: '10.00',
        subtotal: '30.00',
      });
      expect(detail.body.totalAmount).toBe('30.00');
    });

    it('supports pagination with meta and active-only rows (S10)', async () => {
      sales.push(
        {
          id: 'seed-a',
          saleNumber: 'VTA-2026-000001',
          clientId: CLIENT_ID,
          branchId: null,
          employeeId: null,
          status: 'completed',
          paymentMethod: 'cash',
          totalAmount: new Prisma.Decimal(50),
          isActive: true,
          deletedAt: null,
          createdAt: new Date('2026-01-10T00:00:00.000Z'),
          updatedAt: new Date('2026-01-10T00:00:00.000Z'),
        },
        {
          id: 'seed-b',
          saleNumber: 'VTA-2026-000002',
          clientId: CLIENT_2_ID,
          branchId: null,
          employeeId: null,
          status: 'cancelled',
          paymentMethod: 'card',
          totalAmount: new Prisma.Decimal(30),
          isActive: true,
          deletedAt: null,
          createdAt: new Date('2026-02-10T00:00:00.000Z'),
          updatedAt: new Date('2026-02-10T00:00:00.000Z'),
        },
        {
          id: 'seed-c',
          saleNumber: 'VTA-2026-000003',
          clientId: CLIENT_ID,
          branchId: null,
          employeeId: null,
          status: 'completed',
          paymentMethod: 'transfer',
          totalAmount: new Prisma.Decimal(71),
          isActive: true,
          deletedAt: null,
          createdAt: new Date('2026-03-10T00:00:00.000Z'),
          updatedAt: new Date('2026-03-10T00:00:00.000Z'),
        }
      );

      const pageOne = await admin().get('/api/sales?page=1&limit=2');
      expect(pageOne.status).toBe(200);
      expect(pageOne.body.meta).toEqual({ page: 1, limit: 2, total: 3 });
      expect(pageOne.body.data).toHaveLength(2);
      expect(pageOne.body.data[0].saleNumber).toBe('VTA-2026-000003');
      expect(pageOne.body.data[1].saleNumber).toBe('VTA-2026-000002');

      const pageTwo = await admin().get('/api/sales?page=2&limit=2');
      expect(pageTwo.status).toBe(200);
      expect(pageTwo.body.data).toHaveLength(1);
      expect(pageTwo.body.data[0].saleNumber).toBe('VTA-2026-000001');

      const defaults = await admin().get('/api/sales');
      expect(defaults.body.meta).toEqual({ page: 1, limit: 10, total: 3 });
      expect(defaults.body.data).toHaveLength(3);
    });

    it('filters by date range, clientId, status and saleNumber (S10)', async () => {
      sales.push(
        {
          id: 'seed-a',
          saleNumber: 'VTA-2026-000001',
          clientId: CLIENT_ID,
          branchId: null,
          employeeId: null,
          status: 'completed',
          paymentMethod: 'cash',
          totalAmount: new Prisma.Decimal(50),
          isActive: true,
          deletedAt: null,
          createdAt: new Date('2026-01-10T00:00:00.000Z'),
          updatedAt: new Date('2026-01-10T00:00:00.000Z'),
        },
        {
          id: 'seed-b',
          saleNumber: 'VTA-2026-000002',
          clientId: CLIENT_2_ID,
          branchId: null,
          employeeId: null,
          status: 'cancelled',
          paymentMethod: 'card',
          totalAmount: new Prisma.Decimal(30),
          isActive: true,
          deletedAt: null,
          createdAt: new Date('2026-02-10T00:00:00.000Z'),
          updatedAt: new Date('2026-02-10T00:00:00.000Z'),
        },
        {
          id: 'seed-c',
          saleNumber: 'VTA-2026-000003',
          clientId: CLIENT_ID,
          branchId: null,
          employeeId: null,
          status: 'completed',
          paymentMethod: 'transfer',
          totalAmount: new Prisma.Decimal(71),
          isActive: true,
          deletedAt: null,
          createdAt: new Date('2026-03-10T00:00:00.000Z'),
          updatedAt: new Date('2026-03-10T00:00:00.000Z'),
        }
      );

      const byRangeAndClient = await admin().get(
        `/api/sales?from=2026-02-01&to=2026-02-28&clientId=${CLIENT_2_ID}`
      );
      expect(byRangeAndClient.status).toBe(200);
      expect(byRangeAndClient.body.meta.total).toBe(1);
      expect(byRangeAndClient.body.data[0].saleNumber).toBe('VTA-2026-000002');

      const byStatus = await admin().get('/api/sales?status=cancelled');
      expect(byStatus.status).toBe(200);
      expect(byStatus.body.meta.total).toBe(1);
      expect(byStatus.body.data[0].saleNumber).toBe('VTA-2026-000002');

      const bySaleNumber = await admin().get(
        '/api/sales?saleNumber=vta-2026-000002'
      );
      expect(bySaleNumber.status).toBe(200);
      expect(bySaleNumber.body.meta.total).toBe(1);
      expect(bySaleNumber.body.data[0].saleNumber).toBe('VTA-2026-000002');

      const byStatusCompleted = await admin().get(
        '/api/sales?status=completed'
      );
      expect(byStatusCompleted.body.meta.total).toBe(2);
    });

    it('returns 401 when not authenticated and 403 for a mechanic (S9)', async () => {
      const unauthenticated = await anonymous().get('/api/sales');
      expect(unauthenticated.status).toBe(401);

      const forbidden = await mechanic().get('/api/sales');
      expect(forbidden.status).toBe(403);
      expect(prisma.sale.findMany).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /api/sales/:id/cancel', () => {
    const seedLots = () => {
      lots.push(
        { id: 'lot-1', receivedAt: new Date('2026-01-01T00:00:00.000Z') },
        { id: 'lot-2', receivedAt: new Date('2026-02-01T00:00:00.000Z') },
        { id: 'lot-3', receivedAt: new Date('2026-09-01T00:00:00.000Z') }
      );
      lotItems.push(
        {
          id: 'lot-a',
          lotId: 'lot-1',
          productId: PRODUCT_ID,
          remainingQuantity: 3,
        },
        {
          id: 'lot-b',
          lotId: 'lot-2',
          productId: PRODUCT_ID,
          remainingQuantity: 4,
        },
        {
          id: 'lot-c',
          lotId: 'lot-3',
          productId: PRODUCT_ID,
          remainingQuantity: 10,
        }
      );
    };

    const createSale = () =>
      reception()
        .post('/api/sales')
        .send({
          paymentMethod: 'cash',
          productLines: [{ productId: PRODUCT_ID, quantity: 5 }],
        });

    it('restores each consumed lot per slice and writes compensating movements (S12/S17)', async () => {
      seedLots();
      const created = await createSale();
      expect(created.status).toBe(201);
      const saleId = created.body.id;

      const response = await admin().patch(`/api/sales/${saleId}/cancel`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: saleId,
        status: 'cancelled',
        saleNumber: created.body.saleNumber,
        totalAmount: '50.00',
      });
      expect(lotItems[0].remainingQuantity).toBe(3);
      expect(lotItems[1].remainingQuantity).toBe(4);
      // Newest lot C never participated in the sale: untouched.
      expect(lotItems[2].remainingQuantity).toBe(10);
      expect(stockMovements).toHaveLength(4);
      expect(stockMovements[2]).toMatchObject({
        lotItemId: 'lot-a',
        type: 'cancel',
        quantity: 3,
        saleId,
        reason: `Cancel ${created.body.saleNumber}`,
      });
      expect(stockMovements[3]).toMatchObject({
        lotItemId: 'lot-b',
        type: 'cancel',
        quantity: 2,
        saleId,
        reason: `Cancel ${created.body.saleNumber}`,
      });
    });

    it('returns 404 SALE_NOT_FOUND for a missing sale with zero writes (S13)', async () => {
      const response = await admin().patch('/api/sales/unknown-1/cancel');

      expect(response.status).toBe(404);
      expect(response.body.errorCode).toBe('SALE_NOT_FOUND');
      expect(stockMovements).toHaveLength(0);
    });

    it('returns 409 SALE_ALREADY_CANCELLED on a second cancel without double restoration (S14)', async () => {
      seedLots();
      const created = await createSale();
      const saleId = created.body.id;

      const first = await admin().patch(`/api/sales/${saleId}/cancel`);
      expect(first.status).toBe(200);

      const second = await admin().patch(`/api/sales/${saleId}/cancel`);
      expect(second.status).toBe(409);
      expect(second.body.errorCode).toBe('SALE_ALREADY_CANCELLED');
      expect(stockMovements).toHaveLength(4);
      expect(lotItems[0].remainingQuantity).toBe(3);
      expect(lotItems[1].remainingQuantity).toBe(4);
    });

    it('returns 401 anonymous, 403 mechanic and 200 reception (S15)', async () => {
      seedLots();
      const created = await createSale();
      const saleId = created.body.id;

      const unauthenticated = await anonymous().patch(
        `/api/sales/${saleId}/cancel`
      );
      expect(unauthenticated.status).toBe(401);

      const forbidden = await mechanic().patch(`/api/sales/${saleId}/cancel`);
      expect(forbidden.status).toBe(403);

      const allowed = await reception().patch(`/api/sales/${saleId}/cancel`);
      expect(allowed.status).toBe(200);
      expect(allowed.body.status).toBe('cancelled');
    });

    it('preserves the audit trail: detail, cancelled list and completed exclusion (S16)', async () => {
      seedLots();
      const created = await createSale();
      const saleId = created.body.id;
      await admin().patch(`/api/sales/${saleId}/cancel`);

      const detail = await admin().get(`/api/sales/${saleId}`);
      expect(detail.status).toBe(200);
      expect(detail.body).toMatchObject({
        id: saleId,
        saleNumber: created.body.saleNumber,
        status: 'cancelled',
        totalAmount: '50.00',
      });
      expect(detail.body.products).toHaveLength(1);
      expect(detail.body.products[0]).toMatchObject({
        productId: PRODUCT_ID,
        quantity: 5,
        subtotal: '50.00',
      });

      const cancelledList = await admin().get('/api/sales?status=cancelled');
      expect(cancelledList.status).toBe(200);
      expect(cancelledList.body.meta.total).toBe(1);
      expect(cancelledList.body.data[0].id).toBe(saleId);

      const completedList = await admin().get('/api/sales?status=completed');
      expect(
        completedList.body.data.some(
          (sale: { id: string }) => sale.id === saleId
        )
      ).toBe(false);
    });
  });

  describe('GET /api/sales/:id', () => {
    it('returns a sale with lines and client/branch/employee summaries', async () => {
      lots.push({
        id: 'lot-1',
        receivedAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      lotItems.push({
        id: 'lot-a',
        lotId: 'lot-1',
        productId: PRODUCT_ID,
        remainingQuantity: 10,
      });

      const created = await admin()
        .post('/api/sales')
        .send({
          paymentMethod: 'card',
          clientId: CLIENT_ID,
          branchId: BRANCH_ID,
          employeeId: EMPLOYEE_ID,
          productLines: [{ productId: PRODUCT_ID, quantity: 2 }],
          serviceLines: [{ serviceId: SERVICE_ID, quantity: 1 }],
        });
      expect(created.status).toBe(201);
      const saleId = created.body.id;

      const response = await admin().get(`/api/sales/${saleId}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: saleId,
        totalAmount: '55.50',
        clientId: CLIENT_ID,
        client: { id: CLIENT_ID, name: 'María García' },
        branch: { id: BRANCH_ID, name: 'Sucursal Central' },
        employee: { id: EMPLOYEE_ID, name: 'Juan Pérez' },
      });
      expect(response.body.products).toHaveLength(1);
      expect(response.body.products[0]).toMatchObject({
        productId: PRODUCT_ID,
        quantity: 2,
        unitPriceSnapshot: '10.00',
        subtotal: '20.00',
      });
      expect(response.body.products[0].product.name).toBe('Oil filter');
      expect(response.body.services).toHaveLength(1);
      expect(response.body.services[0]).toMatchObject({
        serviceId: SERVICE_ID,
        quantity: 1,
        unitPriceSnapshot: '35.50',
        subtotal: '35.50',
      });
      expect(response.body.services[0].service.name).toBe('Oil change');
    });

    it('returns 404 SALE_NOT_FOUND for a missing sale', async () => {
      const response = await admin().get('/api/sales/unknown-1');

      expect(response.status).toBe(404);
      expect(response.body.errorCode).toBe('SALE_NOT_FOUND');
    });

    it('returns 401 when not authenticated and 403 for a mechanic (S9)', async () => {
      const unauthenticated = await anonymous().get('/api/sales/whatever');
      expect(unauthenticated.status).toBe(401);

      const forbidden = await mechanic().get('/api/sales/whatever');
      expect(forbidden.status).toBe(403);
    });
  });
});
