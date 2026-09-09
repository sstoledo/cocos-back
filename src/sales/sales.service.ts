import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateSaleDto } from './dto/create-sale.dto';

@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSaleDto) {
    const productLines = dto.productLines ?? [];
    const serviceLines = dto.serviceLines ?? [];

    if (productLines.length === 0 && serviceLines.length === 0) {
      throw new BadRequestException({
        message: 'Sale must include at least one product or service line',
        errorCode: 'SALE_EMPTY_LINES',
      });
    }

    this.ensureNoDuplicateLines(
      productLines.map((l) => l.productId),
      'productId'
    );
    this.ensureNoDuplicateLines(
      serviceLines.map((l) => l.serviceId),
      'serviceId'
    );

    await this.ensureClientExists(dto.clientId);
    await this.ensureBranchExists(dto.branchId);
    await this.ensureEmployeeExists(dto.employeeId);

    const productLineItems = await this.resolveProductLineItems(productLines);
    const serviceLineItems = await this.resolveServiceLineItems(serviceLines);

    const totalAmount = [...productLineItems, ...serviceLineItems].reduce(
      (total, line) => total.add(line.subtotal),
      new Prisma.Decimal(0)
    );

    return this.prisma.$transaction(async (tx) => {
      const saleNumber = await this.generateSaleNumber(tx);

      const shortages: Array<{
        productId: string;
        requested: number;
        available: number;
      }> = [];

      for (const line of productLineItems) {
        const aggregate = await tx.lotItem.aggregate({
          _sum: { remainingQuantity: true },
          where: { productId: line.productId, remainingQuantity: { gt: 0 } },
        });
        const available = aggregate._sum.remainingQuantity ?? 0;

        if (available < line.quantity) {
          shortages.push({
            productId: line.productId,
            requested: line.quantity,
            available,
          });
        }
      }

      if (shortages.length > 0) {
        throw new ConflictException({
          message: 'Insufficient stock to complete the sale',
          errorCode: 'INSUFFICIENT_STOCK',
          details: shortages,
        });
      }

      const sale = await tx.sale.create({
        data: {
          saleNumber,
          clientId: dto.clientId ?? null,
          branchId: dto.branchId ?? null,
          employeeId: dto.employeeId ?? null,
          paymentMethod: dto.paymentMethod,
          totalAmount,
          products: {
            create: productLineItems.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              unitPriceSnapshot: item.unitPriceSnapshot,
              subtotal: item.subtotal,
            })),
          },
          services: {
            create: serviceLineItems.map((item) => ({
              serviceId: item.serviceId,
              quantity: item.quantity,
              unitPriceSnapshot: item.unitPriceSnapshot,
              subtotal: item.subtotal,
            })),
          },
        },
      });

      // NOTE: guarded FIFO walk copied verbatim from
      // WorkOrdersService.consumeStockForOrder (B7.3) — keep in sync;
      // extracting a shared StockService is an explicit deferred follow-up.
      for (const line of productLineItems) {
        const lots = await tx.lotItem.findMany({
          where: { productId: line.productId, remainingQuantity: { gt: 0 } },
          orderBy: { lot: { receivedAt: 'asc' } },
        });

        let needed = line.quantity;

        for (const lot of lots) {
          if (needed === 0) {
            break;
          }

          const allocation = Math.min(lot.remainingQuantity, needed);
          const lotGuard = await tx.lotItem.updateMany({
            where: { id: lot.id, remainingQuantity: { gte: allocation } },
            data: { remainingQuantity: { decrement: allocation } },
          });

          if (lotGuard.count === 0) {
            throw new ConflictException({
              message: 'Insufficient stock to complete the sale',
              errorCode: 'INSUFFICIENT_STOCK',
              details: [
                {
                  productId: line.productId,
                  requested: line.quantity,
                  available: line.quantity - needed,
                },
              ],
            });
          }

          await tx.stockMovement.create({
            data: {
              productId: line.productId,
              lotItemId: lot.id,
              saleId: sale.id,
              type: 'sale',
              quantity: -allocation,
              reason: `Sale ${saleNumber}`,
            },
          });

          needed -= allocation;
        }
      }

      return sale;
    });
  }

  private ensureNoDuplicateLines(ids: string[], field: string): void {
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException({
        message: `Duplicate ${field} entries are not allowed in a sale`,
        errorCode: 'SALE_DUPLICATE_LINE',
      });
    }
  }

  private async ensureClientExists(id?: string): Promise<void> {
    if (id === undefined) {
      return;
    }
    const client = await this.prisma.client.findUnique({
      where: { id, isActive: true },
    });
    if (!client) {
      throw new NotFoundException({
        message: 'Client not found or inactive',
        errorCode: 'CLIENT_NOT_FOUND',
      });
    }
  }

  private async ensureBranchExists(id?: string): Promise<void> {
    if (id === undefined) {
      return;
    }
    const branch = await this.prisma.branch.findUnique({
      where: { id, isActive: true },
    });
    if (!branch) {
      throw new NotFoundException({
        message: 'Branch not found or inactive',
        errorCode: 'BRANCH_NOT_FOUND',
      });
    }
  }

  private async ensureEmployeeExists(id?: string): Promise<void> {
    if (id === undefined) {
      return;
    }
    const employee = await this.prisma.employee.findUnique({
      where: { id, isActive: true },
    });
    if (!employee) {
      throw new NotFoundException({
        message: 'Employee not found or inactive',
        errorCode: 'EMPLOYEE_NOT_FOUND',
      });
    }
  }

  private async resolveProductLineItems(
    lines: NonNullable<CreateSaleDto['productLines']>
  ): Promise<
    Array<{
      productId: string;
      quantity: number;
      unitPriceSnapshot: Prisma.Decimal;
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

      // Client-sent prices are ignored: snapshot from the catalog price.
      const unitPriceSnapshot = new Prisma.Decimal(product.price);
      lineItems.push({
        productId: line.productId,
        quantity: line.quantity,
        unitPriceSnapshot,
        subtotal: unitPriceSnapshot.mul(line.quantity),
      });
    }

    return lineItems;
  }

  private async resolveServiceLineItems(
    lines: NonNullable<CreateSaleDto['serviceLines']>
  ): Promise<
    Array<{
      serviceId: string;
      quantity: number;
      unitPriceSnapshot: Prisma.Decimal;
      subtotal: Prisma.Decimal;
    }>
  > {
    const lineItems = [];

    for (const line of lines) {
      const service = await this.prisma.service.findUnique({
        where: { id: line.serviceId, isActive: true },
      });

      if (!service) {
        throw new NotFoundException({
          message: 'Service not found or inactive',
          errorCode: 'SERVICE_NOT_FOUND',
        });
      }

      const unitPriceSnapshot = new Prisma.Decimal(service.price);
      lineItems.push({
        serviceId: line.serviceId,
        quantity: line.quantity,
        unitPriceSnapshot,
        subtotal: unitPriceSnapshot.mul(line.quantity),
      });
    }

    return lineItems;
  }

  private async generateSaleNumber(
    tx: Prisma.TransactionClient
  ): Promise<string> {
    const currentYear = new Date().getFullYear();

    const sequence = await tx.saleNumberSequence.upsert({
      where: { year: currentYear },
      create: { year: currentYear, lastNumber: 1 },
      update: { lastNumber: { increment: 1 } },
    });

    return `VTA-${currentYear}-${sequence.lastNumber.toString().padStart(6, '0')}`;
  }
}
