import 'reflect-metadata';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { WorkOrderResponseDto } from './work-order-response.dto';

const prismaWorkOrder = {
  id: 'wo-1',
  orderNumber: 'WO-001',
  clientId: 'client-1',
  vehicleId: 'vehicle-1',
  description: 'Full service',
  status: 'pending',
  totalAmount: new Prisma.Decimal('1500.75'),
  isActive: true,
  employee: { id: 'emp-1', name: 'John Doe' },
  branch: { id: 'branch-1', name: 'Main Branch' },
  client: { id: 'client-1', name: 'Client Name' },
  vehicle: {
    id: 'vehicle-1',
    plate: 'ABC123',
    brand: 'Toyota',
    model: 'Corolla',
  },
  services: [],
  products: [],
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  deletedAt: null,
};

describe('WorkOrderResponseDto', () => {
  it('maps real Prisma Decimal fields to strings without throwing', () => {
    const response = plainToInstance(WorkOrderResponseDto, prismaWorkOrder, {
      excludeExtraneousValues: true,
    });

    expect(response.totalAmount).toBe('1500.75');
    expect(typeof response.totalAmount).toBe('string');
  });
});
