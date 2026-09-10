import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateSaleDto } from './dto/create-sale.dto';
import type { ListSalesQueryDto } from './dto/list-sales-query.dto';
import { SaleResponseDto } from './dto/sale-response.dto';

const SALE_INCLUDE = {
  client: { select: { id: true, name: true } },
  branch: { select: { id: true, name: true } },
  employee: { select: { id: true, name: true } },
  products: { include: { product: true } },
  services: { include: { service: true } },
} as const;

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
        include: SALE_INCLUDE,
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

      return this.toResponse(sale);
    });
  }

  async cancelSale(id: string) {
    return this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({
        where: { id, isActive: true },
        include: { stockMovements: true },
      });

      if (!sale) {
        throw new NotFoundException({
          message: 'Sale not found',
          errorCode: 'SALE_NOT_FOUND',
        });
      }

      if (sale.status !== 'completed') {
        throw new ConflictException({
          message: 'Sale is already cancelled',
          errorCode: 'SALE_ALREADY_CANCELLED',
        });
      }

      // Guarded flip-first: a concurrent cancel loses here (count === 0)
      // and rolls back before any stock restoration runs.
      const guard = await tx.sale.updateMany({
        where: { id, status: 'completed' },
        data: { status: 'cancelled' },
      });

      if (guard.count === 0) {
        throw new ConflictException({
          message: 'Sale is already cancelled',
          errorCode: 'SALE_ALREADY_CANCELLED',
        });
      }

      for (const movement of sale.stockMovements) {
        if (movement.type !== 'sale') {
          continue;
        }

        await tx.lotItem.update({
          where: { id: movement.lotItemId ?? '' },
          data: { remainingQuantity: { increment: -movement.quantity } },
        });

        await tx.stockMovement.create({
          data: {
            productId: movement.productId,
            lotItemId: movement.lotItemId,
            saleId: id,
            type: 'cancel',
            quantity: -movement.quantity,
            reason: `Cancel ${sale.saleNumber}`,
          },
        });
      }

      const refreshed = await tx.sale.findUnique({
        where: { id, isActive: true },
        include: SALE_INCLUDE,
      });

      if (!refreshed) {
        throw new NotFoundException({
          message: 'Sale not found',
          errorCode: 'SALE_NOT_FOUND',
        });
      }

      return this.toResponse(refreshed);
    });
  }

  async findAll(queryDto: ListSalesQueryDto) {
    const {
      page = 1,
      limit = 10,
      from,
      to,
      clientId,
      status,
      saleNumber,
    } = queryDto;
    const where: Prisma.SaleWhereInput = { isActive: true };

    if (from !== undefined || to !== undefined) {
      where.createdAt = {};
      if (from !== undefined) {
        where.createdAt.gte = new Date(from);
      }
      if (to !== undefined) {
        where.createdAt.lte = new Date(to);
      }
    }
    if (clientId !== undefined) {
      where.clientId = clientId;
    }
    if (status !== undefined) {
      where.status = status;
    }
    if (saleNumber !== undefined) {
      where.saleNumber = { contains: saleNumber, mode: 'insensitive' };
    }

    const [data, total] = await Promise.all([
      this.prisma.sale.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: SALE_INCLUDE,
      }),
      this.prisma.sale.count({ where }),
    ]);

    return {
      data: data.map((sale) => this.toResponse(sale)),
      meta: { page, limit, total },
    };
  }

  async findOne(id: string) {
    const sale = await this.prisma.sale.findUnique({
      where: { id, isActive: true },
      include: SALE_INCLUDE,
    });
    if (!sale) {
      throw new NotFoundException({
        message: 'Sale not found',
        errorCode: 'SALE_NOT_FOUND',
      });
    }
    return this.toResponse(sale);
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

  private toResponse(sale: {
    id: string;
    saleNumber: string;
    clientId: string | null;
    branchId: string | null;
    employeeId: string | null;
    status: string;
    paymentMethod: string;
    totalAmount: Prisma.Decimal;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
    client?: { id: string; name: string } | null;
    branch?: { id: string; name: string } | null;
    employee?: { id: string; name: string } | null;
    products?: Array<{
      id: string;
      productId: string;
      quantity: number;
      unitPriceSnapshot: Prisma.Decimal;
      subtotal: Prisma.Decimal;
      createdAt: Date;
      updatedAt: Date;
      product: {
        id: string;
        code: string;
        name: string;
        description: string | null;
        price: Prisma.Decimal;
      };
    }>;
    services?: Array<{
      id: string;
      serviceId: string;
      quantity: number;
      unitPriceSnapshot: Prisma.Decimal;
      subtotal: Prisma.Decimal;
      createdAt: Date;
      updatedAt: Date;
      service: {
        id: string;
        code: string;
        name: string;
        description: string | null;
        price: Prisma.Decimal;
      };
    }>;
  }): SaleResponseDto {
    const products = sale.products?.map((p) => ({
      id: p.id,
      productId: p.productId,
      quantity: p.quantity,
      unitPriceSnapshot: Number(p.unitPriceSnapshot).toFixed(2),
      subtotal: Number(p.subtotal).toFixed(2),
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      product: {
        id: p.product.id,
        code: p.product.code,
        name: p.product.name,
        description: p.product.description,
        price: Number(p.product.price).toFixed(2),
      },
    }));

    const services = sale.services?.map((s) => ({
      id: s.id,
      serviceId: s.serviceId,
      quantity: s.quantity,
      unitPriceSnapshot: Number(s.unitPriceSnapshot).toFixed(2),
      subtotal: Number(s.subtotal).toFixed(2),
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      service: {
        id: s.service.id,
        code: s.service.code,
        name: s.service.name,
        description: s.service.description,
        price: Number(s.service.price).toFixed(2),
      },
    }));

    return plainToInstance(
      SaleResponseDto,
      {
        ...sale,
        totalAmount: Number(sale.totalAmount).toFixed(2),
        client: sale.client
          ? { id: sale.client.id, name: sale.client.name }
          : null,
        branch: sale.branch
          ? { id: sale.branch.id, name: sale.branch.name }
          : null,
        employee: sale.employee
          ? { id: sale.employee.id, name: sale.employee.name }
          : null,
        products: products ?? [],
        services: services ?? [],
      },
      { excludeExtraneousValues: true }
    );
  }
}
