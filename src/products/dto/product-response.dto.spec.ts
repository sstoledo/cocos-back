import 'reflect-metadata';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { ProductResponseDto } from './product-response.dto';

const prismaProduct = {
  id: 'prod-1',
  code: 'OIL-001',
  name: 'Engine oil',
  description: 'Synthetic engine oil',
  price: new Prisma.Decimal('45.00'),
  presentationId: 'pres-1',
  presentation: { id: 'pres-1', name: 'Galón' },
  brandId: 'brand-1',
  brand: { id: 'brand-1', name: 'Mobil' },
  categoryId: 'cat-1',
  category: { id: 'cat-1', name: 'Lubricantes', parent: null },
  barcode: '123456789012',
  taxRate: new Prisma.Decimal('21.00'),
  notes: 'Keep away from heat sources',
  imageUrl: null,
  imagePublicId: null,
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  deletedAt: null,
};

describe('ProductResponseDto', () => {
  it('maps real Prisma Decimal fields to strings without throwing', () => {
    const response = plainToInstance(ProductResponseDto, prismaProduct, {
      excludeExtraneousValues: true,
    });

    expect(response.price).toBe('45');
    expect(typeof response.price).toBe('string');
    expect(response.taxRate).toBe('21');
    expect(typeof response.taxRate).toBe('string');
  });
});
