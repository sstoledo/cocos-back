import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { ClientsService } from '../clients/clients.service';
import { PrismaService } from '../prisma/prisma.service';
import { VehiclesService } from '../vehicles/vehicles.service';
import type { CreateWorkOrderDto } from './dto/create-work-order.dto';
import type { ListWorkOrdersQueryDto } from './dto/list-work-orders-query.dto';
import type { UpdateWorkOrderDto } from './dto/update-work-order.dto';
import { WorkOrderResponseDto } from './dto/work-order-response.dto';

@Injectable()
export class WorkOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clientsService: ClientsService,
    private readonly vehiclesService: VehiclesService
  ) {}

  async create(dto: CreateWorkOrderDto) {
    await this.validateClientVehiclePair(dto.clientId, dto.vehicleId, true);

    const serviceLineItems = await this.buildServiceLineItems(dto.services);

    const totalAmount = serviceLineItems.reduce(
      (sum, item) => sum + Number(item.subtotal),
      0
    );

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
      },
      include: { services: { include: { service: true } } },
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
        include: { services: { include: { service: true } } },
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
      include: { services: { include: { service: true } } },
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

    if (dto.services && dto.services.length > 0) {
      const serviceLineItems = await this.buildServiceLineItems(dto.services);

      await this.prisma.workOrderService.deleteMany({
        where: { workOrderId: id },
      });

      await this.prisma.workOrderService.createMany({
        data: serviceLineItems.map((item) => ({
          workOrderId: id,
          serviceId: item.serviceId,
          quantity: item.quantity,
          unitPriceSnapshot: item.unitPriceSnapshot,
          subtotal: item.subtotal,
        })),
      });

      const totalAmount = serviceLineItems.reduce(
        (sum, item) => sum + Number(item.subtotal),
        0
      );

      const updated = await this.prisma.workOrder.update({
        where: { id },
        data: {
          ...clientVehicleData,
          ...(dto.description !== undefined && {
            description: dto.description,
          }),
          ...(dto.status !== undefined && { status: dto.status }),
          totalAmount,
        },
        include: { services: { include: { service: true } } },
      });

      return this.toResponse(updated);
    }

    const updated = await this.prisma.workOrder.update({
      where: { id },
      data: {
        ...clientVehicleData,
        ...(dto.description !== undefined && {
          description: dto.description,
        }),
        ...(dto.status !== undefined && { status: dto.status }),
      },
      include: { services: { include: { service: true } } },
    });

    return this.toResponse(updated);
  }

  async remove(id: string) {
    await this.findOne(id);

    const removed = await this.prisma.workOrder.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
      include: { services: { include: { service: true } } },
    });

    return this.toResponse(removed);
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
    services: CreateWorkOrderDto['services']
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

    return plainToInstance(
      WorkOrderResponseDto,
      {
        ...workOrder,
        totalAmount: Number(workOrder.totalAmount).toFixed(2),
        services: services ?? [],
      },
      { excludeExtraneousValues: true }
    );
  }
}
