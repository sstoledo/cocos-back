import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PaymentMethod } from '@prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';
import { SalesService } from '../../src/sales/sales.service';
import { truncateAll } from './helpers';

// S2: sales FIFO walk, shortage guard, sale-number sequence, and cancel
// stock restoration — exercised through SalesService public methods against
// real Postgres (Testcontainers). Fixtures are built with prisma directly,
// mirroring CreateSaleDto shape (clientId omitted = walk-in sale).

type ModuleRef = Awaited<
  ReturnType<ReturnType<typeof Test.createTestingModule>['compile']>
>;

async function makeProduct(prisma: PrismaService, price = '25.50') {
  const [presentation, brand, category] = await Promise.all([
    prisma.presentation.create({ data: { name: `pres-${price}` } }),
    prisma.brand.create({ data: { name: `brand-${price}` } }),
    prisma.category.create({ data: { name: `cat-${price}` } }),
  ]);
  return prisma.product.create({
    data: {
      code: `PROD-${price}`,
      name: `Product ${price}`,
      price,
      presentationId: presentation.id,
      brandId: brand.id,
      categoryId: category.id,
    },
  });
}

async function makeClient(prisma: PrismaService) {
  return prisma.client.create({
    data: { name: 'Walk-in Client', email: 'walkin@example.com' },
  });
}

async function makeSupplier(prisma: PrismaService) {
  return prisma.supplier.create({ data: { name: 'Supplier' } });
}

async function makeLotWithItem(
  prisma: PrismaService,
  input: {
    productId: string;
    supplierId: string;
    lotNumber: string;
    receivedAt: Date;
    quantity: number;
  }
) {
  const lot = await prisma.lot.create({
    data: {
      lotNumber: input.lotNumber,
      supplierId: input.supplierId,
      receivedAt: input.receivedAt,
    },
  });
  const lotItem = await prisma.lotItem.create({
    data: {
      lotId: lot.id,
      productId: input.productId,
      quantity: input.quantity,
      remainingQuantity: input.quantity,
      costPrice: '10.00',
      expirationDate: new Date('2030-01-01'),
    },
  });
  return { lot, lotItem };
}

function saleDto(productId: string, quantity: number) {
  return {
    paymentMethod: PaymentMethod.cash,
    productLines: [{ productId, quantity }],
  };
}

