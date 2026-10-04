import 'reflect-metadata';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { CashClosingResponseDto } from './cash-closing.response.dto';

const prismaCashClosing = {
  id: 'cc-1',
  periodStart: new Date('2026-01-01T00:00:00.000Z'),
  periodEnd: new Date('2026-01-01T23:59:59.000Z'),
  expectedCash: new Prisma.Decimal('1000.00'),
  expectedCard: new Prisma.Decimal('2000.50'),
  expectedTransfer: new Prisma.Decimal('500.25'),
  declaredCash: new Prisma.Decimal('995.00'),
  difference: new Prisma.Decimal('-5.00'),
  salesCount: 15,
  notes: 'End of day closing',
  createdAt: new Date('2026-01-01T23:59:59.000Z'),
  closedBy: { id: 'emp-1', name: 'John Doe' },
};

describe('CashClosingResponseDto', () => {
  it('maps real Prisma Decimal fields to strings without throwing', () => {
    const response = plainToInstance(
      CashClosingResponseDto,
      prismaCashClosing,
      {
        excludeExtraneousValues: true,
      }
    );

    expect(response.expectedCash).toBe('1000');
    expect(typeof response.expectedCash).toBe('string');
    expect(response.expectedCard).toBe('2000.5');
    expect(typeof response.expectedCard).toBe('string');
    expect(response.expectedTransfer).toBe('500.25');
    expect(typeof response.expectedTransfer).toBe('string');
    expect(response.declaredCash).toBe('995');
    expect(typeof response.declaredCash).toBe('string');
    expect(response.difference).toBe('-5');
    expect(typeof response.difference).toBe('string');
  });
});
