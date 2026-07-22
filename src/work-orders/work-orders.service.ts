import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, WorkOrderStatus } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { ClientsService } from '../clients/clients.service';
import { PrismaService } from '../prisma/prisma.service';
import { VehiclesService } from '../vehicles/vehicles.service';
import type { CreateWorkOrderDto } from './dto/create-work-order.dto';
import type { ListWorkOrdersQueryDto } from './dto/list-work-orders-query.dto';
import type { UpdateWorkOrderDto } from './dto/update-work-order.dto';
import { WorkOrderResponseDto } from './dto/work-order-response.dto';

const ALLOWED_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  [WorkOrderStatus.pending]: [
    WorkOrderStatus.in_progress,
    WorkOrderStatus.cancelled,
  ],
  [WorkOrderStatus.in_progress]: [
    WorkOrderStatus.done,
    WorkOrderStatus.cancelled,
  ],
  [WorkOrderStatus.done]: [],
  [WorkOrderStatus.cancelled]: [],
};

@Injectable()
export class WorkOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clientsService: ClientsService,
    private readonly vehiclesService: VehiclesService
  ) {}

  async create(dto: CreateWorkOrderDto) {
    const serviceLines = dto.services ?? [];
    const productLines = dto.products ?? [];

    if (serviceLines.length === 0 && productLines.length === 0) {
      throw new BadRequestException({
        message: 'Work order must include at least one service or product line',
        errorCode: 'WORK_ORDER_EMPTY_LINES',
      });
    }

    await this.validateClientVehiclePair(dto.clientId, dto.vehicleId, true);

    const serviceLineItems = await this.buildServiceLineItems(serviceLines);
    const productLineItems = await this.resolveProducts(productLines);

    const totalAmount = this.computeTotal(serviceLineItems, productLineItems);

    const orderNumber = await this.generateOrderNumber();

    const workOrder = await this.prisma.workOrder.create({
      data: {
        orderNumber,
        clientId: dto.clientId,
        vehicleId: dto.vehicleId,
        description: dto.description,
        ...(dto.status !== undefined && { status: dto.status }),
        totalAmount,
        services: {
          create: serviceLineItems.map((item) => ({
            serviceId: item.serviceId,
            quantity: item.quantity,
            unitPriceSnapshot: item.unitPriceSnapshot,
            subtotal: item.subtotal,
          })),
        },
        products: {
          create: productLineItems.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPriceSnapshot: item.unitPriceSnapshot,
            subtotal: item.subtotal,
          })),
        },
      },
      include: {
        services: { include: { service: true } },
        products: { include: { product: true } },
      },
    });

    return this.toResponse(workOrder);
  }

  async findAll(queryDto: ListWorkOrdersQueryDto) {
    const { query, page = 1, limit = 10 } = queryDto;
    const where: Prisma.WorkOrderWhereInput = { isActive: true };

    if (query) {
      where.orderNumber = { contains: query, mode: 'insensitive' };
    }

    const [data, total] = await Promise.all([
      this.prisma.workOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          services: { include: { service: true } },
          products: { include: { product: true } },
        },
      }),
      this.prisma.workOrder.count({ where }),
    ]);

    return {
      data: data.map((wo) => this.toResponse(wo)),
      meta: { page, limit, total },
    };
  }

  async findOne(id: string) {
    const workOrder = await this.prisma.workOrder.findUnique({
      where: { id, isActive: true },
      include: {
        services: { include: { service: true } },
        products: { include: { product: true } },
      },
    });
    if (!workOrder) {
      throw new NotFoundException({
        message: 'Work order not found',
        errorCode: 'WORK_ORDER_NOT_FOUND',
      });
    }
    return this.toResponse(workOrder);
  }

  async update(id: string, dto: UpdateWorkOrderDto) {
    const existing = await this.findOne(id);

    if (dto.clientId !== undefined || dto.vehicleId !== undefined) {
      await this.validateClientVehiclePair(
        dto.clientId ?? existing.clientId,
        dto.vehicleId ?? existing.vehicleId,
        dto.clientId !== undefined
      );
    }

    const clientVehicleData = {
      ...(dto.clientId !== undefined && { clientId: dto.clientId }),
      ...(dto.vehicleId !== undefined && { vehicleId: dto.vehicleId }),
    };

    const scalarData = {
      ...clientVehicleData,
      ...(dto.description !== undefined && {
        description: dto.description,
      }),
    };

    const linesInclude = {
      services: { include: { service: true } },
      products: { include: { product: true } },
    } as const;

    if (dto.services === undefined && dto.products === undefined) {
      const updated = await this.prisma.workOrder.update({
        where: { id },
        data: scalarData,
        include: linesInclude,
      });

      return this.toResponse(updated);
    }

    const serviceLineItems =
      dto.services !== undefined
        ? await this.buildServiceLineItems(dto.services)
        : null;
    const productLineItems =
      dto.products !== undefined
        ? await this.resolveProducts(dto.products)
        : null;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (serviceLineItems) {
        await tx.workOrderService.deleteMany({
          where: { workOrderId: id },
        });

        await tx.workOrderService.createMany({
          data: serviceLineItems.map((item) => ({
            workOrderId: id,
            serviceId: item.serviceId,
            quantity: item.quantity,
            unitPriceSnapshot: item.unitPriceSnapshot,
            subtotal: item.subtotal,
          })),
        });
      }

      if (productLineItems) {
        await tx.workOrderProduct.deleteMany({
          where: { workOrderId: id },
        });

        await tx.workOrderProduct.createMany({
          data: productLineItems.map((item) => ({
            workOrderId: id,
            productId: item.productId,
            quantity: item.quantity,
            unitPriceSnapshot: item.unitPriceSnapshot,
            subtotal: item.subtotal,
          })),
        });
      }

      const serviceLinesForTotal =
        serviceLineItems ??
        (await tx.workOrderService.findMany({ where: { workOrderId: id } }));
      const productLinesForTotal =
        productLineItems ??
        (await tx.workOrderProduct.findMany({ where: { workOrderId: id } }));

      const totalAmount = this.computeTotal(
        serviceLinesForTotal,
        productLinesForTotal
      );

      return tx.workOrder.update({
        where: { id },
        data: { ...scalarData, totalAmount },
        include: linesInclude,
      });
    });

    return this.toResponse(updated);
  }

  async transitionStatus(id: string, to: WorkOrderStatus) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const order = await tx.workOrder.findUnique({
        where: { id, isActive: true },
        include: { products: true },
      });

      if (!order) {
        throw new NotFoundException({
          message: 'Work order not found',
          errorCode: 'WORK_ORDER_NOT_FOUND',
        });
      }

      if (!ALLOWED_TRANSITIONS[order.status].includes(to)) {
        throw new ConflictException({
          message: `Cannot transition work order from '${order.status}' to '${to}'`,
          errorCode: 'INVALID_STATUS_TRANSITION',
        });
      }

      if (to === WorkOrderStatus.done && order.products.length > 0) {
        await this.consumeStockForOrder(tx, order);
      }

      const guard = await tx.workOrder.updateMany({
        where: { id, status: order.status },
        data: { status: to },
      });

      if (guard.count === 0) {
        throw new ConflictException({
          message: `Cannot transition work order from '${order.status}' to '${to}'`,
          errorCode: 'INVALID_STATUS_TRANSITION',
        });
      }

      const refreshed = await tx.workOrder.findUnique({
        where: { id, isActive: true },
        include: {
          services: { include: { service: true } },
          products: { include: { product: true } },
        },
      });

      if (!refreshed) {
        throw new NotFoundException({
          message: 'Work order not found',
          errorCode: 'WORK_ORDER_NOT_FOUND',
        });
      }

      return refreshed;
    });

    return this.toResponse(updated);
  }

  async remove(id: string) {
    await this.findOne(id);

    const removed = await this.prisma.workOrder.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
      include: {
        services: { include: { service: true } },
        products: { include: { product: true } },
      },
    });

    return this.toResponse(removed);
  }

  private async consumeStockForOrder(
    tx: Prisma.TransactionClient,
    order: {
      id: string;
      orderNumber: string;
      products: Array<{ productId: string; quantity: number }>;
    }
  ): Promise<void> {
    const shortages: Array<{
      productId: string;
      requested: number;
      available: number;
    }> = [];

    for (const line of order.products) {
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
        message: 'Insufficient stock to complete the work order',
        errorCode: 'INSUFFICIENT_STOCK',
        details: shortages,
      });
    }

    for (const line of order.products) {
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
            message: 'Insufficient stock to complete the work order',
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
            workOrderId: order.id,
            type: 'service_usage',
            quantity: -allocation,
            reason: `Work order ${order.orderNumber} completion`,
          },
        });

        needed -= allocation;
      }
    }
  }

  private async ensureClientExists(clientId: string): Promise<void> {
    const clientExists = await this.clientsService.exists(clientId);
    if (!clientExists) {
      throw new NotFoundException({
        message: 'Client not found or inactive',
        errorCode: 'CLIENT_NOT_FOUND',
      });
    }
  }

  private async findVehicleOrThrow(vehicleId: string) {
    try {
      return await this.vehiclesService.findOne(vehicleId);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new NotFoundException({
          message: 'Vehicle not found or inactive',
          errorCode: 'VEHICLE_NOT_FOUND',
        });
      }
      throw error;
    }
  }

  private async validateClientVehiclePair(
    clientId: string,
    vehicleId: string,
    checkClient: boolean
  ): Promise<void> {
    if (checkClient) {
      await this.ensureClientExists(clientId);
    }

    const vehicle = await this.findVehicleOrThrow(vehicleId);
    if (vehicle.clientId !== clientId) {
      throw new ConflictException({
        message: 'Vehicle does not belong to the specified client',
        errorCode: 'VEHICLE_CLIENT_MISMATCH',
      });
    }
  }

  private async buildServiceLineItems(
    services: NonNullable<CreateWorkOrderDto['services']>
  ): Promise<
    Array<{
      serviceId: string;
      quantity: number;
      unitPriceSnapshot: Prisma.Decimal;
      subtotal: Prisma.Decimal;
    }>
  > {
    const lineItems = [];

    for (const line of services) {
      const service = await this.prisma.service.findUnique({
        where: { id: line.serviceId, isActive: true },
      });

      if (!service) {
        throw new NotFoundException({
          message: 'Service not found or inactive',
          errorCode: 'SERVICE_NOT_FOUND',
        });
      }

      const unitPriceSnapshot = line.unitPrice ?? Number(service.price);
      const subtotal = unitPriceSnapshot * line.quantity;

      lineItems.push({
        serviceId: line.serviceId,
        quantity: line.quantity,
        unitPriceSnapshot: new Prisma.Decimal(unitPriceSnapshot),
        subtotal: new Prisma.Decimal(subtotal),
      });
    }

    return lineItems;
  }

  private async resolveProducts(
    products: NonNullable<CreateWorkOrderDto['products']>
  ): Promise<
    Array<{
      productId: string;
      quantity: number;
      unitPriceSnapshot: Prisma.Decimal;
      subtotal: Prisma.Decimal;
    }>
  > {
    const lineItems = [];

    for (const line of products) {
      const product = await this.prisma.product.findUnique({
        where: { id: line.productId, isActive: true },
      });

      if (!product) {
        throw new NotFoundException({
          message: 'Product not found or inactive',
          errorCode: 'PRODUCT_NOT_FOUND',
        });
      }

      const unitPriceSnapshot = line.unitPrice ?? Number(product.price);
      const subtotal = unitPriceSnapshot * line.quantity;

      lineItems.push({
        productId: line.productId,
        quantity: line.quantity,
        unitPriceSnapshot: new Prisma.Decimal(unitPriceSnapshot),
        subtotal: new Prisma.Decimal(subtotal),
      });
    }

    return lineItems;
  }

  private computeTotal(
    serviceLines: Array<{ subtotal: Prisma.Decimal }>,
    productLines: Array<{ subtotal: Prisma.Decimal }>
  ): Prisma.Decimal {
    const sum = [...serviceLines, ...productLines].reduce(
      (total, line) => total + Number(line.subtotal),
      0
    );

    return new Prisma.Decimal(sum);
  }

  private async generateOrderNumber(): Promise<string> {
    const currentYear = new Date().getFullYear();

    while (true) {
      const sequence = await this.prisma.workOrderNumberSequence.upsert({
        where: { year: currentYear },
        create: { year: currentYear, lastNumber: 1 },
        update: { lastNumber: { increment: 1 } },
      });

      const padded = sequence.lastNumber.toString().padStart(6, '0');
      const orderNumber = `OC-${currentYear}-${padded}`;

      const existing = await this.prisma.workOrder.findUnique({
        where: { orderNumber },
      });

      if (!existing) {
        return orderNumber;
      }
    }
  }

  private toResponse(workOrder: {
    id: string;
    orderNumber: string;
    clientId: string;
    vehicleId: string;
    description: string | null;
    status: string;
    totalAmount: Prisma.Decimal;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
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
        estimatedDuration: number | null;
      };
    }>;
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
  }): WorkOrderResponseDto {
    const services = workOrder.services?.map((s) => ({
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
        estimatedDuration: s.service.estimatedDuration,
      },
    }));

    const products = workOrder.products?.map((p) => ({
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

    return plainToInstance(
      WorkOrderResponseDto,
      {
        ...workOrder,
        totalAmount: Number(workOrder.totalAmount).toFixed(2),
        services: services ?? [],
        products: products ?? [],
      },
      { excludeExtraneousValues: true }
    );
  }
}
