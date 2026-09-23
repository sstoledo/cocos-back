import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { Prisma, RoleName } from '@prisma/client';
import type { Express } from 'express';
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
const SUPPLIER_2_ID = 'supsupplier00000000000002';
const SUPPLIER_INACTIVE_ID = 'supsupplierinactive000001';
const PRODUCT_ID = 'clproduct0000000000000001';
const PRODUCT_2_ID = 'clproduct0000000000000002';
const PRODUCT_3_ID = 'clproduct0000000000000003';
const PRODUCT_INACTIVE_ID = 'clproductinactive00000001';
const MISSING_ID = 'clmissing0000000000000001';

type Row = Record<string, unknown>;

describe('PurchaseOrders (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let purchaseOrders: Array<Row>;
  let poLines: Array<Row>;
  let lots: Array<Row>;
  let lotItems: Array<Row>;
  let stockMovements: Array<Row>;

  beforeEach(async () => {
    jest.clearAllMocks();

    const suppliers: Array<Row> = [
      { id: SUPPLIER_ID, name: 'Distribuidora Sur', isActive: true },
      { id: SUPPLIER_2_ID, name: 'Repuestos Norte', isActive: true },
      { id: SUPPLIER_INACTIVE_ID, name: 'Proveedor Viejo', isActive: false },
    ];
    const products: Array<Row> = [
      {
        id: PRODUCT_ID,
        code: 'FLT-001',
        name: 'Oil filter',
        isActive: true,
        deletedAt: null,
      },
      {
        id: PRODUCT_2_ID,
        code: 'PAD-001',
        name: 'Brake pads',
        isActive: true,
        deletedAt: null,
      },
      {
        id: PRODUCT_3_ID,
        code: 'WIP-001',
        name: 'Wiper blades',
        isActive: true,
        deletedAt: null,
      },
      {
        id: PRODUCT_INACTIVE_ID,
        code: 'OLD-P01',
        name: 'Retired part',
        isActive: false,
        deletedAt: new Date(),
      },
    ];
    purchaseOrders = [];
    poLines = [];
    lots = [];
    lotItems = [];
    stockMovements = [];
    const sequences: Array<Row> = [];

    const linesFor = (purchaseOrderId: string) =>
      poLines
        .filter((line) => line.purchaseOrderId === purchaseOrderId)
        .map((line) => ({
          ...line,
          product: products.find((product) => product.id === line.productId),
        }));

    const withInclude = (po: Row) => ({
      ...po,
      supplier: suppliers.find((supplier) => supplier.id === po.supplierId),
      lines: linesFor(po.id as string),
    });

    const matchesStatus = (po: Row, status: unknown) => {
      if (status === undefined) return true;
      if (typeof status === 'string') return po.status === status;
      const allowed = (status as { in: Array<string> }).in;
      return allowed.includes(po.status as string);
    };

    const matchesWhere = (po: Row, where: Row) => {
      if (where.isActive !== undefined && po.isActive !== where.isActive) {
        return false;
      }
      if (
        where.supplierId !== undefined &&
        po.supplierId !== where.supplierId
      ) {
        return false;
      }
      if (!matchesStatus(po, where.status)) return false;
      const contains = (where.purchaseOrderNumber as Row | undefined)?.contains;
      if (contains !== undefined) {
        const query = (contains as string).toLowerCase();
        if (!(po.purchaseOrderNumber as string).toLowerCase().includes(query)) {
          return false;
        }
      }
      return true;
    };

    prisma = {
      onModuleDestroy: jest.fn(),
      onModuleInit: jest.fn(),
      supplier: {
        findUnique: jest.fn(({ where }) => {
          return (
            suppliers.find(
              (supplier) =>
                supplier.id === where.id &&
                (where.isActive === undefined ||
                  supplier.isActive === where.isActive)
            ) ?? null
          );
        }),
      },
      product: {
        findUnique: jest.fn(({ where }) => {
          return (
            products.find(
              (product) =>
                product.id === where.id &&
                (where.isActive === undefined ||
                  product.isActive === where.isActive)
            ) ?? null
          );
        }),
      },
      purchaseOrderNumberSequence: {
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
      purchaseOrder: {
        create: jest.fn(({ data }) => {
          const id = `po-${purchaseOrders.length + 1}`;
          const po = {
            id,
            purchaseOrderNumber: data.purchaseOrderNumber,
            supplierId: data.supplierId,
            status: 'draft',
            notes: data.notes ?? null,
            estimatedTotal: data.estimatedTotal,
            receiptCount: 0,
            isActive: true,
            deletedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          purchaseOrders.push(po);
          for (const line of data.lines?.create ?? []) {
            poLines.push({
              id: `pol-${poLines.length + 1}`,
              purchaseOrderId: id,
              productId: line.productId,
              quantityOrdered: line.quantityOrdered,
              quantityReceived: 0,
              estimatedCostPrice: line.estimatedCostPrice,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
          }
          return withInclude(po);
        }),
        findMany: jest.fn(({ where, skip, take }) => {
          const matches = purchaseOrders.filter((po) =>
            matchesWhere(po, where ?? {})
          );
          const sorted = [...matches].sort(
            (a, b) =>
              new Date(b.createdAt as Date).getTime() -
              new Date(a.createdAt as Date).getTime()
          );
          return sorted.slice(skip, skip + take).map(withInclude);
        }),
        count: jest.fn(({ where }) => {
          return purchaseOrders.filter((po) => matchesWhere(po, where ?? {}))
            .length;
        }),
        findUnique: jest.fn(({ where }) => {
          const found = purchaseOrders.find(
            (po) =>
              po.id === where.id &&
              (where.isActive === undefined || po.isActive === where.isActive)
          );
          return found ? withInclude(found) : null;
        }),
        updateMany: jest.fn(({ where, data }) => {
          const found = purchaseOrders.find(
            (po) =>
              po.id === where.id &&
              (where.isActive === undefined ||
                po.isActive === where.isActive) &&
              matchesStatus(po, where.status)
          );
          if (!found) return { count: 0 };
          if (data.status !== undefined) found.status = data.status;
          if (data.estimatedTotal !== undefined) {
            found.estimatedTotal = data.estimatedTotal;
          }
          if (data.receiptCount?.increment !== undefined) {
            found.receiptCount =
              (found.receiptCount as number) + data.receiptCount.increment;
          }
          found.updatedAt = new Date();
          return { count: 1 };
        }),
      },
      purchaseOrderLine: {
        deleteMany: jest.fn(({ where }) => {
          const before = poLines.length;
          poLines = poLines.filter(
            (line) => line.purchaseOrderId !== where.purchaseOrderId
          );
          return { count: before - poLines.length };
        }),
        createMany: jest.fn(({ data }) => {
          for (const line of data) {
            poLines.push({
              id: `pol-${poLines.length + 1}`,
              purchaseOrderId: line.purchaseOrderId,
              productId: line.productId,
              quantityOrdered: line.quantityOrdered,
              quantityReceived: 0,
              estimatedCostPrice: line.estimatedCostPrice,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
          }
          return { count: data.length };
        }),
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
          line.updatedAt = new Date();
          return { count: 1 };
        }),
      },
      lot: {
        create: jest.fn(({ data }) => {
          const lot = {
            id: `lot-${lots.length + 1}`,
            ...data,
            receivedAt: new Date(),
          };
          lots.push(lot);
          return lot;
        }),
        findMany: jest.fn(({ where }) => {
          return lots
            .filter((lot) => lot.purchaseOrderId === where.purchaseOrderId)
            .map((lot) => ({
              ...lot,
              items: lotItems.filter((item) => item.lotId === lot.id),
            }));
        }),
      },
      lotItem: {
        create: jest.fn(({ data }) => {
          const item = { id: `li-${lotItems.length + 1}`, ...data };
          lotItems.push(item);
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
      },
      user: {
        findUnique: jest.fn(({ where }) => {
          return users.find((user) => user.id === where.id) ?? null;
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

  const createPo = (
    server: ReturnType<typeof admin>,
    lines: Array<Record<string, unknown>>,
    supplierId = SUPPLIER_ID
  ) => server.post('/api/purchase-orders').send({ supplierId, lines });

  const line = (productId: string, quantityOrdered: number, cost = '5.00') => ({
    productId,
    quantityOrdered,
    estimatedCostPrice: cost,
  });

  const createOrdered = async () => {
    const created = await purchasing()
      .post('/api/purchase-orders')
      .send({ supplierId: SUPPLIER_ID, lines: [line(PRODUCT_ID, 10)] });
    expect(created.status).toBe(201);
    const ordered = await purchasing().patch(
      `/api/purchase-orders/${created.body.id}/order`
    );
    expect(ordered.status).toBe(200);
    return created.body;
  };

  describe('POST /api/purchase-orders', () => {
    it('creates a draft with a sequential COM number and computed total (S1)', async () => {
      const year = new Date().getFullYear();
      const response = await purchasing()
        .post('/api/purchase-orders')
        .send({
          supplierId: SUPPLIER_ID,
          notes: 'Weekly restock',
          lines: [line(PRODUCT_ID, 10)],
        });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        purchaseOrderNumber: `COM-${year}-000001`,
        status: 'draft',
        estimatedTotal: '50.00',
        notes: 'Weekly restock',
        supplierId: SUPPLIER_ID,
        supplier: { id: SUPPLIER_ID, name: 'Distribuidora Sur' },
      });
      expect(response.body.lines).toHaveLength(1);
      expect(response.body.lines[0]).toMatchObject({
        productId: PRODUCT_ID,
        quantityOrdered: 10,
        quantityReceived: 0,
        estimatedCostPrice: '5.00',
        product: { id: PRODUCT_ID, code: 'FLT-001', name: 'Oil filter' },
      });

      const second = await admin()
        .post('/api/purchase-orders')
        .send({ supplierId: SUPPLIER_ID, lines: [line(PRODUCT_2_ID, 2)] });
      expect(second.status).toBe(201);
      expect(second.body.purchaseOrderNumber).toBe(`COM-${year}-000002`);
      expect(second.body.estimatedTotal).toBe('10.00');
    });

    it('returns 400/404 error shapes for invalid payloads (S2)', async () => {
      const empty = await purchasing()
        .post('/api/purchase-orders')
        .send({ supplierId: SUPPLIER_ID, lines: [] });
      expect(empty.status).toBe(400);

      const duplicate = await purchasing()
        .post('/api/purchase-orders')
        .send({
          supplierId: SUPPLIER_ID,
          lines: [line(PRODUCT_ID, 1), line(PRODUCT_ID, 2)],
        });
      expect(duplicate.status).toBe(400);
      expect(duplicate.body.errorCode).toBe('PO_DUPLICATE_LINE');

      const badCost = await purchasing()
        .post('/api/purchase-orders')
        .send({
          supplierId: SUPPLIER_ID,
          lines: [line(PRODUCT_ID, 1, '5.555')],
        });
      expect(badCost.status).toBe(400);

      const missingSupplier = await purchasing()
        .post('/api/purchase-orders')
        .send({ supplierId: MISSING_ID, lines: [line(PRODUCT_ID, 1)] });
      expect(missingSupplier.status).toBe(404);
      expect(missingSupplier.body.errorCode).toBe('SUPPLIER_NOT_FOUND');

      const inactiveSupplier = await purchasing()
        .post('/api/purchase-orders')
        .send({
          supplierId: SUPPLIER_INACTIVE_ID,
          lines: [line(PRODUCT_ID, 1)],
        });
      expect(inactiveSupplier.status).toBe(404);
      expect(inactiveSupplier.body.errorCode).toBe('SUPPLIER_NOT_FOUND');

      const inactiveProduct = await purchasing()
        .post('/api/purchase-orders')
        .send({
          supplierId: SUPPLIER_ID,
          lines: [line(PRODUCT_INACTIVE_ID, 1)],
        });
      expect(inactiveProduct.status).toBe(404);
      expect(inactiveProduct.body.errorCode).toBe('PRODUCT_NOT_FOUND');

      expect(purchaseOrders).toHaveLength(0);
      expect(poLines).toHaveLength(0);
    });

    it('enforces the role matrix on create (S12)', async () => {
      const payload = { supplierId: SUPPLIER_ID, lines: [line(PRODUCT_ID, 1)] };

      expect(
        (await anonymous().post('/api/purchase-orders').send(payload)).status
      ).toBe(401);
      expect(
        (await warehouse().post('/api/purchase-orders').send(payload)).status
      ).toBe(403);
      expect(
        (await reception().post('/api/purchase-orders').send(payload)).status
      ).toBe(403);
      expect(
        (await mechanic().post('/api/purchase-orders').send(payload)).status
      ).toBe(403);
      expect(
        (await readonlyUser().post('/api/purchase-orders').send(payload)).status
      ).toBe(403);
      expect(
        (await admin().post('/api/purchase-orders').send(payload)).status
      ).toBe(201);
      expect(purchaseOrders).toHaveLength(1);
    });
  });

  describe('GET /api/purchase-orders', () => {
    const seed = () => {
      const base = {
        supplierId: SUPPLIER_ID,
        isActive: true,
        deletedAt: null,
        notes: null,
        estimatedTotal: new Prisma.Decimal(50),
        receiptCount: 0,
      };
      purchaseOrders.push(
        {
          ...base,
          id: 'seed-a',
          purchaseOrderNumber: 'COM-2026-000001',
          status: 'ordered',
          createdAt: new Date('2026-01-10T00:00:00.000Z'),
          updatedAt: new Date('2026-01-10T00:00:00.000Z'),
        },
        {
          ...base,
          id: 'seed-b',
          purchaseOrderNumber: 'COM-2026-000002',
          status: 'draft',
          createdAt: new Date('2026-02-10T00:00:00.000Z'),
          updatedAt: new Date('2026-02-10T00:00:00.000Z'),
        },
        {
          ...base,
          id: 'seed-c',
          purchaseOrderNumber: 'COM-2026-000003',
          supplierId: SUPPLIER_2_ID,
          status: 'ordered',
          createdAt: new Date('2026-03-10T00:00:00.000Z'),
          updatedAt: new Date('2026-03-10T00:00:00.000Z'),
        }
      );
    };

    it('filters by status and supplierId with pagination meta (S4)', async () => {
      seed();

      const filtered = await warehouse().get(
        `/api/purchase-orders?status=ordered&supplierId=${SUPPLIER_ID}`
      );
      expect(filtered.status).toBe(200);
      expect(filtered.body.meta).toEqual({ page: 1, limit: 10, total: 1 });
      expect(filtered.body.data).toHaveLength(1);
      expect(filtered.body.data[0].purchaseOrderNumber).toBe('COM-2026-000001');

      const pageTwo = await warehouse().get(
        '/api/purchase-orders?page=2&limit=2'
      );
      expect(pageTwo.status).toBe(200);
      expect(pageTwo.body.meta).toEqual({ page: 2, limit: 2, total: 3 });
      expect(pageTwo.body.data).toHaveLength(1);
      expect(pageTwo.body.data[0].purchaseOrderNumber).toBe('COM-2026-000001');
    });

    it('partial-searches purchaseOrderNumber case-insensitively (S4)', async () => {
      seed();

      const byNumber = await purchasing().get(
        '/api/purchase-orders?purchaseOrderNumber=com-2026-00000'
      );
      expect(byNumber.status).toBe(200);
      expect(byNumber.body.meta.total).toBe(3);

      const single = await purchasing().get(
        '/api/purchase-orders?purchaseOrderNumber=000003'
      );
      expect(single.body.meta.total).toBe(1);
      expect(single.body.data[0].id).toBe('seed-c');
    });

    it('returns 401 anonymous and 403 for non-authorized roles (S12)', async () => {
      expect((await anonymous().get('/api/purchase-orders')).status).toBe(401);
      expect((await reception().get('/api/purchase-orders')).status).toBe(403);
      expect((await mechanic().get('/api/purchase-orders')).status).toBe(403);
      expect((await readonlyUser().get('/api/purchase-orders')).status).toBe(
        403
      );
      expect((await warehouse().get('/api/purchase-orders')).status).toBe(200);
      expect(prisma.purchaseOrder.findMany).toHaveBeenCalled();
    });
  });

  describe('PATCH /api/purchase-orders/:id', () => {
    it('full-replaces draft lines and blocks updates once ordered (S6)', async () => {
      const created = await createPo(purchasing(), [
        line(PRODUCT_ID, 2),
        line(PRODUCT_2_ID, 3),
      ]);
      expect(created.status).toBe(201);
      const id = created.body.id;

      const replaced = await purchasing()
        .patch(`/api/purchase-orders/${id}`)
        .send({ lines: [line(PRODUCT_3_ID, 4, '7.25')] });

      expect(replaced.status).toBe(200);
      expect(replaced.body.lines).toHaveLength(1);
      expect(replaced.body.lines[0]).toMatchObject({
        productId: PRODUCT_3_ID,
        quantityOrdered: 4,
        estimatedCostPrice: '7.25',
      });
      expect(replaced.body.estimatedTotal).toBe('29.00');

      const ordered = await purchasing().patch(
        `/api/purchase-orders/${id}/order`
      );
      expect(ordered.status).toBe(200);

      const blocked = await purchasing()
        .patch(`/api/purchase-orders/${id}`)
        .send({ lines: [line(PRODUCT_ID, 1)] });
      expect(blocked.status).toBe(409);
      expect(blocked.body.errorCode).toBe('PO_NOT_DRAFT');

      const detail = await purchasing().get(`/api/purchase-orders/${id}`);
      expect(detail.body.lines).toHaveLength(1);
      expect(detail.body.lines[0].productId).toBe(PRODUCT_3_ID);
    });

    it('returns 404 for a missing purchase order (S6)', async () => {
      const response = await purchasing()
        .patch(`/api/purchase-orders/${MISSING_ID}`)
        .send({ lines: [line(PRODUCT_ID, 1)] });

      expect(response.status).toBe(404);
      expect(response.body.errorCode).toBe('PURCHASE_ORDER_NOT_FOUND');
    });
  });

  describe('PATCH /api/purchase-orders/:id/order', () => {
    it('flips draft to ordered and rejects a second order (S7)', async () => {
      const created = await createPo(purchasing(), [line(PRODUCT_ID, 5)]);
      const id = created.body.id;

      const ordered = await admin().patch(`/api/purchase-orders/${id}/order`);
      expect(ordered.status).toBe(200);
      expect(ordered.body).toMatchObject({
        id,
        status: 'ordered',
        purchaseOrderNumber: created.body.purchaseOrderNumber,
        estimatedTotal: '25.00',
      });

      const second = await admin().patch(`/api/purchase-orders/${id}/order`);
      expect(second.status).toBe(409);
      expect(second.body.errorCode).toBe('PO_ALREADY_ORDERED');

      const cancelled = await admin().patch(
        `/api/purchase-orders/${id}/cancel`
      );
      expect(cancelled.status).toBe(200);
      const afterCancel = await admin().patch(
        `/api/purchase-orders/${id}/order`
      );
      expect(afterCancel.status).toBe(409);
      expect(afterCancel.body.errorCode).toBe('PO_ALREADY_ORDERED');
    });

    it('returns 404 for a missing purchase order (S7)', async () => {
      const response = await purchasing().patch(
        `/api/purchase-orders/${MISSING_ID}/order`
      );
      expect(response.status).toBe(404);
      expect(response.body.errorCode).toBe('PURCHASE_ORDER_NOT_FOUND');
    });
  });

  describe('PATCH /api/purchase-orders/:id/cancel', () => {
    it('cancels a draft or ordered PO and preserves the number (S11)', async () => {
      const draft = await createPo(purchasing(), [line(PRODUCT_ID, 1)]);
      const cancelled = await purchasing().patch(
        `/api/purchase-orders/${draft.body.id}/cancel`
      );
      expect(cancelled.status).toBe(200);
      expect(cancelled.body).toMatchObject({
        id: draft.body.id,
        status: 'cancelled',
        purchaseOrderNumber: draft.body.purchaseOrderNumber,
      });

      const orderedPo = await createPo(purchasing(), [line(PRODUCT_ID, 1)]);
      await purchasing().patch(
        `/api/purchase-orders/${orderedPo.body.id}/order`
      );
      const cancelledOrdered = await purchasing().patch(
        `/api/purchase-orders/${orderedPo.body.id}/cancel`
      );
      expect(cancelledOrdered.status).toBe(200);
      expect(cancelledOrdered.body.status).toBe('cancelled');

      const second = await purchasing().patch(
        `/api/purchase-orders/${orderedPo.body.id}/cancel`
      );
      expect(second.status).toBe(409);
      expect(second.body.errorCode).toBe('PO_CANNOT_CANCEL');
    });

    it('returns 409 once receiving has started, with zero stock writes (S11)', async () => {
      const po = await createOrdered();
      const partial = await warehouse()
        .post(`/api/purchase-orders/${po.id}/receive`)
        .send({
          lines: [
            {
              lineId: po.lines[0].id,
              receivedQty: 4,
              expirationDate: '2027-01-01',
              actualCostPrice: '5.50',
            },
          ],
        });
      expect(partial.status).toBe(200);

      const cancelled = await purchasing().patch(
        `/api/purchase-orders/${po.id}/cancel`
      );
      expect(cancelled.status).toBe(409);
      expect(cancelled.body.errorCode).toBe('PO_CANNOT_CANCEL');

      expect(lots).toHaveLength(1);
      expect(lotItems).toHaveLength(1);
      expect(stockMovements).toHaveLength(1);
    });
  });

  describe('POST /api/purchase-orders/:id/receive', () => {
    it('full receive creates one lot, item and entry movement (S8)', async () => {
      const po = await createOrdered();

      const response = await warehouse()
        .post(`/api/purchase-orders/${po.id}/receive`)
        .send({
          lines: [
            {
              lineId: po.lines[0].id,
              receivedQty: 10,
              expirationDate: '2027-06-30',
              actualCostPrice: '5.50',
            },
          ],
        });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: po.id,
        status: 'received',
        purchaseOrderNumber: po.purchaseOrderNumber,
      });
      expect(response.body.lotIds).toHaveLength(1);

      expect(lots).toHaveLength(1);
      expect(lots[0]).toMatchObject({
        lotNumber: `${po.purchaseOrderNumber}-R1`,
        supplierId: SUPPLIER_ID,
        purchaseOrderId: po.id,
      });

      expect(lotItems).toHaveLength(1);
      expect(lotItems[0]).toMatchObject({
        lotId: lots[0].id,
        productId: PRODUCT_ID,
        quantity: 10,
        remainingQuantity: 10,
      });
      expect(
        Number((lotItems[0] as { costPrice: Prisma.Decimal }).costPrice)
      ).toBe(5.5);

      expect(stockMovements).toHaveLength(1);
      expect(stockMovements[0]).toMatchObject({
        productId: PRODUCT_ID,
        lotItemId: lotItems[0].id,
        purchaseOrderId: po.id,
        type: 'entry',
        quantity: 10,
        reason: `Receive ${po.purchaseOrderNumber} (${po.purchaseOrderNumber}-R1)`,
      });
    });

    it('partial receives accumulate and flip status per event (S9)', async () => {
      const po = await createOrdered();
      const receive = (receivedQty: number) =>
        warehouse()
          .post(`/api/purchase-orders/${po.id}/receive`)
          .send({
            lines: [
              {
                lineId: po.lines[0].id,
                receivedQty,
                expirationDate: '2027-06-30',
                actualCostPrice: '5.50',
              },
            ],
          });

      const first = await receive(4);
      expect(first.status).toBe(200);
      expect(first.body.status).toBe('partially_received');
      expect(first.body.lotIds).toEqual(['lot-1']);

      const second = await receive(6);
      expect(second.status).toBe(200);
      expect(second.body.status).toBe('received');
      expect(second.body.lotIds).toEqual(['lot-2']);

      expect(lots.map((lot) => lot.lotNumber)).toEqual([
        `${po.purchaseOrderNumber}-R1`,
        `${po.purchaseOrderNumber}-R2`,
      ]);
      expect(stockMovements).toHaveLength(2);
      expect(poLines[0].quantityReceived).toBe(10);
    });

    it('rejects overshoot atomically with 409 and zero extra rows (S10)', async () => {
      const po = await createOrdered();
      const receive = (receivedQty: number) =>
        warehouse()
          .post(`/api/purchase-orders/${po.id}/receive`)
          .send({
            lines: [
              {
                lineId: po.lines[0].id,
                receivedQty,
                expirationDate: '2027-06-30',
                actualCostPrice: '5.50',
              },
            ],
          });

      const first = await receive(8);
      expect(first.status).toBe(200);

      const overshoot = await receive(5);
      expect(overshoot.status).toBe(409);
      expect(overshoot.body.errorCode).toBe('PO_RECEIVE_OVERSHOOT');

      expect(poLines[0].quantityReceived).toBe(8);
      expect(lots).toHaveLength(1);
      expect(lotItems).toHaveLength(1);
      expect(stockMovements).toHaveLength(1);
    });

    it('rejects receive on non-receivable statuses (S10)', async () => {
      const draft = await createPo(purchasing(), [line(PRODUCT_ID, 10)]);
      const onDraft = await warehouse()
        .post(`/api/purchase-orders/${draft.body.id}/receive`)
        .send({
          lines: [
            {
              lineId: draft.body.lines[0].id,
              receivedQty: 1,
              expirationDate: '2027-06-30',
              actualCostPrice: '5.00',
            },
          ],
        });
      expect(onDraft.status).toBe(409);
      expect(onDraft.body.errorCode).toBe('PO_NOT_RECEIVABLE');

      const missing = await warehouse()
        .post(`/api/purchase-orders/${MISSING_ID}/receive`)
        .send({
          lines: [
            {
              lineId: 'pol-x',
              receivedQty: 1,
              expirationDate: '2027-06-30',
              actualCostPrice: '5.00',
            },
          ],
        });
      expect(missing.status).toBe(404);
      expect(missing.body.errorCode).toBe('PURCHASE_ORDER_NOT_FOUND');

      const bogusLine = await warehouse()
        .post(`/api/purchase-orders/${draft.body.id}/receive`)
        .send({
          lines: [
            {
              lineId: 'pol-bogus',
              receivedQty: 1,
              expirationDate: '2027-06-30',
              actualCostPrice: '5.00',
            },
          ],
        });
      expect(bogusLine.status).toBe(409);

      expect(lots).toHaveLength(0);
      expect(lotItems).toHaveLength(0);
      expect(stockMovements).toHaveLength(0);
    });

    it('enforces the role matrix on receive (S12)', async () => {
      const po = await createOrdered();
      const payload = {
        lines: [
          {
            lineId: po.lines[0].id,
            receivedQty: 1,
            expirationDate: '2027-06-30',
            actualCostPrice: '5.50',
          },
        ],
      };

      expect(
        (
          await anonymous()
            .post(`/api/purchase-orders/${po.id}/receive`)
            .send(payload)
        ).status
      ).toBe(401);
      expect(
        (
          await reception()
            .post(`/api/purchase-orders/${po.id}/receive`)
            .send(payload)
        ).status
      ).toBe(403);
      expect(
        (
          await mechanic()
            .post(`/api/purchase-orders/${po.id}/receive`)
            .send(payload)
        ).status
      ).toBe(403);
      expect(
        (
          await readonlyUser()
            .post(`/api/purchase-orders/${po.id}/receive`)
            .send(payload)
        ).status
      ).toBe(403);
      expect(
        (
          await warehouse()
            .post(`/api/purchase-orders/${po.id}/receive`)
            .send(payload)
        ).status
      ).toBe(200);
      expect(lots).toHaveLength(1);
    });
  });

  describe('GET /api/purchase-orders/:id', () => {
    it('returns lines and the full receipt history (S5)', async () => {
      const po = await createOrdered();
      const receive = (receivedQty: number) =>
        warehouse()
          .post(`/api/purchase-orders/${po.id}/receive`)
          .send({
            lines: [
              {
                lineId: po.lines[0].id,
                receivedQty,
                expirationDate: '2027-06-30',
                actualCostPrice: '5.50',
              },
            ],
          });

      expect((await receive(4)).status).toBe(200);
      expect((await receive(6)).status).toBe(200);

      const response = await warehouse().get(`/api/purchase-orders/${po.id}`);

      expect(response.status).toBe(200);
      expect(response.body.lines[0]).toMatchObject({
        productId: PRODUCT_ID,
        quantityOrdered: 10,
        quantityReceived: 10,
        estimatedCostPrice: '5.00',
      });
      expect(response.body.receipts).toHaveLength(2);
      expect(response.body.receipts[0]).toMatchObject({
        lotNumber: `${po.purchaseOrderNumber}-R1`,
      });
      expect(response.body.receipts[0].items[0]).toMatchObject({
        productId: PRODUCT_ID,
        quantity: 4,
        costPrice: '5.50',
      });
      expect(response.body.receipts[0].items[0].expirationDate).toBeDefined();
      expect(response.body.receipts[1].items[0].quantity).toBe(6);
    });

    it('returns 404 for a missing purchase order (S5)', async () => {
      const response = await warehouse().get(
        `/api/purchase-orders/${MISSING_ID}`
      );
      expect(response.status).toBe(404);
      expect(response.body.errorCode).toBe('PURCHASE_ORDER_NOT_FOUND');
    });
  });

  describe('full lifecycle', () => {
    it('create → update → order → partial receive → full receive → received (S1/S6/S8/S9)', async () => {
      const created = await purchasing()
        .post('/api/purchase-orders')
        .send({
          supplierId: SUPPLIER_2_ID,
          lines: [line(PRODUCT_ID, 10), line(PRODUCT_2_ID, 4)],
        });
      expect(created.status).toBe(201);
      const id = created.body.id;
      expect(created.body.estimatedTotal).toBe('70.00');

      const updated = await purchasing()
        .patch(`/api/purchase-orders/${id}`)
        .send({ lines: [line(PRODUCT_ID, 10), line(PRODUCT_2_ID, 4, '6.00')] });
      expect(updated.status).toBe(200);
      expect(updated.body.lines).toHaveLength(2);

      const ordered = await purchasing().patch(
        `/api/purchase-orders/${id}/order`
      );
      expect(ordered.status).toBe(200);
      expect(ordered.body.status).toBe('ordered');

      const first = await warehouse()
        .post(`/api/purchase-orders/${id}/receive`)
        .send({
          lines: [
            {
              lineId: updated.body.lines[0].id,
              receivedQty: 10,
              expirationDate: '2027-06-30',
              actualCostPrice: '5.50',
            },
            {
              lineId: updated.body.lines[1].id,
              receivedQty: 4,
              expirationDate: '2027-06-30',
              actualCostPrice: '6.10',
            },
          ],
        });
      expect(first.status).toBe(200);
      expect(first.body.status).toBe('received');
      expect(first.body.lotIds).toHaveLength(1);

      expect(stockMovements).toHaveLength(2);
      expect(
        stockMovements.every((movement) => movement.type === 'entry')
      ).toBe(true);

      const list = await warehouse().get(
        '/api/purchase-orders?status=received'
      );
      expect(list.body.meta.total).toBe(1);
      expect(list.body.data[0].id).toBe(id);
    });
  });
});
