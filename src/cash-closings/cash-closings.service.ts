import {
  BadRequestException,
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

type Client = Pick<
  Prisma.TransactionClient,
  'cashClosing' | 'sale' | 'workOrder' | 'workOrderPayment'
>;

interface PeriodTotals {
  expectedCash: Prisma.Decimal;
  expectedCard: Prisma.Decimal;
  expectedTransfer: Prisma.Decimal;
  salesCount: number;
  workOrderPaymentsCash: Prisma.Decimal;
  workOrderPaymentsCard: Prisma.Decimal;
  workOrderPaymentsTransfer: Prisma.Decimal;
  workOrderPaymentsCount: number;
}

const zeroMethodTotals = (): Record<PaymentMethod, Prisma.Decimal> => ({
  [PaymentMethod.cash]: new Prisma.Decimal(0),
  [PaymentMethod.card]: new Prisma.Decimal(0),
  [PaymentMethod.transfer]: new Prisma.Decimal(0),
});

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
        workOrderPaymentsCash: totals.workOrderPaymentsCash.toFixed(2),
        workOrderPaymentsCard: totals.workOrderPaymentsCard.toFixed(2),
        workOrderPaymentsTransfer: totals.workOrderPaymentsTransfer.toFixed(2),
        workOrderPaymentsCount: totals.workOrderPaymentsCount,
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
        const resolvedStart = await this.resolvePeriodStart(tx);
        const totals = await this.aggregatePeriod(tx, resolvedStart, now);
        const doneWorkOrdersCount = await this.countDoneWorkOrders(
          tx,
          resolvedStart,
          now
        );

        if (
          totals.salesCount === 0 &&
          doneWorkOrdersCount === 0 &&
          totals.workOrderPaymentsCount === 0
        ) {
          throw new BadRequestException({
            message: 'No activity in the open period',
            errorCode: 'CLOSING_NO_ACTIVITY',
          });
        }

        // Defensive only: with activity present, resolvePeriodStart already
        // anchors to the earliest sale or done work order.
        const periodStart = resolvedStart ?? now;

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
            workOrderPaymentsCash: totals.workOrderPaymentsCash,
            workOrderPaymentsCard: totals.workOrderPaymentsCard,
            workOrderPaymentsTransfer: totals.workOrderPaymentsTransfer,
            workOrderPaymentsCount: totals.workOrderPaymentsCount,
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
   * or the earliest done work order, whichever came first (null when there
   * is no activity at all — close() rejects that case, so the fallback
   * below is defensive only).
   */
  private async resolvePeriodStart(client: Client): Promise<Date | null> {
    const lastClosing = await client.cashClosing.findFirst({
      orderBy: { periodEnd: 'desc' },
    });
    if (lastClosing) {
      return lastClosing.periodEnd;
    }

    const [earliestSale, earliestDoneWorkOrder, earliestPayment] =
      await Promise.all([
        client.sale.findFirst({
          where: { status: 'completed', isActive: true },
          orderBy: { createdAt: 'asc' },
          select: { createdAt: true },
        }),
        client.workOrder.findFirst({
          where: { status: 'done', isActive: true },
          orderBy: { updatedAt: 'asc' },
          select: { updatedAt: true },
        }),
        client.workOrderPayment.findFirst({
          orderBy: { paidAt: 'asc' },
          select: { paidAt: true },
        }),
      ]);

    const anchors = [
      earliestSale?.createdAt,
      earliestDoneWorkOrder?.updatedAt,
      earliestPayment?.paidAt,
    ]
      .filter((date): date is Date => date !== undefined)
      .sort((a, b) => a.getTime() - b.getTime());
    return anchors[0] ?? null;
  }

  /**
   * SAL-NF4: only completed + active sales enter the totals; cancelled sales
   * never do. Work order payments aggregate by collection date (`paidAt`),
   * not by order status: cash enters the till when it is collected. Methods
   * without rows in the period are zero-filled.
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

    const paidAt: Prisma.DateTimeFilter = { lt: now };
    if (periodStart) {
      paidAt.gte = periodStart;
    }
    const paymentWhere: Prisma.WorkOrderPaymentWhereInput = {
      paidAt,
      workOrder: { isActive: true },
    };

    const [saleGroups, salesCount, paymentGroups, workOrderPaymentsCount] =
      await Promise.all([
        client.sale.groupBy({
          by: ['paymentMethod'],
          where,
          _sum: { totalAmount: true },
        }),
        client.sale.count({ where }),
        client.workOrderPayment.groupBy({
          by: ['paymentMethod'],
          where: paymentWhere,
          _sum: { amount: true },
        }),
        client.workOrderPayment.count({ where: paymentWhere }),
      ]);

    const saleTotals = zeroMethodTotals();
    for (const group of saleGroups) {
      saleTotals[group.paymentMethod] = new Prisma.Decimal(
        group._sum.totalAmount ?? 0
      );
    }

    const paymentTotals = zeroMethodTotals();
    for (const group of paymentGroups) {
      paymentTotals[group.paymentMethod] = new Prisma.Decimal(
        group._sum.amount ?? 0
      );
    }

    return {
      expectedCash: saleTotals[PaymentMethod.cash].plus(
        paymentTotals[PaymentMethod.cash]
      ),
      expectedCard: saleTotals[PaymentMethod.card].plus(
        paymentTotals[PaymentMethod.card]
      ),
      expectedTransfer: saleTotals[PaymentMethod.transfer].plus(
        paymentTotals[PaymentMethod.transfer]
      ),
      salesCount,
      workOrderPaymentsCash: paymentTotals[PaymentMethod.cash],
      workOrderPaymentsCard: paymentTotals[PaymentMethod.card],
      workOrderPaymentsTransfer: paymentTotals[PaymentMethod.transfer],
      workOrderPaymentsCount,
    };
  }

  /**
   * Work orders count as period activity only once done; `updatedAt`
   * approximates completion time. Cancelled or soft-deleted orders never
   * unblock a close.
   */
  private async countDoneWorkOrders(
    client: Client,
    periodStart: Date | null,
    now: Date
  ): Promise<number> {
    const updatedAt: Prisma.DateTimeFilter = { lt: now };
    if (periodStart) {
      updatedAt.gte = periodStart;
    }
    return client.workOrder.count({
      where: { status: 'done', isActive: true, updatedAt },
    });
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
    workOrderPaymentsCash: Prisma.Decimal;
    workOrderPaymentsCard: Prisma.Decimal;
    workOrderPaymentsTransfer: Prisma.Decimal;
    workOrderPaymentsCount: number;
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
        workOrderPaymentsCash: closing.workOrderPaymentsCash.toFixed(2),
        workOrderPaymentsCard: closing.workOrderPaymentsCard.toFixed(2),
        workOrderPaymentsTransfer: closing.workOrderPaymentsTransfer.toFixed(2),
        workOrderPaymentsCount: closing.workOrderPaymentsCount,
        notes: closing.notes,
        createdAt: closing.createdAt,
        closedBy: closing.closedBy,
      },
      { excludeExtraneousValues: true }
    );
  }
}
