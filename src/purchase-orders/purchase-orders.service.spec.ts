import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PurchaseOrderStatus } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import type { ReceivePurchaseOrderDto } from './dto/receive-purchase-order.dto';
import type { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto';
import { PurchaseOrdersService } from './purchase-orders.service';

describe('PurchaseOrdersService', () => {
  let service: PurchaseOrdersService;
  let prisma: PrismaService;

  const supplierRecord = {
    id: 'sup-1',
    name: 'Auto Parts SA',
    isActive: true,
  };

  const productRecord = {
    id: 'prod-1',
    code: 'OIL-5W30',
    name: 'Engine oil 5W-30',
    isActive: true,
  };

  const lineRecord = {
    id: 'line-1',
    purchaseOrderId: 'po-1',
    productId: 'prod-1',
    quantityOrdered: 10,
    quantityReceived: 0,
    estimatedCostPrice: new Prisma.Decimal(5),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    product: { id: 'prod-1', code: 'OIL-5W30', name: 'Engine oil 5W-30' },
  };

  const poRecord = {
    id: 'po-1',
    purchaseOrderNumber: 'COM-2026-000007',
    supplierId: 'sup-1',
    status: PurchaseOrderStatus.draft,
    notes: null,
    estimatedTotal: new Prisma.Decimal(50),
    receiptCount: 0,
    isActive: true,
    deletedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    supplier: { id: 'sup-1', name: 'Auto Parts SA' },
    lines: [lineRecord],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      supplier: { findUnique: jest.fn() },
      product: { findUnique: jest.fn() },
      purchaseOrderNumberSequence: { upsert: jest.fn() },
      purchaseOrder: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        updateMany: jest.fn(),
      },
      purchaseOrderLine: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
        updateMany: jest.fn(),
      },
      lot: { findMany: jest.fn(), create: jest.fn() },
      lotItem: { create: jest.fn() },
      stockMovement: { create: jest.fn() },
      $transaction: jest.fn(),
    } as unknown as PrismaService;
    (prisma.$transaction as jest.Mock).mockImplementation(
      (callback: (tx: unknown) => unknown) => callback(prisma)
    );
    (prisma.supplier.findUnique as jest.Mock).mockResolvedValue(supplierRecord);
    (prisma.product.findUnique as jest.Mock).mockResolvedValue(productRecord);
    (prisma.purchaseOrderNumberSequence.upsert as jest.Mock).mockResolvedValue({
      id: 'seq-1',
      year: 2026,
      lastNumber: 7,
    });
    (prisma.purchaseOrder.updateMany as jest.Mock).mockResolvedValue({
      count: 1,
    });
    (prisma.purchaseOrderLine.updateMany as jest.Mock).mockResolvedValue({
      count: 1,
    });
    (prisma.lot.create as jest.Mock).mockResolvedValue({ id: 'lot-1' });
    (prisma.lotItem.create as jest.Mock).mockResolvedValue({ id: 'item-1' });
    (prisma.purchaseOrder.create as jest.Mock).mockImplementation(
      (args: { data: Record<string, unknown> }) => ({
        ...poRecord,
        purchaseOrderNumber: args.data.purchaseOrderNumber,
        notes: args.data.notes ?? null,
        estimatedTotal: args.data.estimatedTotal,
        lines: (
          args.data.lines as { create: Array<Record<string, unknown>> }
        ).create.map((line, index) => ({
          ...lineRecord,
          ...line,
          id: `line-${index + 1}`,
        })),
      })
    );
    service = new PurchaseOrdersService(prisma);
  });

  describe('create', () => {
    it('creates a draft with in-tx COM numbering and server-computed total (S1, S3)', async () => {
      const dto: CreatePurchaseOrderDto = {
        supplierId: 'sup-1',
        lines: [
          {
            productId: 'prod-1',
            quantityOrdered: 10,
            estimatedCostPrice: '5.00',
          },
        ],
      };

      const result = await service.create(dto);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.purchaseOrderNumberSequence.upsert).toHaveBeenCalledWith({
        where: { year: new Date().getFullYear() },
        create: { year: new Date().getFullYear(), lastNumber: 1 },
        update: { lastNumber: { increment: 1 } },
      });
      const sequenceOrder = (
        prisma.purchaseOrderNumberSequence.upsert as jest.Mock
      ).mock.invocationCallOrder[0];
      const createOrder = (prisma.purchaseOrder.create as jest.Mock).mock
        .invocationCallOrder[0];
      expect(sequenceOrder).toBeLessThan(createOrder);

      const createArgs = (prisma.purchaseOrder.create as jest.Mock).mock
        .calls[0][0];
      expect(createArgs.data.purchaseOrderNumber).toBe('COM-2026-000007');
      expect(createArgs.data.lines.create[0]).toMatchObject({
        productId: 'prod-1',
        quantityOrdered: 10,
      });
      expect(
        Number(createArgs.data.lines.create[0].estimatedCostPrice).toFixed(2)
      ).toBe('5.00');
      expect(Number(createArgs.data.estimatedTotal).toFixed(2)).toBe('50.00');

      expect(result.purchaseOrderNumber).toMatch(/^COM-\d{4}-\d{6}$/);
      expect(result.status).toBe('draft');
      expect(result.estimatedTotal).toBe('50.00');
      expect(result.lines[0].estimatedCostPrice).toBe('5.00');
    });

    it('throws 400 PO_EMPTY_LINES when no lines are provided (S2)', async () => {
      await expect(
        service.create({ supplierId: 'sup-1', lines: [] })
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.create({ supplierId: 'sup-1', lines: [] })
      ).rejects.toMatchObject({
        response: { errorCode: 'PO_EMPTY_LINES' },
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws 400 PO_DUPLICATE_LINE for duplicate productId lines (S2)', async () => {
      await expect(
        service.create({
          supplierId: 'sup-1',
          lines: [
            {
              productId: 'prod-1',
              quantityOrdered: 1,
              estimatedCostPrice: '5.00',
            },
            {
              productId: 'prod-1',
              quantityOrdered: 2,
              estimatedCostPrice: '6.00',
            },
          ],
        })
      ).rejects.toMatchObject({
        response: { errorCode: 'PO_DUPLICATE_LINE' },
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws 404 SUPPLIER_NOT_FOUND for unknown supplier (S2)', async () => {
      (prisma.supplier.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.create({
          supplierId: 'sup-x',
          lines: [
            {
              productId: 'prod-1',
              quantityOrdered: 1,
              estimatedCostPrice: '5.00',
            },
          ],
        })
      ).rejects.toMatchObject({
        response: { errorCode: 'SUPPLIER_NOT_FOUND' },
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws 404 PRODUCT_NOT_FOUND for unknown or inactive product (S2)', async () => {
      (prisma.product.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.create({
          supplierId: 'sup-1',
          lines: [
            {
              productId: 'prod-x',
              quantityOrdered: 1,
              estimatedCostPrice: '5.00',
            },
          ],
        })
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.create({
          supplierId: 'sup-1',
          lines: [
            {
              productId: 'prod-x',
              quantityOrdered: 1,
              estimatedCostPrice: '5.00',
            },
          ],
        })
      ).rejects.toMatchObject({ response: { errorCode: 'PRODUCT_NOT_FOUND' } });
    });
  });

  describe('findAll', () => {
    it('returns paginated purchase orders in { data, meta } shape (S4)', async () => {
      (prisma.purchaseOrder.findMany as jest.Mock).mockResolvedValue([
        poRecord,
      ]);
      (prisma.purchaseOrder.count as jest.Mock).mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(prisma.purchaseOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
          skip: 0,
          take: 10,
        })
      );
      expect(result.meta).toEqual({ page: 1, limit: 10, total: 1 });
      expect(result.data).toHaveLength(1);
      expect(result.data[0].purchaseOrderNumber).toBe('COM-2026-000007');
      expect(result.data[0].estimatedTotal).toBe('50.00');
    });

    it('applies status, supplierId and partial purchaseOrderNumber filters (S4)', async () => {
      (prisma.purchaseOrder.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.purchaseOrder.count as jest.Mock).mockResolvedValue(0);

      await service.findAll({
        page: 2,
        limit: 5,
        status: PurchaseOrderStatus.ordered,
        supplierId: 'sup-1',
        purchaseOrderNumber: 'COM-2026-0000',
      });

      const findManyArgs = (prisma.purchaseOrder.findMany as jest.Mock).mock
        .calls[0][0];
      expect(findManyArgs).toMatchObject({
        where: {
          isActive: true,
          status: PurchaseOrderStatus.ordered,
          supplierId: 'sup-1',
          purchaseOrderNumber: {
            contains: 'COM-2026-0000',
            mode: 'insensitive',
          },
        },
        skip: 5,
        take: 5,
      });
    });
  });

  describe('findOne', () => {
    const lotRecord = (suffix: string, receivedAt: string) => ({
      id: `lot-${suffix}`,
      lotNumber: `COM-2026-000007-R${suffix}`,
      supplierId: 'sup-1',
      purchaseOrderId: 'po-1',
      receivedAt: new Date(receivedAt),
      notes: null,
      createdAt: new Date(receivedAt),
      updatedAt: new Date(receivedAt),
      items: [
        {
          id: `item-${suffix}`,
          lotId: `lot-${suffix}`,
          productId: 'prod-1',
          quantity: 4,
          remainingQuantity: 4,
          costPrice: new Prisma.Decimal(5.5),
          expirationDate: new Date('2027-01-01T00:00:00.000Z'),
        },
      ],
    });

    it('returns the PO with lines and receipt history from lots (S5)', async () => {
      (prisma.purchaseOrder.findUnique as jest.Mock).mockResolvedValue(
        poRecord
      );
      (prisma.lot.findMany as jest.Mock).mockResolvedValue([
        lotRecord('1', '2026-02-01T00:00:00.000Z'),
        lotRecord('2', '2026-02-02T00:00:00.000Z'),
      ]);

      const result = await service.findOne('po-1');

      expect(prisma.purchaseOrder.findUnique).toHaveBeenCalledWith({
        where: { id: 'po-1', isActive: true },
        include: expect.anything(),
      });
      expect(prisma.lot.findMany).toHaveBeenCalledWith({
        where: { purchaseOrderId: 'po-1' },
        include: { items: true },
        orderBy: { receivedAt: 'asc' },
      });
      expect(result.id).toBe('po-1');
      expect(result.lines[0]).toMatchObject({
        productId: 'prod-1',
        quantityOrdered: 10,
        quantityReceived: 0,
        estimatedCostPrice: '5.00',
      });
      expect(result.receipts).toHaveLength(2);
      expect(result.receipts?.[0]).toEqual({
        lotId: 'lot-1',
        lotNumber: 'COM-2026-000007-R1',
        receivedAt: new Date('2026-02-01T00:00:00.000Z'),
        items: [
          {
            productId: 'prod-1',
            quantity: 4,
            costPrice: '5.50',
            expirationDate: new Date('2027-01-01T00:00:00.000Z'),
          },
        ],
      });
    });

    it('throws 404 PURCHASE_ORDER_NOT_FOUND when missing or inactive (S5)', async () => {
      (prisma.purchaseOrder.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.findOne('po-x')).rejects.toThrow(NotFoundException);
      await expect(service.findOne('po-x')).rejects.toMatchObject({
        response: { errorCode: 'PURCHASE_ORDER_NOT_FOUND' },
      });
    });
  });

  describe('updateDraft (S6)', () => {
    const updatedPoRecord = {
      ...poRecord,
      estimatedTotal: new Prisma.Decimal(75),
      lines: [
        {
          ...lineRecord,
          id: 'line-new-1',
          quantityOrdered: 15,
          quantityReceived: 0,
          estimatedCostPrice: new Prisma.Decimal(5),
        },
      ],
    };

    const updateDto: UpdatePurchaseOrderDto = {
      lines: [
        {
          productId: 'prod-1',
          quantityOrdered: 15,
          estimatedCostPrice: '5.00',
        },
      ],
    };

    it('full-replaces lines in one tx and recomputes the total (S6)', async () => {
      (prisma.purchaseOrder.findUnique as jest.Mock)
        .mockResolvedValueOnce(poRecord)
        .mockResolvedValueOnce(updatedPoRecord);

      const result = await service.updateDraft('po-1', updateDto);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.purchaseOrder.updateMany).toHaveBeenCalledWith({
        where: { id: 'po-1', isActive: true, status: 'draft' },
        data: { estimatedTotal: expect.anything() },
      });
      const guardArgs = (prisma.purchaseOrder.updateMany as jest.Mock).mock
        .calls[0][0];
      expect(Number(guardArgs.data.estimatedTotal).toFixed(2)).toBe('75.00');

      expect(prisma.purchaseOrderLine.deleteMany).toHaveBeenCalledWith({
        where: { purchaseOrderId: 'po-1' },
      });
      expect(prisma.purchaseOrderLine.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            purchaseOrderId: 'po-1',
            productId: 'prod-1',
            quantityOrdered: 15,
          }),
        ],
      });
      const deleteOrder = (prisma.purchaseOrderLine.deleteMany as jest.Mock)
        .mock.invocationCallOrder[0];
      const createOrder = (prisma.purchaseOrderLine.createMany as jest.Mock)
        .mock.invocationCallOrder[0];
      expect(deleteOrder).toBeLessThan(createOrder);

      const lineArgs = (prisma.purchaseOrderLine.createMany as jest.Mock).mock
        .calls[0][0];
      expect(lineArgs.data[0]).not.toHaveProperty('quantityReceived');

      expect(result.estimatedTotal).toBe('75.00');
      expect(result.lines).toHaveLength(1);
      expect(result.lines[0]).toMatchObject({
        productId: 'prod-1',
        quantityOrdered: 15,
        quantityReceived: 0,
      });
    });

    it('throws 409 PO_NOT_DRAFT when the PO is not draft, with zero writes (S6)', async () => {
      (prisma.purchaseOrder.findUnique as jest.Mock).mockResolvedValue({
        ...poRecord,
        status: PurchaseOrderStatus.ordered,
      });
      (prisma.purchaseOrder.updateMany as jest.Mock).mockResolvedValue({
        count: 0,
      });

      await expect(service.updateDraft('po-1', updateDto)).rejects.toThrow(
        ConflictException
      );
      await expect(
        service.updateDraft('po-1', updateDto)
      ).rejects.toMatchObject({ response: { errorCode: 'PO_NOT_DRAFT' } });
      expect(prisma.purchaseOrderLine.deleteMany).not.toHaveBeenCalled();
      expect(prisma.purchaseOrderLine.createMany).not.toHaveBeenCalled();
    });

    it('throws 404 PURCHASE_ORDER_NOT_FOUND for a missing PO (S6)', async () => {
      (prisma.purchaseOrder.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.updateDraft('po-x', updateDto)
      ).rejects.toMatchObject({
        response: { errorCode: 'PURCHASE_ORDER_NOT_FOUND' },
      });
      expect(prisma.purchaseOrder.updateMany).not.toHaveBeenCalled();
      expect(prisma.purchaseOrderLine.deleteMany).not.toHaveBeenCalled();
    });

    it('rejects empty lines, duplicates and unknown products (S6)', async () => {
      await expect(
        service.updateDraft('po-1', { lines: [] })
      ).rejects.toMatchObject({ response: { errorCode: 'PO_EMPTY_LINES' } });

      await expect(
        service.updateDraft('po-1', {
          lines: [
            {
              productId: 'prod-1',
              quantityOrdered: 1,
              estimatedCostPrice: '5.00',
            },
            {
              productId: 'prod-1',
              quantityOrdered: 2,
              estimatedCostPrice: '6.00',
            },
          ],
        })
      ).rejects.toMatchObject({ response: { errorCode: 'PO_DUPLICATE_LINE' } });

      (prisma.product.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(
        service.updateDraft('po-1', updateDto)
      ).rejects.toMatchObject({ response: { errorCode: 'PRODUCT_NOT_FOUND' } });

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('order (S7)', () => {
    it('flips draft to ordered via guarded updateMany (S7)', async () => {
      (prisma.purchaseOrder.findUnique as jest.Mock)
        .mockResolvedValueOnce(poRecord)
        .mockResolvedValueOnce({ ...poRecord, status: 'ordered' });

      const result = await service.order('po-1');

      expect(prisma.purchaseOrder.updateMany).toHaveBeenCalledWith({
        where: { id: 'po-1', status: 'draft' },
        data: { status: 'ordered' },
      });
      expect(result.status).toBe('ordered');
    });

    it.each([
      PurchaseOrderStatus.ordered,
      PurchaseOrderStatus.partially_received,
      PurchaseOrderStatus.received,
      PurchaseOrderStatus.cancelled,
    ])(
      'throws 409 PO_ALREADY_ORDERED when the PO is %s (S7)',
      async (status) => {
        (prisma.purchaseOrder.findUnique as jest.Mock).mockResolvedValue({
          ...poRecord,
          status,
        });
        (prisma.purchaseOrder.updateMany as jest.Mock).mockResolvedValue({
          count: 0,
        });

        await expect(service.order('po-1')).rejects.toThrow(ConflictException);
        await expect(service.order('po-1')).rejects.toMatchObject({
          response: { errorCode: 'PO_ALREADY_ORDERED' },
        });
      }
    );

    it('throws 404 PURCHASE_ORDER_NOT_FOUND for a missing PO (S7)', async () => {
      (prisma.purchaseOrder.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.order('po-x')).rejects.toMatchObject({
        response: { errorCode: 'PURCHASE_ORDER_NOT_FOUND' },
      });
    });
  });

  describe('cancel (S11)', () => {
    it.each([PurchaseOrderStatus.draft, PurchaseOrderStatus.ordered])(
      'flips %s to cancelled with zero stock writes (S11)',
      async (status) => {
        (prisma.purchaseOrder.findUnique as jest.Mock)
          .mockResolvedValueOnce({ ...poRecord, status })
          .mockResolvedValueOnce({ ...poRecord, status: 'cancelled' });

        const result = await service.cancel('po-1');

        expect(prisma.purchaseOrder.updateMany).toHaveBeenCalledWith({
          where: {
            id: 'po-1',
            status: { in: ['draft', 'ordered'] },
          },
          data: { status: 'cancelled' },
        });
        expect(result.status).toBe('cancelled');
        expect(result.purchaseOrderNumber).toBe('COM-2026-000007');
      }
    );

    it.each([
      PurchaseOrderStatus.partially_received,
      PurchaseOrderStatus.received,
      PurchaseOrderStatus.cancelled,
    ])(
      'throws 409 PO_CANNOT_CANCEL when the PO is %s (S11)',
      async (status) => {
        (prisma.purchaseOrder.findUnique as jest.Mock).mockResolvedValue({
          ...poRecord,
          status,
        });
        (prisma.purchaseOrder.updateMany as jest.Mock).mockResolvedValue({
          count: 0,
        });

        await expect(service.cancel('po-1')).rejects.toThrow(ConflictException);
        await expect(service.cancel('po-1')).rejects.toMatchObject({
          response: { errorCode: 'PO_CANNOT_CANCEL' },
        });
      }
    );

    it('throws 404 PURCHASE_ORDER_NOT_FOUND for a missing PO (S11)', async () => {
      (prisma.purchaseOrder.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.cancel('po-x')).rejects.toMatchObject({
        response: { errorCode: 'PURCHASE_ORDER_NOT_FOUND' },
      });
    });
  });

  describe('receive (S8/S9/S10/S13)', () => {
    const expiration = '2027-06-01T00:00:00.000Z';

    const orderedPo = {
      ...poRecord,
      status: PurchaseOrderStatus.ordered,
      receiptCount: 0,
    };

    const lineWithReceived = (quantityReceived: number) => ({
      ...lineRecord,
      quantityOrdered: 10,
      quantityReceived,
    });

    const receiveDto = (receivedQty: number): ReceivePurchaseOrderDto => ({
      lines: [
        {
          lineId: 'line-1',
          receivedQty,
          expirationDate: expiration,
          actualCostPrice: '5.50',
        },
      ],
    });

    it('receives a full line in one tx: PO lock, guarded increment, lot, item, entry movement, flip (S8)', async () => {
      (prisma.purchaseOrder.findUnique as jest.Mock)
        .mockResolvedValueOnce(orderedPo)
        .mockResolvedValueOnce({ ...orderedPo, status: 'received' });

      const result = await service.receive('po-1', receiveDto(10));

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      // Receivability guard takes the PO row lock and bumps receiptCount
      expect(prisma.purchaseOrder.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'po-1',
          status: { in: ['ordered', 'partially_received'] },
        },
        data: { receiptCount: { increment: 1 } },
      });
      // Overshoot guard: quantityOrdered is immutable, RHS is constant
      expect(prisma.purchaseOrderLine.updateMany).toHaveBeenCalledWith({
        where: { id: 'line-1', quantityReceived: { lte: 0 } },
        data: { quantityReceived: { increment: 10 } },
      });
      expect(prisma.lot.create).toHaveBeenCalledWith({
        data: {
          lotNumber: 'COM-2026-000007-R1',
          supplierId: 'sup-1',
          purchaseOrderId: 'po-1',
        },
      });
      expect(prisma.lotItem.create).toHaveBeenCalledWith({
        data: {
          lotId: 'lot-1',
          productId: 'prod-1',
          quantity: 10,
          remainingQuantity: 10,
          costPrice: expect.anything(),
          expirationDate: new Date(expiration),
        },
      });
      const itemArgs = (prisma.lotItem.create as jest.Mock).mock.calls[0][0];
      expect(Number(itemArgs.data.costPrice).toFixed(2)).toBe('5.50');
      expect(prisma.stockMovement.create).toHaveBeenCalledWith({
        data: {
          productId: 'prod-1',
          lotItemId: 'item-1',
          purchaseOrderId: 'po-1',
          type: 'entry',
          quantity: 10,
          reason: 'Receive COM-2026-000007 (COM-2026-000007-R1)',
        },
      });
      const movementOrder = (prisma.stockMovement.create as jest.Mock).mock
        .invocationCallOrder[0];
      const lotOrder = (prisma.lot.create as jest.Mock).mock
        .invocationCallOrder[0];
      expect(lotOrder).toBeLessThan(movementOrder);
      expect(prisma.purchaseOrder.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'po-1',
          status: { in: ['ordered', 'partially_received'] },
        },
        data: { status: 'received' },
      });
      expect(result.status).toBe('received');
      expect(result.lotIds).toEqual(['lot-1']);
    });

    it('partially receives then completes: one lot per event, suffix from receiptCount (S9)', async () => {
      const partiallyReceivedPo = {
        ...orderedPo,
        status: PurchaseOrderStatus.partially_received,
        receiptCount: 1,
        lines: [lineWithReceived(4)],
      };
      (prisma.purchaseOrder.findUnique as jest.Mock)
        .mockResolvedValueOnce(orderedPo)
        .mockResolvedValueOnce({ ...orderedPo, status: 'partially_received' })
        .mockResolvedValueOnce(partiallyReceivedPo)
        .mockResolvedValueOnce({ ...partiallyReceivedPo, status: 'received' });
      (prisma.lot.create as jest.Mock)
        .mockResolvedValueOnce({ id: 'lot-1' })
        .mockResolvedValueOnce({ id: 'lot-2' });

      const first = await service.receive('po-1', receiveDto(4));
      const second = await service.receive('po-1', receiveDto(6));

      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
      expect(prisma.lot.create).toHaveBeenNthCalledWith(1, {
        data: expect.objectContaining({ lotNumber: 'COM-2026-000007-R1' }),
      });
      expect(prisma.lot.create).toHaveBeenNthCalledWith(2, {
        data: expect.objectContaining({ lotNumber: 'COM-2026-000007-R2' }),
      });
      // Overshoot RHS: 10 - 4 = 6 on the second receive
      expect(prisma.purchaseOrderLine.updateMany).toHaveBeenNthCalledWith(2, {
        where: { id: 'line-1', quantityReceived: { lte: 4 } },
        data: { quantityReceived: { increment: 6 } },
      });
      expect(first.status).toBe('partially_received');
      expect(first.lotIds).toEqual(['lot-1']);
      expect(second.status).toBe('received');
      expect(second.lotIds).toEqual(['lot-2']);
    });

    it.each([
      PurchaseOrderStatus.draft,
      PurchaseOrderStatus.received,
      PurchaseOrderStatus.cancelled,
    ])(
      'throws 409 PO_NOT_RECEIVABLE when the PO is %s, with zero stock writes (S10)',
      async (status) => {
        (prisma.purchaseOrder.findUnique as jest.Mock).mockResolvedValue({
          ...orderedPo,
          status,
        });
        (prisma.purchaseOrder.updateMany as jest.Mock).mockResolvedValue({
          count: 0,
        });

        await expect(service.receive('po-1', receiveDto(1))).rejects.toThrow(
          ConflictException
        );
        await expect(
          service.receive('po-1', receiveDto(1))
        ).rejects.toMatchObject({
          response: { errorCode: 'PO_NOT_RECEIVABLE' },
        });
        expect(prisma.purchaseOrderLine.updateMany).not.toHaveBeenCalled();
        expect(prisma.lot.create).not.toHaveBeenCalled();
        expect(prisma.lotItem.create).not.toHaveBeenCalled();
        expect(prisma.stockMovement.create).not.toHaveBeenCalled();
      }
    );

    it('throws 409 PO_RECEIVE_OVERSHOOT on guarded count 0, with zero stock writes (S10)', async () => {
      (prisma.purchaseOrder.findUnique as jest.Mock).mockResolvedValue({
        ...orderedPo,
        lines: [lineWithReceived(8)],
      });
      (prisma.purchaseOrderLine.updateMany as jest.Mock).mockResolvedValue({
        count: 0,
      });

      await expect(service.receive('po-1', receiveDto(5))).rejects.toThrow(
        ConflictException
      );
      await expect(
        service.receive('po-1', receiveDto(5))
      ).rejects.toMatchObject({
        response: { errorCode: 'PO_RECEIVE_OVERSHOOT' },
      });
      // The guard predicate must encode the constant bound (10 - 5 = 5)
      expect(prisma.purchaseOrderLine.updateMany).toHaveBeenCalledWith({
        where: { id: 'line-1', quantityReceived: { lte: 5 } },
        data: { quantityReceived: { increment: 5 } },
      });
      expect(prisma.lot.create).not.toHaveBeenCalled();
      expect(prisma.lotItem.create).not.toHaveBeenCalled();
      expect(prisma.stockMovement.create).not.toHaveBeenCalled();
    });

    it('throws 404 PO_LINE_NOT_FOUND for a line outside the PO (S10)', async () => {
      (prisma.purchaseOrder.findUnique as jest.Mock).mockResolvedValue(
        orderedPo
      );

      await expect(
        service.receive('po-1', {
          lines: [
            {
              lineId: 'line-x',
              receivedQty: 1,
              expirationDate: expiration,
              actualCostPrice: '5.50',
            },
          ],
        })
      ).rejects.toMatchObject({ response: { errorCode: 'PO_LINE_NOT_FOUND' } });
      expect(prisma.purchaseOrderLine.updateMany).not.toHaveBeenCalled();
      expect(prisma.lot.create).not.toHaveBeenCalled();
    });

    it('throws 404 PURCHASE_ORDER_NOT_FOUND for a missing PO (S10)', async () => {
      (prisma.purchaseOrder.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.receive('po-x', receiveDto(1))
      ).rejects.toMatchObject({
        response: { errorCode: 'PURCHASE_ORDER_NOT_FOUND' },
      });
      expect(prisma.purchaseOrder.updateMany).not.toHaveBeenCalled();
    });

    it('rejects empty receive lines before opening a transaction (S10)', async () => {
      await expect(
        service.receive('po-1', { lines: [] })
      ).rejects.toMatchObject({ response: { errorCode: 'PO_EMPTY_LINES' } });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('loses the race on the second guarded increment: exactly one lot, loser 409 (S13)', async () => {
      const racePo = {
        ...orderedPo,
        lines: [lineWithReceived(5)],
      };
      (prisma.purchaseOrder.findUnique as jest.Mock)
        .mockResolvedValueOnce(racePo)
        .mockResolvedValueOnce({ ...racePo, status: 'partially_received' })
        .mockResolvedValueOnce(racePo)
        .mockResolvedValueOnce(racePo);
      // First receive wins the row lock and increments; the loser's guard
      // re-checks the predicate after the lock wait and matches 0 rows.
      (prisma.purchaseOrderLine.updateMany as jest.Mock)
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });

      const winner = await service.receive('po-1', receiveDto(5));
      await expect(
        service.receive('po-1', receiveDto(5))
      ).rejects.toMatchObject({
        response: { errorCode: 'PO_RECEIVE_OVERSHOOT' },
      });

      expect(winner.status).toBe('partially_received');
      expect(winner.lotIds).toEqual(['lot-1']);
      // Movements match committed receipts exactly: one lot, one item,
      // one entry movement — nothing for the losing receive.
      expect(prisma.lot.create).toHaveBeenCalledTimes(1);
      expect(prisma.lotItem.create).toHaveBeenCalledTimes(1);
      expect(prisma.stockMovement.create).toHaveBeenCalledTimes(1);
    });
  });
});
