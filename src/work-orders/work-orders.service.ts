import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RoleName, WorkOrderStatus } from '@prisma/client';
import type { Role, User } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { ClientsService } from '../clients/clients.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { StockService } from '../stock/stock.service';
import { VehiclesService } from '../vehicles/vehicles.service';
import { ConsumptionEventResponseDto } from './dto/consumption-event-response.dto';
import type { CreateConsumptionEventDto } from './dto/create-consumption-event.dto';
import type { CreateWorkOrderPaymentDto } from './dto/create-work-order-payment.dto';
import type { CreateWorkOrderDto } from './dto/create-work-order.dto';
import type { ListWorkOrdersQueryDto } from './dto/list-work-orders-query.dto';
import type { UpdateWorkOrderDto } from './dto/update-work-order.dto';
import { WorkOrderPaymentResponseDto } from './dto/work-order-payment-response.dto';
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

const ASSIGNMENT_INCLUDE = { employee: true, branch: true } as const;

const WORK_ORDER_INCLUDE = {
  client: true,
  vehicle: true,
  services: { include: { service: true } },
  payments: { orderBy: { paidAt: 'asc' as const } },
  ...ASSIGNMENT_INCLUDE,
} as const;

@Injectable()
export class WorkOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clientsService: ClientsService,
    private readonly vehiclesService: VehiclesService,
    private readonly notificationsService: NotificationsService,
    private readonly stockService: StockService
  ) {}

  async create(dto: CreateWorkOrderDto) {
    const serviceLines = dto.services ?? [];

    if (serviceLines.length === 0) {
      throw new BadRequestException({
        message: 'Work order must include at least one service line',
        errorCode: 'WORK_ORDER_EMPTY_LINES',
      });
    }

    await this.validateClientVehiclePair(dto.clientId, dto.vehicleId, true);
    if (dto.employeeId !== undefined && dto.employeeId !== null) {
      await this.ensureEmployeeExists(dto.employeeId);
    }
    if (dto.branchId !== undefined && dto.branchId !== null) {
      await this.ensureBranchExists(dto.branchId);
    }

    const serviceLineItems = await this.buildServiceLineItems(serviceLines);

    const totalAmount = this.computeTotal(serviceLineItems);

    const orderNumber = await this.generateOrderNumber();

    const workOrder = await this.prisma.workOrder.create({
      data: {
        orderNumber,
        clientId: dto.clientId,
        vehicleId: dto.vehicleId,
        description: dto.description,
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.employeeId !== undefined && { employeeId: dto.employeeId }),
        ...(dto.branchId !== undefined && { branchId: dto.branchId }),
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
      include: WORK_ORDER_INCLUDE,
    });

    return this.toResponse(workOrder);
  }

  async findAll(
    queryDto: ListWorkOrdersQueryDto,
    user?: User & { role: Role }
  ) {
    const { query, page = 1, limit = 10 } = queryDto;
    const where: Prisma.WorkOrderWhereInput = { isActive: true };

    if (query) {
      where.orderNumber = { contains: query, mode: 'insensitive' };
    }

    if (user?.role.name === RoleName.Mechanic) {
      const employeeId = await this.findMechanicEmployeeId(user.id);
      if (!employeeId) {
        return { data: [], meta: { page, limit, total: 0 } };
      }
      where.employeeId = employeeId;
    }

    const [data, total] = await Promise.all([
      this.prisma.workOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: WORK_ORDER_INCLUDE,
      }),
      this.prisma.workOrder.count({ where }),
    ]);

    return {
      data: data.map((wo) => this.toResponse(wo)),
      meta: { page, limit, total },
    };
  }

  async findOne(id: string, user?: User & { role: Role }) {
    const where: Prisma.WorkOrderWhereUniqueInput = { id, isActive: true };

    if (user?.role.name === RoleName.Mechanic) {
      const employeeId = await this.findMechanicEmployeeId(user.id);
      if (!employeeId) {
        throw this.workOrderNotFound();
      }
      where.employeeId = employeeId;
    }

    const workOrder = await this.prisma.workOrder.findUnique({
      where,
      include: WORK_ORDER_INCLUDE,
    });
    if (!workOrder) {
      throw this.workOrderNotFound();
    }
    return this.toResponse(workOrder);
  }

  private workOrderNotFound(): NotFoundException {
    return new NotFoundException({
      message: 'Work order not found',
      errorCode: 'WORK_ORDER_NOT_FOUND',
    });
  }

  private async findMechanicEmployeeId(userId: string): Promise<string | null> {
    const employee = await this.prisma.employee.findUnique({
      where: { userId, isActive: true },
    });
    return employee?.id ?? null;
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

    if (dto.employeeId !== undefined && dto.employeeId !== null) {
      await this.ensureEmployeeExists(dto.employeeId);
    }
    if (dto.branchId !== undefined && dto.branchId !== null) {
      await this.ensureBranchExists(dto.branchId);
    }

    const clientVehicleData = {
      ...(dto.clientId !== undefined && { clientId: dto.clientId }),
      ...(dto.vehicleId !== undefined && { vehicleId: dto.vehicleId }),
    };

    const scalarData = {
      ...clientVehicleData,
      ...(dto.employeeId !== undefined && { employeeId: dto.employeeId }),
      ...(dto.branchId !== undefined && { branchId: dto.branchId }),
      ...(dto.description !== undefined && {
        description: dto.description,
      }),
    };

    const linesInclude = WORK_ORDER_INCLUDE;

    if (dto.services === undefined) {
      const updated = await this.prisma.workOrder.update({
        where: { id },
        data: scalarData,
        include: linesInclude,
      });

      return this.toResponse(updated);
    }

    const serviceLineItems = await this.buildServiceLineItems(dto.services);

    const updated = await this.prisma.$transaction(async (tx) => {
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

      const totalAmount = this.computeTotal(serviceLineItems);

      return tx.workOrder.update({
        where: { id },
        data: { ...scalarData, totalAmount },
        include: linesInclude,
      });
    });

    return this.toResponse(updated);
  }

  async transitionStatus(
    id: string,
    to: WorkOrderStatus,
    user?: User & { role: Role }
  ) {
    let mechanicEmployeeId: string | null = null;
    if (user?.role.name === RoleName.Mechanic) {
      mechanicEmployeeId = await this.findMechanicEmployeeId(user.id);
      if (!mechanicEmployeeId) {
        throw this.workOrderNotFound();
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const order = await tx.workOrder.findUnique({
        where: {
          id,
          isActive: true,
          ...(mechanicEmployeeId !== null && {
            employeeId: mechanicEmployeeId,
          }),
        },
      });

      if (!order) {
        throw this.workOrderNotFound();
      }

      if (!ALLOWED_TRANSITIONS[order.status].includes(to)) {
        throw new ConflictException({
          message: `Cannot transition work order from '${order.status}' to '${to}'`,
          errorCode: 'INVALID_STATUS_TRANSITION',
        });
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
        include: WORK_ORDER_INCLUDE,
      });

      if (!refreshed) {
        throw new NotFoundException({
          message: 'Work order not found',
          errorCode: 'WORK_ORDER_NOT_FOUND',
        });
      }

      // B11.3: the ready notification is generated inside this transaction —
      // a generation failure rolls back the transition (atomic consistency).
      if (to === WorkOrderStatus.done) {
        await this.notificationsService.createForRole(
          tx,
          [RoleName.Admin, RoleName.Reception],
          {
            type: 'work_order_ready',
            title: `Orden de trabajo ${refreshed.orderNumber} lista`,
            body: this.readyNotificationBody(refreshed),
            link: `/work-orders/${refreshed.id}`,
          }
        );
      }

      return refreshed;
    });

    return this.toResponse(updated);
  }

  /**
   * Registers a partial (or full) payment against a work order. Payments are
   * append-only: there is no edit/delete, corrections happen via new entries
   * or order cancellation. The overpayment guard re-reads the paid sum inside
   * the transaction so concurrent payments cannot exceed the balance.
   */
  async addPayment(id: string, dto: CreateWorkOrderPaymentDto) {
    const payment = await this.prisma.$transaction(async (tx) => {
      const workOrder = await tx.workOrder.findUnique({
        where: { id, isActive: true },
        include: { payments: true },
      });

      if (!workOrder) {
        throw this.workOrderNotFound();
      }

      if (workOrder.status === WorkOrderStatus.cancelled) {
        throw new ConflictException({
          message: 'Cannot register payments on a cancelled work order',
          errorCode: 'WORK_ORDER_CANCELLED',
        });
      }

      const amount = new Prisma.Decimal(dto.amount);
      const paidAmount = workOrder.payments.reduce(
        (total, payment) => total.plus(payment.amount),
        new Prisma.Decimal(0)
      );
      const remaining = new Prisma.Decimal(workOrder.totalAmount).minus(
        paidAmount
      );

      if (amount.greaterThan(remaining)) {
        throw new BadRequestException({
          message: `Payment amount exceeds the remaining balance (${remaining.toFixed(2)})`,
          errorCode: 'WORK_ORDER_OVERPAYMENT',
        });
      }

      return tx.workOrderPayment.create({
        data: {
          workOrderId: id,
          amount,
          paymentMethod: dto.paymentMethod,
          note: dto.note ?? null,
        },
      });
    });

    return this.toPaymentResponse(payment);
  }

  async listPayments(id: string, user?: User & { role: Role }) {
    // Reuses the WO read scope (including the mechanic assignment filter)
    // so a payment listing can never leak an order the user cannot see.
    await this.findOne(id, user);

    const payments = await this.prisma.workOrderPayment.findMany({
      where: { workOrderId: id },
      orderBy: { paidAt: 'asc' },
    });

    return payments.map((payment) => this.toPaymentResponse(payment));
  }

  /**
   * Registers a consumption event in the append-only log. Stock deducted by
   * `used`/`depleted` events is NOT restored if the work order is cancelled
   * afterwards — accepted MVP limitation, corrections happen via manual
   * stock adjustments.
   */
  async addConsumptionEvent(
    id: string,
    dto: CreateConsumptionEventDto,
    user?: User & { role: Role }
  ) {
    let mechanicEmployeeId: string | null = null;
    if (user?.role.name === RoleName.Mechanic) {
      mechanicEmployeeId = await this.findMechanicEmployeeId(user.id);
      if (!mechanicEmployeeId) {
        throw this.workOrderNotFound();
      }
    }

    const event = await this.prisma.$transaction(async (tx) => {
      const workOrder = await tx.workOrder.findUnique({
        where: {
          id,
          isActive: true,
          ...(mechanicEmployeeId !== null && {
            employeeId: mechanicEmployeeId,
          }),
        },
      });

      if (!workOrder) {
        throw this.workOrderNotFound();
      }

      if (
        workOrder.status !== WorkOrderStatus.pending &&
        workOrder.status !== WorkOrderStatus.in_progress
      ) {
        throw new ConflictException({
          message: 'Cannot register consumption on a closed work order',
          errorCode: 'WORK_ORDER_CLOSED',
        });
      }

      const product = await tx.product.findUnique({
        where: { id: dto.productId, isActive: true },
      });

      if (!product) {
        throw new NotFoundException({
          message: 'Product not found or inactive',
          errorCode: 'PRODUCT_NOT_FOUND',
        });
      }

      if (product.consumptionType === 'direct' && dto.type !== 'used') {
        throw new BadRequestException({
          message: `Event type '${dto.type}' is not allowed for direct-consumption products`,
          errorCode: 'CONSUMPTION_TYPE_NOT_ALLOWED',
        });
      }

      if (dto.type === 'used') {
        if (!dto.quantity || dto.quantity <= 0) {
          throw new BadRequestException({
            message: "A positive quantity is required for 'used' events",
            errorCode: 'CONSUMPTION_QUANTITY_REQUIRED',
          });
        }
        await this.stockService.consumeFifo(
          tx,
          product.id,
          dto.quantity,
          {
            movementType: 'service_usage',
            reason: `WO ${workOrder.orderNumber} consumption (used)`,
            workOrderId: workOrder.id,
          },
          'Insufficient stock to register the consumption'
        );
      }

      if (dto.type === 'depleted') {
        // Containers have no individual identity: the open-container balance
        // is global per product (opened events minus depleted events).
        const [openedCount, depletedCount] = await Promise.all([
          tx.workOrderConsumptionEvent.count({
            where: { productId: product.id, type: 'opened' },
          }),
          tx.workOrderConsumptionEvent.count({
            where: { productId: product.id, type: 'depleted' },
          }),
        ]);

        if (openedCount - depletedCount <= 0) {
          throw new ConflictException({
            message: 'No open container exists for this product',
            errorCode: 'NO_OPEN_CONTAINER',
          });
        }

        await this.stockService.consumeFifo(
          tx,
          product.id,
          1,
          {
            movementType: 'service_usage',
            reason: `WO ${workOrder.orderNumber} container depleted`,
            workOrderId: workOrder.id,
          },
          'Insufficient stock to register the consumption'
        );
      }

      return tx.workOrderConsumptionEvent.create({
        data: {
          workOrderId: id,
          productId: product.id,
          type: dto.type,
          quantity: dto.type === 'used' ? dto.quantity : null,
          registeredById: user?.id ?? '',
        },
        include: { product: true, registeredBy: true },
      });
    });

    return this.toConsumptionResponse(event);
  }

  async listConsumptionEvents(id: string, user?: User & { role: Role }) {
    // Reuses the WO read scope (including the mechanic assignment filter)
    // so the log can never leak an order the user cannot see.
    await this.findOne(id, user);

    const events = await this.prisma.workOrderConsumptionEvent.findMany({
      where: { workOrderId: id },
      orderBy: { createdAt: 'asc' },
      include: { product: true, registeredBy: true },
    });

    return events.map((event) => this.toConsumptionResponse(event));
  }

  private toConsumptionResponse(event: {
    id: string;
    workOrderId: string;
    productId: string;
    type: string;
    quantity: number | null;
    registeredById: string;
    createdAt: Date;
    product: {
      id: string;
      code: string;
      name: string;
      consumptionType: string;
    };
    registeredBy: { id: string; name: string };
  }): ConsumptionEventResponseDto {
    return plainToInstance(
      ConsumptionEventResponseDto,
      {
        ...event,
        product: {
          id: event.product.id,
          code: event.product.code,
          name: event.product.name,
          consumptionType: event.product.consumptionType,
        },
        registeredBy: {
          id: event.registeredBy.id,
          name: event.registeredBy.name,
        },
      },
      { excludeExtraneousValues: true }
    );
  }

  async remove(id: string) {
    await this.findOne(id);

    const removed = await this.prisma.workOrder.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
      include: WORK_ORDER_INCLUDE,
    });

    return this.toResponse(removed);
  }

  private readyNotificationBody(workOrder: {
    client?: { name: string } | null;
    vehicle?: { plate: string; brand: string; model: string } | null;
  }): string {
    if (workOrder.client && workOrder.vehicle) {
      const { brand, model, plate } = workOrder.vehicle;
      return `Cliente: ${workOrder.client.name} — Vehículo: ${brand} ${model} (${plate})`;
    }
    return 'La orden de trabajo está lista para entrega';
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

  private async ensureEmployeeExists(employeeId: string): Promise<void> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId, isActive: true },
    });
    if (!employee) {
      throw new NotFoundException({
        message: 'Employee not found or inactive',
        errorCode: 'EMPLOYEE_NOT_FOUND',
      });
    }
  }

  private async ensureBranchExists(branchId: string): Promise<void> {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId, isActive: true },
    });
    if (!branch) {
      throw new NotFoundException({
        message: 'Branch not found or inactive',
        errorCode: 'BRANCH_NOT_FOUND',
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

  private computeTotal(
    serviceLines: Array<{ subtotal: Prisma.Decimal }>
  ): Prisma.Decimal {
    const sum = serviceLines.reduce(
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
    employee?: { id: string; name: string } | null;
    branch?: { id: string; name: string } | null;
    client?: { id: string; name: string };
    vehicle?: { id: string; plate: string; brand: string; model: string };
    payments?: Array<{
      id: string;
      amount: Prisma.Decimal;
      paymentMethod: string;
      note: string | null;
      paidAt: Date;
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

    const totalAmount = Number(workOrder.totalAmount);
    const paidAmount = (workOrder.payments ?? []).reduce(
      (total, payment) => total + Number(payment.amount),
      0
    );
    const paymentStatus =
      paidAmount <= 0
        ? 'pending'
        : paidAmount < totalAmount
          ? 'partial'
          : 'paid';

    return plainToInstance(
      WorkOrderResponseDto,
      {
        ...workOrder,
        totalAmount: totalAmount.toFixed(2),
        paidAmount: paidAmount.toFixed(2),
        paymentStatus,
        employee: workOrder.employee
          ? { id: workOrder.employee.id, name: workOrder.employee.name }
          : null,
        branch: workOrder.branch
          ? { id: workOrder.branch.id, name: workOrder.branch.name }
          : null,
        client: workOrder.client
          ? { id: workOrder.client.id, name: workOrder.client.name }
          : undefined,
        vehicle: workOrder.vehicle
          ? {
              id: workOrder.vehicle.id,
              plate: workOrder.vehicle.plate,
              brand: workOrder.vehicle.brand,
              model: workOrder.vehicle.model,
            }
          : undefined,
        services: services ?? [],
      },
      { excludeExtraneousValues: true }
    );
  }

  private toPaymentResponse(payment: {
    id: string;
    workOrderId: string;
    amount: Prisma.Decimal;
    paymentMethod: string;
    note: string | null;
    paidAt: Date;
    createdAt: Date;
    updatedAt: Date;
  }): WorkOrderPaymentResponseDto {
    return plainToInstance(
      WorkOrderPaymentResponseDto,
      { ...payment, amount: Number(payment.amount).toFixed(2) },
      { excludeExtraneousValues: true }
    );
  }
}
