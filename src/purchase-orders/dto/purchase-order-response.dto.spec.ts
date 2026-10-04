import 'reflect-metadata';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { PurchaseOrderResponseDto } from './purchase-order-response.dto';

const prismaPurchaseOrder = {
  id: 'po-1',
  purchaseOrderNumber: 'PO-001',
  supplierId: 'supplier-1',
  status: 'draft',
  notes: 'Urgent order',
  estimatedTotal: new Prisma.Decimal('5000.25'),
  supplier: { id: 'supplier-1', name: 'Supplier Inc' },
  lines: [],
  receipts: undefined,
  lotIds: undefined,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
};

describe('PurchaseOrderResponseDto', () => {
  it('maps real Prisma Decimal fields to strings without throwing', () => {
    const response = plainToInstance(
      PurchaseOrderResponseDto,
      prismaPurchaseOrder,
      {
        excludeExtraneousValues: true,
      }
    );

    expect(response.estimatedTotal).toBe('5000.25');
    expect(typeof response.estimatedTotal).toBe('string');
  });
});
