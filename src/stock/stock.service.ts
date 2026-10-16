import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { StockMovementType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateStockMovementDto } from './dto/create-stock-movement.dto';

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
}
