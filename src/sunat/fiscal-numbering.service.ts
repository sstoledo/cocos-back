import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type FiscalCorrelativo = { serie: string; correlativo: number };

@Injectable()
export class FiscalNumberingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Reserves the next correlativo for a fiscal serie. Called inside the
   * emission transaction so a failed emission rolls the number back.
   */
  async nextNumber(serie: string): Promise<FiscalCorrelativo> {
    const sequence = await this.prisma.fiscalNumberSequence.upsert({
      where: { serie },
      create: { serie, lastNumber: 1 },
      update: { lastNumber: { increment: 1 } },
    });

    return { serie, correlativo: sequence.lastNumber };
  }
}
