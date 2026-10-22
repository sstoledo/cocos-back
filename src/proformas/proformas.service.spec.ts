import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { SalesService } from '../sales/sales.service';
import { ProformasService } from './proformas.service';

describe('ProformasService', () => {
  let service: ProformasService;
  let prisma: PrismaService;
  let salesService: SalesService;

  const productRecord = {
    id: 'prod-1',
    code: 'OIL-5W30',
    name: 'Engine oil 5W-30',
    description: 'Synthetic engine oil',
    price: new Prisma.Decimal(10.0),
    isActive: true,
    deletedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  const productRecord2 = {
    id: 'prod-2',
    code: 'PAD-001',
    name: 'Brake pads',
    description: null,
    price: new Prisma.Decimal(25.0),
    isActive: true,
    deletedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  const baseProforma = {
    id: 'prof-1',
    proformaNumber: 'PRO-2026-000001',
    clientId: null,
    branchId: null,
    employeeId: null,
    status: 'draft',
    totalAmount: new Prisma.Decimal(20.0),
    notes: null,
    convertedSaleId: null,
    isActive: true,
    deletedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    client: null,
    branch: null,
    employee: null,
    products: [
      {
        id: 'line-1',
        proformaId: 'prof-1',
        productId: 'prod-1',
        quantity: 2,
        unitPriceSnapshot: new Prisma.Decimal(10.0),
        subtotal: new Prisma.Decimal(20.0),
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        product: {
          id: 'prod-1',
          code: 'OIL-5W30',
          name: 'Engine oil 5W-30',
          description: 'Synthetic engine oil',
          price: new Prisma.Decimal(10.0),
        },
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    salesService = {
      createSaleInTransaction: jest.fn(),
    } as unknown as SalesService;
    prisma = {
      product: { findUnique: jest.fn() },
      client: { findUnique: jest.fn() },
      branch: { findUnique: jest.fn() },
      employee: { findUnique: jest.fn() },
      proforma: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
        cb(txMock)
      ),
    } as unknown as PrismaService;

    service = new ProformasService(prisma, salesService);
  });

  const txMock = {
    proformaNumberSequence: { upsert: jest.fn() },
    proforma: {
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findUnique: jest.fn(),
    },
    proformaProduct: { deleteMany: jest.fn(), createMany: jest.fn() },
  };

  describe('create', () => {
    const dto = {
      productLines: [
        { productId: 'prod-1', quantity: 2 },
        { productId: 'prod-2', quantity: 1 },
      ],
    };

    it('rejects a proforma without product lines', async () => {
      await expect(service.create({ productLines: [] })).rejects.toThrow(
        BadRequestException
      );
      await expect(service.create({ productLines: [] })).rejects.toMatchObject({
        response: expect.objectContaining({
          errorCode: 'PROFORMA_EMPTY_LINES',
        }),
      });
    });

    it('rejects duplicate product lines', async () => {
      await expect(
        service.create({
          productLines: [
            { productId: 'prod-1', quantity: 1 },
            { productId: 'prod-1', quantity: 2 },
          ],
        })
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          errorCode: 'PROFORMA_DUPLICATE_LINE',
        }),
      });
    });

    it('rejects an unknown client', async () => {
      (prisma.client.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(
        service.create({ ...dto, clientId: 'missing' })
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects an inactive or unknown product', async () => {
      (prisma.product.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.create(dto)).rejects.toMatchObject({
        response: expect.objectContaining({ errorCode: 'PRODUCT_NOT_FOUND' }),
      });
    });

    it('creates a draft proforma with catalog price snapshots', async () => {
      (prisma.product.findUnique as jest.Mock)
        .mockResolvedValueOnce(productRecord)
        .mockResolvedValueOnce(productRecord2);
      txMock.proformaNumberSequence.upsert.mockResolvedValue({
        year: 2026,
        lastNumber: 1,
      });
      txMock.proforma.create.mockResolvedValue(baseProforma);

      const result = await service.create(dto);

      expect(txMock.proforma.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            proformaNumber: 'PRO-2026-000001',
            status: 'draft',
            totalAmount: new Prisma.Decimal(45),
            products: {
              create: [
                expect.objectContaining({
                  productId: 'prod-1',
                  quantity: 2,
                  unitPriceSnapshot: new Prisma.Decimal(10.0),
                  subtotal: new Prisma.Decimal(20),
                }),
                expect.objectContaining({
                  productId: 'prod-2',
                  quantity: 1,
                  unitPriceSnapshot: new Prisma.Decimal(25.0),
                  subtotal: new Prisma.Decimal(25),
                }),
              ],
            },
          }),
        })
      );
      expect(result.proformaNumber).toBe('PRO-2026-000001');
      expect(result.status).toBe('draft');
    });

    it('never touches stock when creating a proforma', async () => {
      (prisma.product.findUnique as jest.Mock).mockResolvedValue(productRecord);
      txMock.proformaNumberSequence.upsert.mockResolvedValue({
        year: 2026,
        lastNumber: 5,
      });
      txMock.proforma.create.mockResolvedValue(baseProforma);

      await service.create({
        productLines: [{ productId: 'prod-1', quantity: 1 }],
      });

      // The proforma transaction client exposes no stock operations at all.
      expect(txMock).not.toHaveProperty('stockMovement');
      expect(txMock).not.toHaveProperty('lotItem');
    });
  });

  describe('update', () => {
    it('rejects updates when the proforma is not draft', async () => {
      (prisma.proforma.findUnique as jest.Mock).mockResolvedValue({
        ...baseProforma,
        status: 'sent',
      });

      await expect(
        service.update('prof-1', { notes: 'nope' })
      ).rejects.toMatchObject({
        response: expect.objectContaining({ errorCode: 'PROFORMA_NOT_DRAFT' }),
      });
    });

    it('rejects updates on a missing proforma', async () => {
      (prisma.proforma.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.update('missing', { notes: 'x' })).rejects.toThrow(
        NotFoundException
      );
    });

    it('replaces lines and recomputes totals on draft update', async () => {
      (prisma.proforma.findUnique as jest.Mock).mockResolvedValue(baseProforma);
      (prisma.product.findUnique as jest.Mock).mockResolvedValue(
        productRecord2
      );
      txMock.proforma.update.mockResolvedValue({
        ...baseProforma,
        totalAmount: new Prisma.Decimal(50),
      });

      await service.update('prof-1', {
        productLines: [{ productId: 'prod-2', quantity: 2 }],
      });

      expect(txMock.proformaProduct.deleteMany).toHaveBeenCalledWith({
        where: { proformaId: 'prof-1' },
      });
      expect(txMock.proforma.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalAmount: new Prisma.Decimal(50),
          }),
        })
      );
    });
  });

  describe('updateStatus', () => {
    const cases: Array<[string, string, boolean]> = [
      ['draft', 'sent', true],
      ['sent', 'accepted', true],
      ['sent', 'rejected', true],
      ['draft', 'accepted', false],
      ['draft', 'rejected', false],
      ['accepted', 'rejected', false],
      ['converted', 'sent', false],
      ['rejected', 'sent', false],
    ];

    it.each(cases)('transition %s -> %s is %s', async (from, to, allowed) => {
      (prisma.proforma.findUnique as jest.Mock).mockResolvedValue({
        ...baseProforma,
        status: from,
      });
      txMock.proforma.updateMany.mockResolvedValue({ count: 1 });
      txMock.proforma.findUnique.mockResolvedValue({
        ...baseProforma,
        status: to,
      });

      if (allowed) {
        const result = await service.updateStatus('prof-1', {
          status: to as never,
        });
        expect(result.status).toBe(to);
      } else {
        await expect(
          service.updateStatus('prof-1', { status: to as never })
        ).rejects.toMatchObject({
          response: expect.objectContaining({
            errorCode: 'INVALID_STATUS_TRANSITION',
          }),
        });
      }
    });

    it('rejects setting converted through the status endpoint', async () => {
      (prisma.proforma.findUnique as jest.Mock).mockResolvedValue({
        ...baseProforma,
        status: 'accepted',
      });

      await expect(
        service.updateStatus('prof-1', { status: 'converted' as never })
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          errorCode: 'INVALID_STATUS_TRANSITION',
        }),
      });
    });

    it('loses the race when a concurrent transition wins the flip-first guard', async () => {
      (prisma.proforma.findUnique as jest.Mock).mockResolvedValue(baseProforma);
      txMock.proforma.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.updateStatus('prof-1', { status: 'sent' as never })
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          errorCode: 'INVALID_STATUS_TRANSITION',
        }),
      });
    });
  });

  describe('findAll', () => {
    it('returns paginated proformas with meta {page, limit, total}', async () => {
      (prisma.proforma.findMany as jest.Mock).mockResolvedValue([baseProforma]);
      (prisma.proforma.count as jest.Mock).mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(result.meta).toEqual({ page: 1, limit: 10, total: 1 });
      expect(result.data[0].proformaNumber).toBe('PRO-2026-000001');
    });
  });

  describe('findOne', () => {
    it('throws when the proforma does not exist', async () => {
      (prisma.proforma.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.findOne('missing')).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('convertToSale', () => {
    const acceptedProforma = { ...baseProforma, status: 'accepted' };
    const saleResult = { id: 'sale-9', saleNumber: 'VTA-2026-000003' };

    it('rejects a missing proforma', async () => {
      (prisma.proforma.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(
        service.convertToSale('missing', { paymentMethod: 'cash' })
      ).rejects.toThrow(NotFoundException);
    });

    it.each(['draft', 'sent', 'rejected', 'converted'])(
      'rejects conversion when status is %s',
      async (status) => {
        (prisma.proforma.findUnique as jest.Mock).mockResolvedValue({
          ...baseProforma,
          status,
        });
        await expect(
          service.convertToSale('prof-1', { paymentMethod: 'cash' })
        ).rejects.toMatchObject({
          response: expect.objectContaining({
            errorCode: 'PROFORMA_NOT_ACCEPTED',
          }),
        });
      }
    );

    it('flips to converted first, creates the sale in the same transaction and links it', async () => {
      (prisma.proforma.findUnique as jest.Mock).mockResolvedValue(
        acceptedProforma
      );
      txMock.proforma.updateMany.mockResolvedValue({ count: 1 });
      (salesService.createSaleInTransaction as jest.Mock).mockResolvedValue(
        saleResult
      );
      txMock.proforma.update.mockResolvedValue({
        ...acceptedProforma,
        status: 'converted',
        convertedSaleId: 'sale-9',
      });

      const result = await service.convertToSale('prof-1', {
        paymentMethod: 'cash',
      });

      expect(txMock.proforma.updateMany).toHaveBeenCalledWith({
        where: { id: 'prof-1', status: 'accepted' },
        data: { status: 'converted' },
      });
      expect(salesService.createSaleInTransaction).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          paymentMethod: 'cash',
          lineItems: [
            expect.objectContaining({
              productId: 'prod-1',
              quantity: 2,
              unitPriceSnapshot: new Prisma.Decimal(10.0),
              subtotal: new Prisma.Decimal(20),
            }),
          ],
        })
      );
      expect(txMock.proforma.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'prof-1' },
          data: { convertedSaleId: 'sale-9' },
        })
      );
      expect(result).toEqual(saleResult);
    });

    it('rolls back when a concurrent conversion wins the flip-first guard', async () => {
      (prisma.proforma.findUnique as jest.Mock).mockResolvedValue(
        acceptedProforma
      );
      txMock.proforma.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.convertToSale('prof-1', { paymentMethod: 'cash' })
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          errorCode: 'PROFORMA_NOT_ACCEPTED',
        }),
      });
      expect(salesService.createSaleInTransaction).not.toHaveBeenCalled();
    });

    it('propagates the sale failure so the whole transaction rolls back', async () => {
      (prisma.proforma.findUnique as jest.Mock).mockResolvedValue(
        acceptedProforma
      );
      txMock.proforma.updateMany.mockResolvedValue({ count: 1 });
      (salesService.createSaleInTransaction as jest.Mock).mockRejectedValue(
        new ConflictException({
          message: 'Insufficient stock',
          errorCode: 'INSUFFICIENT_STOCK',
        })
      );

      await expect(
        service.convertToSale('prof-1', { paymentMethod: 'cash' })
      ).rejects.toMatchObject({
        response: expect.objectContaining({ errorCode: 'INSUFFICIENT_STOCK' }),
      });
      expect(txMock.proforma.update).not.toHaveBeenCalled();
    });
  });
});
