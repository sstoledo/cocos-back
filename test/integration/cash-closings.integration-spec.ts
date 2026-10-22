import {
  BadRequestException,
  ConflictException,
  type INestApplicationContext,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PaymentMethod } from '@prisma/client';
import { CashClosingsService } from '../../src/cash-closings/cash-closings.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { truncateAll } from './helpers';

// S4: cash closings against real Postgres — chained period anchors,
// zero-filled method totals, the @@unique([periodStart]) concurrent-close
// race, and the CLOSING_NO_ACTIVITY guard. Exercises only
// CashClosingsService (constructor takes PrismaService alone) — no
// AppModule, so the auth chain stays out of the suite.
describe('CashClosingsService (integration)', () => {
  let app: INestApplicationContext;
  let prisma: PrismaService;
  let service: CashClosingsService;
  let closerUserId: string;

  const CLOSER_ID = 'cash-closings-it-user';
  let seq = 0;
  const nextNumber = (prefix: string) => {
    seq += 1;
    return `${prefix}-${Date.now()}-${seq}`;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [CashClosingsService, PrismaService],
    }).compile();
    app = moduleRef;
    prisma = moduleRef.get(PrismaService);
    service = moduleRef.get(CashClosingsService);
    await moduleRef.init();

    // Role is a static table truncateAll intentionally keeps, so it is
    // upserted once for the whole run.
    await prisma.role.upsert({
      where: { name: 'Admin' },
      update: {},
      create: { name: 'Admin' },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  // Generous hook budget: TRUNCATE on the shared bootstrap can spend
  // seconds in DataFileImmediateSync fsync on slow container storage —
  // observed >5s (jest's default hook timeout) on an otherwise idle DB.
  beforeEach(async () => {
    await truncateAll(prisma);
    // User IS truncated by truncateAll (cash_closings FK is Restrict), so
    // the closer user is re-created per test.
    const user = await prisma.user.create({
      data: {
        id: CLOSER_ID,
        name: 'Cash Closings IT',
        email: 'cash-closings-it@example.com',
        role: { connect: { name: 'Admin' } },
      },
    });
    closerUserId = user.id;
  }, 30_000);

  const seedSale = (data: {
    paymentMethod: PaymentMethod;
    totalAmount: string;
    createdAt: Date;
  }) =>
    prisma.sale.create({
      data: {
        saleNumber: nextNumber('SALE'),
        status: 'completed',
        isActive: true,
        ...data,
      },
    });

  const seedWorkOrderPayment = async (data: {
    paymentMethod: PaymentMethod;
    amount: string;
    paidAt: Date;
  }) => {
    const client = await prisma.client.create({
      data: { name: 'WO Client' },
    });
    const vehicle = await prisma.vehicle.create({
      data: {
        plate: nextNumber('PLATE'),
        brand: 'Generic',
        model: 'Model',
        clientId: client.id,
      },
    });
    const workOrder = await prisma.workOrder.create({
      data: {
        orderNumber: nextNumber('WO'),
        clientId: client.id,
        vehicleId: vehicle.id,
        status: 'done',
        isActive: true,
        updatedAt: data.paidAt,
      },
    });
    return prisma.workOrderPayment.create({
      data: { workOrderId: workOrder.id, ...data },
    });
  };

  it('anchors the first close at the earliest activity and chains the next close to the previous periodEnd', async () => {
    // S4 chained period anchors. Sale at T1 (earliest anchor), WO payment
    // at T2 > T1; close #1 must anchor at T1 and aggregate both rows.
    const t1 = new Date(Date.now() - 60 * 60 * 1000);
    const t2 = new Date(Date.now() - 30 * 60 * 1000);
    await seedSale({
      paymentMethod: PaymentMethod.cash,
      totalAmount: '100.00',
      createdAt: t1,
    });
    await seedWorkOrderPayment({
      paymentMethod: PaymentMethod.card,
      amount: '50.00',
      paidAt: t2,
    });

    const closing1 = await service.close(closerUserId, {
      declaredCash: '100.00',
      notes: 'first close',
    });

    expect(closing1.periodStart.getTime()).toBe(t1.getTime());
    expect(closing1.periodEnd.getTime()).toBeGreaterThan(
      closing1.periodStart.getTime()
    );
    expect(closing1.expectedCash).toBe('100.00');
    expect(closing1.expectedCard).toBe('50.00');
    expect(closing1.expectedTransfer).toBe('0.00');
    expect(closing1.salesCount).toBe(1);
    expect(closing1.workOrderPaymentsCard).toBe('50.00');
    expect(closing1.workOrderPaymentsCount).toBe(1);
    expect(closing1.declaredCash).toBe('100.00');
    expect(closing1.difference).toBe('0.00');
    expect(closing1.notes).toBe('first close');
    expect(closing1.closedBy.id).toBe(closerUserId);

    // The snapshot is persisted, not computed ad hoc.
    const persisted1 = await prisma.cashClosing.findUniqueOrThrow({
      where: { id: closing1.id },
    });
    expect(persisted1.periodStart.getTime()).toBe(t1.getTime());
    expect(persisted1.expectedCash.toFixed(2)).toBe('100.00');
    expect(persisted1.expectedCard.toFixed(2)).toBe('50.00');
    expect(persisted1.workOrderPaymentsCount).toBe(1);

    // New activity after close #1: close #2 must start exactly where
    // close #1 ended (chained anchor), not at the new sale's timestamp.
    await seedSale({
      paymentMethod: PaymentMethod.cash,
      totalAmount: '25.00',
      createdAt: new Date(),
    });

    const closing2 = await service.close(closerUserId, {
      declaredCash: '25.00',
    });

    expect(closing2.periodStart.getTime()).toBe(closing1.periodEnd.getTime());
    expect(closing2.periodEnd.getTime()).toBeGreaterThan(
      closing2.periodStart.getTime()
    );
    expect(closing2.expectedCash).toBe('25.00');
    expect(closing2.salesCount).toBe(1);

    const persisted2 = await prisma.cashClosing.findUniqueOrThrow({
      where: { id: closing2.id },
    });
    expect(persisted2.periodStart.getTime()).toBe(
      persisted1.periodEnd.getTime()
    );
  });

  it('zero-fills payment methods with no rows in the period', async () => {
    // S4 zero-filled totals: a period holding only a card sale must
    // report cash/transfer as 0.00 and no WO payment rows at all.
    await seedSale({
      paymentMethod: PaymentMethod.card,
      totalAmount: '80.00',
      createdAt: new Date(Date.now() - 5 * 60 * 1000),
    });

    const closing = await service.close(closerUserId, {
      declaredCash: '0',
    });

    expect(closing.expectedCard).toBe('80.00');
    expect(closing.expectedCash).toBe('0.00');
    expect(closing.expectedTransfer).toBe('0.00');
    expect(closing.salesCount).toBe(1);
    expect(closing.workOrderPaymentsCash).toBe('0.00');
    expect(closing.workOrderPaymentsCard).toBe('0.00');
    expect(closing.workOrderPaymentsTransfer).toBe('0.00');
    expect(closing.workOrderPaymentsCount).toBe(0);

    const persisted = await prisma.cashClosing.findUniqueOrThrow({
      where: { id: closing.id },
    });
    expect(persisted.expectedCash.toFixed(2)).toBe('0.00');
    expect(persisted.expectedTransfer.toFixed(2)).toBe('0.00');
    expect(persisted.expectedCard.toFixed(2)).toBe('80.00');
    expect(persisted.workOrderPaymentsCount).toBe(0);
  });

  it('lets exactly one of two concurrent close() calls win; the other gets CLOSING_CONFLICT', async () => {
    // S4 race: a prior closing fixes periodStart for both transactions
    // (resolvePeriodStart returns the last closing's periodEnd), and the
    // activity in between makes both reach the insert. The
    // @@unique([periodStart]) constraint then guarantees exactly one
    // commit and a P2002 → ConflictException for the loser under
    // READ COMMITTED (the loser's insert blocks on the winner's
    // in-flight insert and fails once it commits).
    await seedSale({
      paymentMethod: PaymentMethod.cash,
      totalAmount: '10.00',
      createdAt: new Date(Date.now() - 10 * 60 * 1000),
    });
    const first = await service.close(closerUserId, {
      declaredCash: '10.00',
    });

    // The raced period is (first.periodEnd, racerNow]: the seed sale must
    // sit strictly inside it. +10ms keeps it at/after the chained anchor;
    // the sleep guarantees both racers' `now` (set at tx start) clears it
    // even at millisecond granularity of the `lt: now` bound.
    await seedSale({
      paymentMethod: PaymentMethod.cash,
      totalAmount: '40.00',
      createdAt: new Date(first.periodEnd.getTime() + 10),
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Empirical bootstrap fact (probed on this stack): two concurrent raw
    // queries overlap, but the SECOND interactive $transaction on one
    // PrismaClient begins ~78ms after the first. A plain race therefore
    // always lets the winner commit before the loser starts, and the loser
    // sees the winner's closing as its anchor — it dies with
    // CLOSING_NO_ACTIVITY before reaching the unique insert. To exercise
    // the P2002 path deterministically, keep the winner's transaction open
    // past the loser's reads: delay every CashClosing.create by 500ms via
    // middleware. Winner commits at ~T+500ms; the loser (started at
    // ~T+78ms) has already read the pre-race closing and reaches its
    // insert after the winner's commit, so the @@unique([periodStart])
    // constraint fires under READ COMMITTED. Prisma offers no middleware
    // removal; the delay only touches CashClosing.create, which the
    // remaining tests never reach (they stop at the no-activity guard).
    const slowedPrisma = prisma.$extends({
      query: {
        cashClosing: {
          async create({ args, query }) {
            await new Promise((resolve) => setTimeout(resolve, 500));
            return query(args);
          },
        },
      },
    });

    const serviceA = new CashClosingsService(
      slowedPrisma as unknown as PrismaService
    );
    const serviceB = new CashClosingsService(
      slowedPrisma as unknown as PrismaService
    );
    const dto = { declaredCash: '40.00' };

    const settled = await Promise.allSettled([
      serviceA.close(closerUserId, dto),
      serviceB.close(closerUserId, dto),
    ]);

    const fulfilled = settled.filter((s) => s.status === 'fulfilled');
    const rejected = settled.filter((s) => s.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const winner =
      fulfilled[0].status === 'fulfilled' ? fulfilled[0].value : undefined;
    expect(winner?.expectedCash).toBe('40.00');
    expect(winner?.salesCount).toBe(1);

    const loser = rejected[0];
    expect(loser.status).toBe('rejected');
    if (loser.status === 'rejected') {
      expect(loser.reason).toBeInstanceOf(ConflictException);
      const body = (loser.reason as ConflictException).getResponse() as Record<
        string,
        unknown
      >;
      expect(body.errorCode).toBe('CLOSING_CONFLICT');
    }

    // Exactly two closings persisted: the seed close plus the single winner.
    expect(await prisma.cashClosing.count()).toBe(2);
  });

  it('rejects a close with no activity in the open period (CLOSING_NO_ACTIVITY)', async () => {
    // S4 guard: with zero completed sales, done work orders, and WO
    // payments, close() must fail before writing anything.
    let thrown: unknown;
    try {
      await service.close(closerUserId, { declaredCash: '0' });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(BadRequestException);
    const body = (thrown as BadRequestException).getResponse() as Record<
      string,
      unknown
    >;
    expect(body.errorCode).toBe('CLOSING_NO_ACTIVITY');
    expect(await prisma.cashClosing.count()).toBe(0);
  });

  it('rejects an immediate second close with no new activity as CLOSING_NO_ACTIVITY, not as an overlap conflict', async () => {
    // S4 decision pin: resolvePeriodStart chains to the last closing's
    // periodEnd, so a second immediate close sees an empty morning span
    // and trips the no-activity guard — the code never invents an
    // overlap rejection.
    await seedSale({
      paymentMethod: PaymentMethod.cash,
      totalAmount: '10.00',
      createdAt: new Date(Date.now() - 5 * 60 * 1000),
    });
    await service.close(closerUserId, { declaredCash: '10.00' });

    let thrown: unknown;
    try {
      await service.close(closerUserId, { declaredCash: '0' });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(BadRequestException);
    const body = (thrown as BadRequestException).getResponse() as Record<
      string,
      unknown
    >;
    expect(body.errorCode).toBe('CLOSING_NO_ACTIVITY');
    expect(await prisma.cashClosing.count()).toBe(1);
  });
});
