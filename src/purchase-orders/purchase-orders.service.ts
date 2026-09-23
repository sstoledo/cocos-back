import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { PrismaService } from '../prisma/prisma.service';
import type { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import type { ListPurchaseOrdersQueryDto } from './dto/list-purchase-orders-query.dto';
import { PurchaseOrderResponseDto } from './dto/purchase-order-response.dto';
import type { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto';

const PO_INCLUDE = {
  supplier: { select: { id: true, name: true } },
  lines: {
    include: { product: { select: { id: true, code: true, name: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
} as const;

@Injectable()
export class PurchaseOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePurchaseOrderDto) {
    const lines = dto.lines ?? [];

    if (lines.length === 0) {
      throw new BadRequestException({
        message: 'Purchase order must include at least one line',
        errorCode: 'PO_EMPTY_LINES',
      });
    }

    this.ensureNoDuplicateLines(lines.map((l) => l.productId));

    await this.ensureSupplierExists(dto.supplierId);
    const lineItems = await this.resolveLineItems(lines);

    const estimatedTotal = lineItems.reduce(
      (total, line) => total.add(line.subtotal),
      new Prisma.Decimal(0)
    );

    return this.prisma.$transaction(async (tx) => {
      const purchaseOrderNumber = await this.generatePurchaseOrderNumber(tx);

      const purchaseOrder = await tx.purchaseOrder.create({
        data: {
          purchaseOrderNumber,
          supplierId: dto.supplierId,
          notes: dto.notes ?? null,
          estimatedTotal,
          lines: {
            create: lineItems.map((line) => ({
              productId: line.productId,
              quantityOrdered: line.quantityOrdered,
              estimatedCostPrice: line.estimatedCostPrice,
            })),
          },
        },
        include: PO_INCLUDE,
      });

      return this.toResponse(purchaseOrder);
    });
  }

  async findAll(queryDto: ListPurchaseOrdersQueryDto) {
    const {
      page = 1,
      limit = 10,
      status,
      supplierId,
      purchaseOrderNumber,
    } = queryDto;
    const where: Prisma.PurchaseOrderWhereInput = { isActive: true };

    if (status !== undefined) {
      where.status = status;
    }
    if (supplierId !== undefined) {
      where.supplierId = supplierId;
    }
    if (purchaseOrderNumber !== undefined) {
      where.purchaseOrderNumber = {
        contains: purchaseOrderNumber,
        mode: 'insensitive',
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: PO_INCLUDE,
      }),
      this.prisma.purchaseOrder.count({ where }),
    ]);

    return {
      data: data.map((po) => this.toResponse(po)),
      meta: { page, limit, total },
    };
  }

  async findOne(id: string) {
    const [purchaseOrder, lots] = await Promise.all([
      this.prisma.purchaseOrder.findUnique({
        where: { id, isActive: true },
        include: PO_INCLUDE,
      }),
      this.prisma.lot.findMany({
        where: { purchaseOrderId: id },
        include: { items: true },
        orderBy: { receivedAt: 'asc' },
      }),
    ]);

    if (!purchaseOrder) {
      throw new NotFoundException({
        message: 'Purchase order not found',
        errorCode: 'PURCHASE_ORDER_NOT_FOUND',
      });
    }

    return this.toResponse(purchaseOrder, lots);
  }

  async updateDraft(id: string, dto: UpdatePurchaseOrderDto) {
    const lines = dto.lines ?? [];

    if (lines.length === 0) {
      throw new BadRequestException({
        message: 'Purchase order must include at least one line',
        errorCode: 'PO_EMPTY_LINES',
      });
    }

    this.ensureNoDuplicateLines(lines.map((l) => l.productId));
    const lineItems = await this.resolveLineItems(lines);

    const estimatedTotal = lineItems.reduce(
      (total, line) => total.add(line.subtotal),
      new Prisma.Decimal(0)
    );

    return this.prisma.$transaction(async (tx) => {
      const purchaseOrder = await tx.purchaseOrder.findUnique({
        where: { id, isActive: true },
      });

      if (!purchaseOrder) {
        throw new NotFoundException({
          message: 'Purchase order not found',
          errorCode: 'PURCHASE_ORDER_NOT_FOUND',
        });
      }

      // Guarded flip-first: the draft predicate makes the check atomic under
      // READ COMMITTED; a concurrent order/cancel loses here (count === 0)
      // and rolls back before any line replacement runs. Draft implies
      // quantityReceived === 0 on every line, so full replacement is lossless.
      const guard = await tx.purchaseOrder.updateMany({
        where: { id, isActive: true, status: 'draft' },
        data: { estimatedTotal },
      });

      if (guard.count === 0) {
        throw new ConflictException({
          message: 'Only draft purchase orders can be updated',
          errorCode: 'PO_NOT_DRAFT',
        });
      }

      await tx.purchaseOrderLine.deleteMany({
        where: { purchaseOrderId: id },
      });
      await tx.purchaseOrderLine.createMany({
        data: lineItems.map((line) => ({
          purchaseOrderId: id,
          productId: line.productId,
          quantityOrdered: line.quantityOrdered,
          estimatedCostPrice: line.estimatedCostPrice,
        })),
      });

      const refreshed = await tx.purchaseOrder.findUnique({
        where: { id, isActive: true },
        include: PO_INCLUDE,
      });

      if (!refreshed) {
        throw new NotFoundException({
          message: 'Purchase order not found',
          errorCode: 'PURCHASE_ORDER_NOT_FOUND',
        });
      }

      return this.toResponse(refreshed);
    });
  }

  async order(id: string) {
    return this.prisma.$transaction(async (tx) => {
      const purchaseOrder = await tx.purchaseOrder.findUnique({
        where: { id, isActive: true },
      });

      if (!purchaseOrder) {
        throw new NotFoundException({
          message: 'Purchase order not found',
          errorCode: 'PURCHASE_ORDER_NOT_FOUND',
        });
      }

      // Guarded flip-first: a concurrent order loses here (count === 0).
      const guard = await tx.purchaseOrder.updateMany({
        where: { id, status: 'draft' },
        data: { status: 'ordered' },
      });

      if (guard.count === 0) {
        throw new ConflictException({
          message: 'Purchase order is not in draft status',
          errorCode: 'PO_ALREADY_ORDERED',
        });
      }

      const refreshed = await tx.purchaseOrder.findUnique({
        where: { id, isActive: true },
        include: PO_INCLUDE,
      });

      if (!refreshed) {
        throw new NotFoundException({
          message: 'Purchase order not found',
          errorCode: 'PURCHASE_ORDER_NOT_FOUND',
        });
      }

      return this.toResponse(refreshed);
    });
  }

  async cancel(id: string) {
    return this.prisma.$transaction(async (tx) => {
      const purchaseOrder = await tx.purchaseOrder.findUnique({
        where: { id, isActive: true },
      });

      if (!purchaseOrder) {
        throw new NotFoundException({
          message: 'Purchase order not found',
          errorCode: 'PURCHASE_ORDER_NOT_FOUND',
        });
      }

      // Guarded flip-first: only draft/ordered can cancel; nothing received
      // yet, so this performs zero stock writes. Loser of a concurrent flip
      // gets count === 0.
      const guard = await tx.purchaseOrder.updateMany({
        where: { id, status: { in: ['draft', 'ordered'] } },
        data: { status: 'cancelled' },
      });

      if (guard.count === 0) {
        throw new ConflictException({
          message:
            'Purchase order cannot be cancelled once receiving has started',
          errorCode: 'PO_CANNOT_CANCEL',
        });
      }

      const refreshed = await tx.purchaseOrder.findUnique({
        where: { id, isActive: true },
        include: PO_INCLUDE,
      });

      if (!refreshed) {
        throw new NotFoundException({
          message: 'Purchase order not found',
          errorCode: 'PURCHASE_ORDER_NOT_FOUND',
        });
      }

      return this.toResponse(refreshed);
    });
  }

  private ensureNoDuplicateLines(ids: string[]): void {
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException({
        message: 'Duplicate productId entries are not allowed',
        errorCode: 'PO_DUPLICATE_LINE',
      });
    }
  }

  private async ensureSupplierExists(id: string): Promise<void> {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id, isActive: true },
    });
    if (!supplier) {
      throw new NotFoundException({
        message: 'Supplier not found or inactive',
        errorCode: 'SUPPLIER_NOT_FOUND',
      });
    }
  }

  private async resolveLineItems(
    lines: CreatePurchaseOrderDto['lines']
  ): Promise<
    Array<{
      productId: string;
      quantityOrdered: number;
      estimatedCostPrice: Prisma.Decimal;
      subtotal: Prisma.Decimal;
    }>
  > {
    const lineItems = [];

    for (const line of lines) {
      const product = await this.prisma.product.findUnique({
        where: { id: line.productId, isActive: true },
      });

      if (!product) {
        throw new NotFoundException({
          message: 'Product not found or inactive',
          errorCode: 'PRODUCT_NOT_FOUND',
        });
      }

      const estimatedCostPrice = new Prisma.Decimal(line.estimatedCostPrice);
      lineItems.push({
        productId: line.productId,
        quantityOrdered: line.quantityOrdered,
        estimatedCostPrice,
        subtotal: estimatedCostPrice.mul(line.quantityOrdered),
      });
    }

    return lineItems;
  }

  private async generatePurchaseOrderNumber(
    tx: Prisma.TransactionClient
  ): Promise<string> {
    const currentYear = new Date().getFullYear();

    const sequence = await tx.purchaseOrderNumberSequence.upsert({
      where: { year: currentYear },
      create: { year: currentYear, lastNumber: 1 },
      update: { lastNumber: { increment: 1 } },
    });

    return `COM-${currentYear}-${sequence.lastNumber.toString().padStart(6, '0')}`;
  }

  private toResponse(
    purchaseOrder: {
      id: string;
      purchaseOrderNumber: string;
      supplierId: string;
      status: string;
      notes: string | null;
      estimatedTotal: Prisma.Decimal;
      createdAt: Date;
      updatedAt: Date;
      supplier?: { id: string; name: string };
      lines?: Array<{
        id: string;
        productId: string;
        quantityOrdered: number;
        quantityReceived: number;
        estimatedCostPrice: Prisma.Decimal;
        product: { id: string; code: string; name: string };
      }>;
    },
    lots?: Array<{
      id: string;
      lotNumber: string;
      receivedAt: Date;
      items: Array<{
        productId: string;
        quantity: number;
        costPrice: Prisma.Decimal;
        expirationDate: Date;
      }>;
    }>
  ): PurchaseOrderResponseDto {
    const receipts = lots?.map((lot) => ({
      lotId: lot.id,
      lotNumber: lot.lotNumber,
      receivedAt: lot.receivedAt,
      items: lot.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        costPrice: Number(item.costPrice).toFixed(2),
        expirationDate: item.expirationDate,
      })),
    }));

    return plainToInstance(
      PurchaseOrderResponseDto,
      {
        ...purchaseOrder,
        estimatedTotal: Number(purchaseOrder.estimatedTotal).toFixed(2),
        lines: (purchaseOrder.lines ?? []).map((line) => ({
          ...line,
          estimatedCostPrice: Number(line.estimatedCostPrice).toFixed(2),
        })),
        receipts,
      },
      { excludeExtraneousValues: true }
    );
  }
}
