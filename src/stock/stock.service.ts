import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StockMovementType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateStockMovementDto } from './dto/create-stock-movement.dto';

export interface ConsumeMovementMeta {
  movementType: StockMovementType;
  reason: string;
  saleId?: string;
  workOrderId?: string;
}

@Injectable()
export class StockService {
  constructor(private readonly prisma: PrismaService) {}

  async getOpenContainers(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId, isActive: true },
    });

    if (!product) {
      throw new NotFoundException({
        message: 'Product not found or inactive',
        errorCode: 'PRODUCT_NOT_FOUND',
      });
    }

    // Containers have no individual identity: the balance is global per
    // product (opened events minus depleted events across all work orders).
    const [openedCount, depletedCount, lastOpened] = await Promise.all([
      this.prisma.workOrderConsumptionEvent.count({
        where: { productId, type: 'opened' },
      }),
      this.prisma.workOrderConsumptionEvent.count({
        where: { productId, type: 'depleted' },
      }),
      this.prisma.workOrderConsumptionEvent.findFirst({
        where: { productId, type: 'opened' },
        orderBy: { createdAt: 'desc' },
        include: { workOrder: true, registeredBy: true },
      }),
    ]);

    return {
      productId,
      openContainers: openedCount - depletedCount,
      lastOpened: lastOpened
        ? {
            workOrderId: lastOpened.workOrderId,
            workOrderNumber: lastOpened.workOrder.orderNumber,
            registeredBy: {
              id: lastOpened.registeredBy.id,
              name: lastOpened.registeredBy.name,
            },
            createdAt: lastOpened.createdAt,
          }
        : null,
    };
  }

  async getStockByProduct(productId: string) {
    const result = await this.prisma.lotItem.aggregate({
      _sum: { remainingQuantity: true },
      where: { productId },
    });

    return { productId, stock: result._sum.remainingQuantity ?? 0 };
  }

  async getMovementsByProduct(productId: string) {
    return this.prisma.stockMovement.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
      include: { lotItem: { include: { lot: true } } },
    });
  }

  async adjustStock(dto: CreateStockMovementDto) {
    if (dto.type !== StockMovementType.adjustment) {
      throw new BadRequestException(
        'Only adjustment stock movements are allowed'
      );
    }

    if (dto.quantity === 0) {
      throw new BadRequestException('Quantity cannot be zero');
    }

    return this.prisma.$transaction(async (tx) => {
      const lotItems = await tx.lotItem.findMany({
        where: { productId: dto.productId },
        orderBy: { lot: { receivedAt: 'desc' } },
        include: { lot: true },
      });

      if (lotItems.length === 0) {
        throw new BadRequestException('No lot items found for this product');
      }

      const targetWithStock = lotItems.find(
        (item) => item.remainingQuantity > 0
      );

      if (dto.quantity > 0) {
        const target = targetWithStock ?? lotItems[0];

        await tx.lotItem.update({
          where: { id: target.id },
          data: { remainingQuantity: { increment: dto.quantity } },
        });

        return tx.stockMovement.create({
          data: {
            productId: dto.productId,
            lotItemId: target.id,
            type: StockMovementType.adjustment,
            quantity: dto.quantity,
            reason: dto.reason,
          },
        });
      }

      if (!targetWithStock) {
        throw new BadRequestException('No available stock for this product');
      }

      if (targetWithStock.remainingQuantity < -dto.quantity) {
        throw new BadRequestException('Insufficient stock for adjustment');
      }

      await tx.lotItem.update({
        where: { id: targetWithStock.id },
        data: { remainingQuantity: { increment: dto.quantity } },
      });

      return tx.stockMovement.create({
        data: {
          productId: dto.productId,
          lotItemId: targetWithStock.id,
          type: StockMovementType.adjustment,
          quantity: dto.quantity,
          reason: dto.reason,
        },
      });
    });
  }

  /**
   * Units available for consumption for a product: the sum of remaining
   * quantity across lots with stock left. Must be called inside the same
   * transaction as the consumption it gates.
   */
  async availableStock(
    tx: Prisma.TransactionClient,
    productId: string
  ): Promise<number> {
    const aggregate = await tx.lotItem.aggregate({
      _sum: { remainingQuantity: true },
      where: { productId, remainingQuantity: { gt: 0 } },
    });
    return aggregate._sum.remainingQuantity ?? 0;
  }

  /**
   * Guarded FIFO walk within an existing transaction: consumes the given
   * quantity for a product from the lots with remaining stock, oldest
   * received first, and records one negative stock movement per touched
   * lot. The per-row guarded decrement makes it safe under concurrent
   * transactions: a lost race surfaces as INSUFFICIENT_STOCK.
   */
  async consumeFifo(
    tx: Prisma.TransactionClient,
    productId: string,
    quantity: number,
    movement: ConsumeMovementMeta,
    message: string
  ): Promise<Prisma.TransactionClient> {
    const stockMovementData = {
      productId,
      saleId: movement.saleId,
      workOrderId: movement.workOrderId,
      type: movement.movementType,
      reason: movement.reason,
    };

    const aggregate = await tx.lotItem.aggregate({
      _sum: { remainingQuantity: true },
      where: { productId, remainingQuantity: { gt: 0 } },
    });
    const available = aggregate._sum.remainingQuantity ?? 0;

    if (available < quantity) {
      throw new ConflictException({
        message,
        errorCode: 'INSUFFICIENT_STOCK',
        details: [{ productId, requested: quantity, available }],
      });
    }

    const lots = await tx.lotItem.findMany({
      where: { productId, remainingQuantity: { gt: 0 } },
      orderBy: { lot: { receivedAt: 'asc' } },
    });

    let consumed = 0;

    for (const lot of lots) {
      if (consumed === quantity) {
        break;
      }

      const allocation = Math.min(lot.remainingQuantity, quantity - consumed);

      const lotGuard = await tx.lotItem.updateMany({
        where: { id: lot.id, remainingQuantity: { gte: allocation } },
        data: { remainingQuantity: { decrement: allocation } },
      });

      if (lotGuard.count === 0) {
        throw new ConflictException({
          message,
          errorCode: 'INSUFFICIENT_STOCK',
          details: [
            {
              productId,
              requested: quantity,
              available: consumed,
            },
          ],
        });
      }

      await tx.stockMovement.create({
        data: {
          ...stockMovementData,
          lotItemId: lot.id,
          quantity: -allocation,
        },
      });

      consumed += allocation;
    }

    return tx;
  }
}
