import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaymentMethod, Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { PrismaService } from '../prisma/prisma.service';
import { CashClosingResponseDto } from './dto/cash-closing.response.dto';
import { ClosingPreviewResponseDto } from './dto/closing-preview.response.dto';
import type { CreateCashClosingDto } from './dto/create-cash-closing.dto';
import type { ListCashClosingsQueryDto } from './dto/list-cash-closings-query.dto';

type Client = Pick<Prisma.TransactionClient, 'cashClosing' | 'sale'>;

interface PeriodTotals {
  expectedCash: Prisma.Decimal;
  expectedCard: Prisma.Decimal;
  expectedTransfer: Prisma.Decimal;
  salesCount: number;
}

@Injectable()
export class CashClosingsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Expected totals for the current open period. Nothing is persisted: the
   * snapshot only exists once a close is posted.
   */
  async preview(_userId: string): Promise<ClosingPreviewResponseDto> {
    const now = new Date();
    const periodStart = await this.resolvePeriodStart(this.prisma);
    const totals = await this.aggregatePeriod(this.prisma, periodStart, now);

    return plainToInstance(
      ClosingPreviewResponseDto,
      {
        periodStart,
        expectedCash: totals.expectedCash.toFixed(2),
        expectedCard: totals.expectedCard.toFixed(2),
        expectedTransfer: totals.expectedTransfer.toFixed(2),
        salesCount: totals.salesCount,
      },
      { excludeExtraneousValues: true }
    );
  }

  /**
   * Immutable snapshot of the open period. The whole read+write runs in one
   * transaction against a single `now`; a concurrent close for the same
   * periodStart loses the @@unique([periodStart]) race and gets a 409.
   */
  async close(
    userId: string,
    dto: CreateCashClosingDto
  ): Promise<CashClosingResponseDto> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const now = new Date();
        const periodStart = (await this.resolvePeriodStart(tx)) ?? now;
        const totals = await this.aggregatePeriod(tx, periodStart, now);

        const declaredCash = new Prisma.Decimal(dto.declaredCash);
        const difference = declaredCash.minus(totals.expectedCash);

        const closing = await tx.cashClosing.create({
          data: {
            closedById: userId,
            periodStart,
            periodEnd: now,
            expectedCash: totals.expectedCash,
            expectedCard: totals.expectedCard,
            expectedTransfer: totals.expectedTransfer,
            declaredCash,
            difference,
            salesCount: totals.salesCount,
            notes: dto.notes ?? null,
          },
          include: { closedBy: { select: { id: true, name: true } } },
        });

        return this.toResponse(closing);
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException({
          message: 'A cash closing already exists for this period',
          errorCode: 'CLOSING_CONFLICT',
        });
      }
      throw error;
    }
  }

  /**
   * Newest first (periodEnd desc). Closings are an immutable audit trail —
   * no soft-delete filter applies here.
   */
  async findAll(queryDto: ListCashClosingsQueryDto) {
    const { page = 1, limit = 20 } = queryDto;

    const [data, total] = await Promise.all([
      this.prisma.cashClosing.findMany({
        orderBy: { periodEnd: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { closedBy: { select: { id: true, name: true } } },
      }),
      this.prisma.cashClosing.count(),
    ]);

    return {
      data: data.map((closing) => this.toResponse(closing)),
      meta: { page, limit, total },
    };
  }

  async findOne(id: string): Promise<CashClosingResponseDto> {
    const closing = await this.prisma.cashClosing.findUnique({
      where: { id },
      include: { closedBy: { select: { id: true, name: true } } },
    });

    if (!closing) {
      throw new NotFoundException({
        message: 'Cash closing not found',
        errorCode: 'CASH_CLOSING_NOT_FOUND',
      });
    }

    return this.toResponse(closing);
  }

  /**
   * Chained periods: the open period starts where the last closing ended.
   * Before the first closing ever, it starts at the earliest completed sale
   * (null when the shop has no sales yet — the period is empty by
   * construction, so the unbounded lower side changes nothing).
   */
  private async resolvePeriodStart(client: Client): Promise<Date | null> {
    const lastClosing = await client.cashClosing.findFirst({
      orderBy: { periodEnd: 'desc' },
    });
    if (lastClosing) {
      return lastClosing.periodEnd;
    }

    const earliestSale = await client.sale.findFirst({
      where: { status: 'completed', isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    });
    return earliestSale?.createdAt ?? null;
  }

  /**
   * SAL-NF4: only completed + active sales enter the totals; cancelled sales
   * never do. Methods without rows in the period are zero-filled.
   */
  private async aggregatePeriod(
    client: Client,
    periodStart: Date | null,
    now: Date
  ): Promise<PeriodTotals> {
    const createdAt: Prisma.DateTimeFilter = { lt: now };
    if (periodStart) {
      createdAt.gte = periodStart;
    }
    const where: Prisma.SaleWhereInput = {
      status: 'completed',
      isActive: true,
      createdAt,
    };

    const [groups, salesCount] = await Promise.all([
      client.sale.groupBy({
        by: ['paymentMethod'],
        where,
        _sum: { totalAmount: true },
      }),
      client.sale.count({ where }),
    ]);

    const totals: Record<PaymentMethod, Prisma.Decimal> = {
      [PaymentMethod.cash]: new Prisma.Decimal(0),
      [PaymentMethod.card]: new Prisma.Decimal(0),
      [PaymentMethod.transfer]: new Prisma.Decimal(0),
    };
    for (const group of groups) {
      totals[group.paymentMethod] = new Prisma.Decimal(
        group._sum.totalAmount ?? 0
      );
    }

    return {
      expectedCash: totals[PaymentMethod.cash],
      expectedCard: totals[PaymentMethod.card],
      expectedTransfer: totals[PaymentMethod.transfer],
      salesCount,
    };
  }

  private toResponse(closing: {
    id: string;
    periodStart: Date;
    periodEnd: Date;
    expectedCash: Prisma.Decimal;
    expectedCard: Prisma.Decimal;
    expectedTransfer: Prisma.Decimal;
    declaredCash: Prisma.Decimal;
    difference: Prisma.Decimal;
    salesCount: number;
    notes: string | null;
    createdAt: Date;
    closedBy: { id: string; name: string };
  }): CashClosingResponseDto {
    return plainToInstance(
      CashClosingResponseDto,
      {
        id: closing.id,
        periodStart: closing.periodStart,
        periodEnd: closing.periodEnd,
        expectedCash: closing.expectedCash.toFixed(2),
        expectedCard: closing.expectedCard.toFixed(2),
        expectedTransfer: closing.expectedTransfer.toFixed(2),
        declaredCash: closing.declaredCash.toFixed(2),
        difference: closing.difference.toFixed(2),
        salesCount: closing.salesCount,
        notes: closing.notes,
        createdAt: closing.createdAt,
        closedBy: closing.closedBy,
      },
      { excludeExtraneousValues: true }
    );
  }
}
