import 'reflect-metadata';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { SaleResponseDto } from './sale-response.dto';

const prismaSale = {
  id: 'sale-1',
  saleNumber: 'SALE-001',
  clientId: 'client-1',
  branchId: 'branch-1',
  employeeId: 'emp-1',
  status: 'completed',
  paymentMethod: 'cash',
  totalAmount: new Prisma.Decimal('2500.50'),
  isActive: true,
  client: { id: 'client-1', name: 'Client Name' },
  branch: { id: 'branch-1', name: 'Main Branch' },
  employee: { id: 'emp-1', name: 'John Doe' },
  products: [],
  services: [],
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  deletedAt: null,
};

describe('SaleResponseDto', () => {
  it('maps real Prisma Decimal fields to strings without throwing', () => {
    const response = plainToInstance(SaleResponseDto, prismaSale, {
      excludeExtraneousValues: true,
    });

    expect(response.totalAmount).toBe('2500.50');
    expect(typeof response.totalAmount).toBe('string');
  });
});