describe('SalesService (integration)', () => {
  let moduleRef: ModuleRef;
  let prisma: PrismaService;
  let salesService: SalesService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [SalesService, PrismaService],
    }).compile();
    await moduleRef.init();
    prisma = moduleRef.get(PrismaService);
    salesService = moduleRef.get(SalesService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
  });

  // S2 rule: FIFO walk across two lots ordered by lot.receivedAt; the
  // earlier lot is decremented fully, the later one partially.
  it('walks FIFO across two lots, draining the first before the second', async () => {
    const product = await makeProduct(prisma);
    const supplier = await makeSupplier(prisma);

    const first = await makeLotWithItem(prisma, {
      productId: product.id,
      supplierId: supplier.id,
      lotNumber: 'LOT-OLD',
      receivedAt: new Date('2026-01-01'),
      quantity: 3,
    });
    const second = await makeLotWithItem(prisma, {
      productId: product.id,
      supplierId: supplier.id,
      lotNumber: 'LOT-NEW',
      receivedAt: new Date('2026-02-01'),
      quantity: 10,
    });

    const sale = await salesService.create(saleDto(product.id, 5));

    const firstAfter = await prisma.lotItem.findUniqueOrThrow({
      where: { id: first.lotItem.id },
    });
    const secondAfter = await prisma.lotItem.findUniqueOrThrow({
      where: { id: second.lotItem.id },
    });

    expect(firstAfter.remainingQuantity).toBe(0);
    expect(secondAfter.remainingQuantity).toBe(8);

    // Sale movement rows mirror the allocation per lot item.
    const movements = await prisma.stockMovement.findMany({
      where: { saleId: sale.id, type: 'sale' },
    });
    expect(movements).toHaveLength(2);
    expect(
      movements.find((m) => m.lotItemId === first.lotItem.id)?.quantity
    ).toBe(-3);
    expect(
      movements.find((m) => m.lotItemId === second.lotItem.id)?.quantity
    ).toBe(-2);
  });

  // S2 rule: requesting more than total remainingQuantity throws
  // ConflictException INSUFFICIENT_STOCK and leaves stored data unchanged.
  it('rejects a shortage with INSUFFICIENT_STOCK and changes nothing', async () => {
    const product = await makeProduct(prisma);
    const supplier = await makeSupplier(prisma);
    const lot = await makeLotWithItem(prisma, {
      productId: product.id,
      supplierId: supplier.id,
      lotNumber: 'LOT-SHORT',
      receivedAt: new Date('2026-01-01'),
      quantity: 4,
    });

    const attempt = salesService.create(saleDto(product.id, 5));

    await expect(attempt).rejects.toMatchObject({
      response: { errorCode: 'INSUFFICIENT_STOCK' },
    });
    await expect(attempt).rejects.toBeInstanceOf(ConflictException);

    // Rejected command leaves the DB byte-identical for business tables.
    const lotItemAfter = await prisma.lotItem.findUniqueOrThrow({
      where: { id: lot.lotItem.id },
    });
    expect(lotItemAfter.remainingQuantity).toBe(4);
    expect(await prisma.sale.count()).toBe(0);
    expect(await prisma.saleProduct.count()).toBe(0);
    expect(await prisma.stockMovement.count()).toBe(0);
    expect(await prisma.saleNumberSequence.count()).toBe(0);
  });

  // S2 rule: sale numbers are unique and sequential within the same year,
  // formatted VTA-<year>-NNNNNN via SaleNumberSequence.upsert.
  it('generates sequential sale numbers per year', async () => {
    const product = await makeProduct(prisma);
    const client = await makeClient(prisma);
    const supplier = await makeSupplier(prisma);
    const year = new Date().getFullYear();

    await makeLotWithItem(prisma, {
      productId: product.id,
      supplierId: supplier.id,
      lotNumber: 'LOT-SEQ',
      receivedAt: new Date('2026-01-01'),
      quantity: 2,
    });

    const first = await salesService.create({
      clientId: client.id,
      ...saleDto(product.id, 1),
    });
    // Second sale is a walk-in (clientId omitted) — also proves the
    // clientId-optional path stores null.
    const second = await salesService.create(saleDto(product.id, 1));

    expect(first.saleNumber).toBe(`VTA-${year}-000001`);
    expect(second.saleNumber).toBe(`VTA-${year}-000002`);
    expect(second.clientId).toBeNull();

    const sequence = await prisma.saleNumberSequence.findUniqueOrThrow({
      where: { year },
    });
    expect(sequence.lastNumber).toBe(2);
  });

  // S2 rule: cancelSale restores stock exactly via compensating movements
  // and flips status to 'cancelled'.
  it('restores stock exactly on cancel with compensating movements', async () => {
    const product = await makeProduct(prisma);
    const supplier = await makeSupplier(prisma);
    const lot = await makeLotWithItem(prisma, {
      productId: product.id,
      supplierId: supplier.id,
      lotNumber: 'LOT-CANCEL',
      receivedAt: new Date('2026-01-01'),
      quantity: 10,
    });

    const sale = await salesService.create(saleDto(product.id, 4));
    const beforeCancel = await prisma.lotItem.findUniqueOrThrow({
      where: { id: lot.lotItem.id },
    });
    expect(beforeCancel.remainingQuantity).toBe(6);

    const cancelled = await salesService.cancelSale(sale.id);

    expect(cancelled.status).toBe('cancelled');

    const afterCancel = await prisma.lotItem.findUniqueOrThrow({
      where: { id: lot.lotItem.id },
    });
    expect(afterCancel.remainingQuantity).toBe(10);

    const stored = await prisma.sale.findUniqueOrThrow({
      where: { id: sale.id },
    });
    expect(stored.status).toBe('cancelled');

    const cancelMovements = await prisma.stockMovement.findMany({
      where: { saleId: sale.id, type: 'cancel' },
    });
    expect(cancelMovements).toHaveLength(1);
    expect(cancelMovements[0].lotItemId).toBe(lot.lotItem.id);
    expect(cancelMovements[0].quantity).toBe(4);
    expect(cancelMovements[0].productId).toBe(product.id);
  });

  // S2 rule: a second cancel throws SALE_ALREADY_CANCELLED and must not
  // double-restore stock.
  it('rejects a double cancel with SALE_ALREADY_CANCELLED', async () => {
    const product = await makeProduct(prisma);
    const supplier = await makeSupplier(prisma);
    const lot = await makeLotWithItem(prisma, {
      productId: product.id,
      supplierId: supplier.id,
      lotNumber: 'LOT-DOUBLE',
      receivedAt: new Date('2026-01-01'),
      quantity: 10,
    });

    const sale = await salesService.create(saleDto(product.id, 4));
    await salesService.cancelSale(sale.id);

    await expect(salesService.cancelSale(sale.id)).rejects.toMatchObject({
      response: { errorCode: 'SALE_ALREADY_CANCELLED' },
    });

    const lotItemAfter = await prisma.lotItem.findUniqueOrThrow({
      where: { id: lot.lotItem.id },
    });
    expect(lotItemAfter.remainingQuantity).toBe(10);

    // Exactly one compensating movement: no second restoration ran.
    const cancelMovements = await prisma.stockMovement.findMany({
      where: { saleId: sale.id, type: 'cancel' },
    });
    expect(cancelMovements).toHaveLength(1);
  });

  // S2 rule: consuming exactly the total available succeeds and empties
  // every lot to 0.
  it('consumes the exact boundary and empties all lots', async () => {
    const product = await makeProduct(prisma);
    const supplier = await makeSupplier(prisma);
    const first = await makeLotWithItem(prisma, {
      productId: product.id,
      supplierId: supplier.id,
      lotNumber: 'LOT-B1',
      receivedAt: new Date('2026-01-01'),
      quantity: 3,
    });
    const second = await makeLotWithItem(prisma, {
      productId: product.id,
      supplierId: supplier.id,
      lotNumber: 'LOT-B2',
      receivedAt: new Date('2026-02-01'),
      quantity: 2,
    });

    await salesService.create(saleDto(product.id, 5));

    const firstAfter = await prisma.lotItem.findUniqueOrThrow({
      where: { id: first.lotItem.id },
    });
    const secondAfter = await prisma.lotItem.findUniqueOrThrow({
      where: { id: second.lotItem.id },
    });
    expect(firstAfter.remainingQuantity).toBe(0);
    expect(secondAfter.remainingQuantity).toBe(0);
  });
});
