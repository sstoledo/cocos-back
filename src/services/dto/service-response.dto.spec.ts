import 'reflect-metadata';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { ServiceResponseDto } from './service-response.dto';

const prismaService = {
  id: 'serv-1',
  code: 'SRV-001',
  name: 'Oil change',
  description: 'Full synthetic oil change',
  price: new Prisma.Decimal('45.00'),
  estimatedDuration: 30,
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  deletedAt: null,
};

describe('ServiceResponseDto', () => {
  it('maps real Prisma Decimal fields to strings without throwing', () => {
    const response = plainToInstance(ServiceResponseDto, prismaService, {
      excludeExtraneousValues: true,
    });

    expect(response.price).toBe('45');
    expect(typeof response.price).toBe('string');
  });
});
